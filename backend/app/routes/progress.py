import json
import time
import httpx
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ProgressSnapshot, CollectionTokenCache, CollectionMetaCache
from app.services.enjin import enjin_graphql

router = APIRouter(prefix="/progress", tags=["progress"])

# ─────────────────────────────────────────────
# TTLs
SNAPSHOT_TTL = timedelta(hours=6)
COLLECTION_TOKENS_TTL = timedelta(days=7)
COLLECTION_META_TTL = timedelta(days=7)

REFRESH_COOLDOWN_SECONDS = 600
_LAST_REFRESH_AT: dict[tuple[str, str], float] = {}

IPFS_GATEWAY = "https://ipfs.io/ipfs/"


# ─────────────────────────────────────────────
def sort_token_ids(ids: list[str]) -> list[str]:
    def keyfn(s: str):
        return (0, int(s)) if s.isdigit() else (1, s)
    return sorted(ids, key=keyfn)


def resolve_uri(uri: str) -> str:
    uri = (uri or "").strip()
    if uri.startswith("ipfs://"):
        return IPFS_GATEWAY + uri.replace("ipfs://", "")
    return uri


def attr_value(attrs: list[dict], key: str) -> str | None:
    for a in attrs or []:
        if (a.get("key") or "").lower() == key.lower():
            v = a.get("value")
            return v.strip() if isinstance(v, str) else v
    return None


async def fetch_json(url: str) -> dict | None:
    url = resolve_uri(url)
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(
                url,
                headers={"Accept": "application/json", "User-Agent": "ECT/1.0"},
            )
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


# ─────────────────────────────────────────────
def _pick_first_string(*vals) -> str | None:
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def extract_image_from_meta(meta: dict) -> str | None:
    if not isinstance(meta, dict):
        return None

    media = meta.get("media")
    if isinstance(media, list):
        for m in media:
            if not isinstance(m, dict):
                continue
            mtype = str(m.get("type") or "")
            muri = m.get("uri")
            if isinstance(muri, str) and muri.strip() and mtype.lower().startswith("image/"):
                return muri.strip()

    img = _pick_first_string(meta.get("fallback_image"), meta.get("fallbackImage"))
    if img:
        return img

    img = _pick_first_string(
        meta.get("image"),
        meta.get("image_url"),
        meta.get("imageUrl"),
        meta.get("icon"),
        meta.get("icon_url"),
        meta.get("logo"),
        meta.get("logo_url"),
        meta.get("thumbnail"),
        meta.get("thumbnail_url"),
        meta.get("banner"),
        meta.get("banner_url"),
        meta.get("cover"),
        meta.get("cover_url"),
    )
    if img:
        return img

    props = meta.get("properties")
    if isinstance(props, dict):
        img = _pick_first_string(
            props.get("image"),
            props.get("image_url"),
            props.get("imageUrl"),
            props.get("icon"),
            props.get("logo"),
            props.get("banner"),
            props.get("cover"),
        )
        if img:
            return img

    images = meta.get("images")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, str) and first.strip():
            return first.strip()
        if isinstance(first, dict):
            img = _pick_first_string(first.get("url"), first.get("src"), first.get("image"))
            if img:
                return img

    return None


# ─────────────────────────────────────────────
async def add_to_tracked(collection_ids: list[str]) -> None:
    if not collection_ids:
        return
    m = """
    mutation Track($ids: [String!]!) {
      AddToTracked(type: COLLECTION, chainIds: $ids)
    }
    """
    try:
        await enjin_graphql(m, {"ids": [str(c) for c in collection_ids]})
    except Exception:
        pass


# ─────────────────────────────────────────────
async def get_or_fetch_collection_token_ids(db: AsyncSession, collection_id: str, limit: int) -> list[str]:
    row = (await db.execute(
        select(CollectionTokenCache).where(CollectionTokenCache.collection_id == collection_id)
    )).scalar_one_or_none()

    now = datetime.now(timezone.utc)

    existing_ids: list[str] = []
    after = None
    is_complete = False

    if row:
        try:
            existing_ids = json.loads(row.token_ids_json or "[]")
        except Exception:
            existing_ids = []

        after = row.next_cursor
        is_complete = bool(row.is_complete)

        if row.cached_at:
            cached_at = row.cached_at
            if cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=timezone.utc)

            # If cache is fresh and complete, return immediately
            if is_complete and (now - cached_at < COLLECTION_TOKENS_TTL):
                return existing_ids[:limit]

    q = """
    query GetCollectionTokens($cid: BigInt!, $after: String) {
      GetCollection(collectionId: $cid) {
        tokens(after: $after) {
          pageInfo { endCursor hasNextPage }
          edges { node { tokenId } }
        }
      }
    }
    """

    ids = list(existing_ids)
    seen = set(ids)

    while True:
        data = await enjin_graphql(q, {"cid": int(collection_id), "after": after})
        col = data.get("GetCollection")
        if not col:
            break

        toks = col["tokens"]
        page_ids = [str(e["node"]["tokenId"]) for e in toks["edges"]]

        for tid in page_ids:
            if tid not in seen:
                ids.append(tid)
                seen.add(tid)

        ids = sort_token_ids(ids)

        next_cursor = toks["pageInfo"]["endCursor"]
        has_next = toks["pageInfo"]["hasNextPage"]

        # Save partial progress after every page
        if row:
            row.token_ids_json = json.dumps(ids)
            row.cached_at = now
            row.next_cursor = next_cursor if has_next else None
            row.is_complete = not has_next
        else:
            row = CollectionTokenCache(
                collection_id=collection_id,
                token_ids_json=json.dumps(ids),
                cached_at=now,
                next_cursor=next_cursor if has_next else None,
                is_complete=not has_next,
            )
            db.add(row)

        await db.commit()

        if len(ids) >= limit:
            ids = ids[:limit]
            if row:
                row.token_ids_json = json.dumps(ids)
                row.cached_at = now
                row.next_cursor = next_cursor if has_next else None
                row.is_complete = not has_next
                await db.commit()
            break

        if not has_next:
            break

        after = next_cursor
        if not after:
            break

    return ids[:limit]


# ─────────────────────────────────────────────
async def fetch_collection_attributes(collection_id: str) -> list[dict]:
    await add_to_tracked([collection_id])

    q = """
    query GetCollectionAttrs($cid: BigInt!) {
      GetCollection(collectionId: $cid) {
        attributes { key value }
      }
    }
    """
    data = await enjin_graphql(q, {"cid": int(collection_id)})
    col = data.get("GetCollection") or {}
    return col.get("attributes") or []


def fill_collection_uri_template(uri: str, token_id: str | None) -> str:
    if not isinstance(uri, str):
        return ""
    u = uri.strip()
    if "{id}" in u and token_id:
        return u.replace("{id}", str(token_id))
    return u


async def find_collection_metadata_uri_via_tokens(collection_id: str, max_scan: int = 120) -> str | None:
    q = """
query GetCollectionTokenUris($collectionId: BigInt!, $after: String, $first: Int!) {
  GetTokens(collectionId: $collectionId, after: $after, first: $first) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        attributes { key value }
      }
    }
  }
}
"""

    scanned = 0
    after = None

    while True:
        data = await enjin_graphql(q, {"collectionId": int(collection_id), "after": after, "first": 200})
        gt = data.get("GetTokens")
        if not gt:
            return None

        for edge in gt.get("edges") or []:
            attrs = (edge.get("node") or {}).get("attributes") or []
            uri = attr_value(attrs, "uri")
            if isinstance(uri, str) and uri.strip():
                return uri.strip()

            scanned += 1
            if scanned >= max_scan:
                return None

        page = gt.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            return None

        after = page.get("endCursor")
        if not after:
            return None


async def get_or_fetch_collection_meta(db: AsyncSession, collection_id: str, limit: int, force: bool = False) -> dict:
    row = (await db.execute(
        select(CollectionMetaCache).where(CollectionMetaCache.collection_id == collection_id)
    )).scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if (not force) and row and row.cached_at:
        cached_at = row.cached_at
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        if now - cached_at < COLLECTION_META_TTL:
            return {"name": row.name, "description": row.description, "image": row.image}

    name = None
    description = None
    image = None

    token_ids: list[str] = []
    try:
        token_ids = await get_or_fetch_collection_token_ids(db, collection_id, limit)
    except Exception:
        token_ids = []

    cover_token_id = token_ids[0] if token_ids else None

    try:
        attrs = await fetch_collection_attributes(collection_id)

        nm = attr_value(attrs, "name")
        if isinstance(nm, str) and nm.strip():
            name = nm.strip()

        uri = attr_value(attrs, "uri")
        if isinstance(uri, str) and uri.strip():
            uri_filled = fill_collection_uri_template(uri.strip(), cover_token_id)
            meta = await fetch_json(uri_filled)
            if isinstance(meta, dict):
                if isinstance(meta.get("name"), str) and meta["name"].strip():
                    name = meta["name"].strip()
                if isinstance(meta.get("description"), str) and meta["description"].strip():
                    description = meta["description"].strip()

                img = extract_image_from_meta(meta)
                if isinstance(img, str) and img.strip():
                    image = resolve_uri(img.strip())
    except Exception:
        pass

    if not image:
        try:
            uri2 = await find_collection_metadata_uri_via_tokens(collection_id, max_scan=120)
            if isinstance(uri2, str) and uri2.strip():
                uri2_filled = fill_collection_uri_template(uri2.strip(), cover_token_id)
                meta2 = await fetch_json(uri2_filled)
                if isinstance(meta2, dict):
                    if not name and isinstance(meta2.get("name"), str) and meta2["name"].strip():
                        name = meta2["name"].strip()
                    if not description and isinstance(meta2.get("description"), str) and meta2["description"].strip():
                        description = meta2["description"].strip()
                    img2 = extract_image_from_meta(meta2)
                    if isinstance(img2, str) and img2.strip():
                        image = resolve_uri(img2.strip())
        except Exception:
            pass

    if row:
        row.name = name
        row.description = description
        row.image = image
        row.cached_at = now
    else:
        db.add(CollectionMetaCache(
            collection_id=collection_id,
            name=name,
            description=description,
            image=image,
            cached_at=now,
        ))

    await db.commit()
    return {"name": name, "description": description, "image": image}


# ─────────────────────────────────────────────
async def fetch_owned_set_for_collection(address: str, collection_id: str) -> set[str]:
    q = """
    query WalletTokens($account: String, $after: String) {
      GetWallet(account: $account) {
        tokenAccounts(after: $after, first: 200) {
          pageInfo { endCursor hasNextPage }
          edges {
            node {
              balance
              reservedBalance
              token { tokenId collection { collectionId } }
            }
          }
        }
      }
    }
    """

    owned: set[str] = set()
    after = None

    while True:
        data = await enjin_graphql(q, {"account": address, "after": after})
        wallet = data.get("GetWallet")
        if not wallet:
            break

        ta = wallet["tokenAccounts"]
        for e in ta["edges"]:
            n = e["node"]
            bal = int(n.get("balance") or 0) + int(n.get("reservedBalance") or 0)
            if bal <= 0:
                continue
            if str(n["token"]["collection"]["collectionId"]) == collection_id:
                owned.add(str(n["token"]["tokenId"]))

        if not ta["pageInfo"]["hasNextPage"]:
            break
        after = ta["pageInfo"]["endCursor"]

    return owned


# ─────────────────────────────────────────────
@router.get("/{address}/{collection_id}")
async def progress(
    address: str,
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20000, ge=1, le=20000),
    refresh: bool = Query(False, description="Bypass snapshot + force metadata refresh"),
):
    cid = str(collection_id)
    key = (address, cid)
    now_ts = time.time()
    now_dt = datetime.now(timezone.utc)

    if refresh:
        last = _LAST_REFRESH_AT.get(key)
        if last is not None and now_ts - last < REFRESH_COOLDOWN_SECONDS:
            wait = int(REFRESH_COOLDOWN_SECONDS - (now_ts - last))
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Refresh rate limited",
                    "message": f"Please wait {wait}s before refreshing again.",
                    "refreshAllowedInSeconds": wait,
                },
            )
        _LAST_REFRESH_AT[key] = now_ts

    meta = await get_or_fetch_collection_meta(db, cid, limit, force=refresh)

    # Snapshot path (serve cached progress if fresh)
    if not refresh:
        snap = (await db.execute(
            select(ProgressSnapshot)
            .where(ProgressSnapshot.address == address)
            .where(ProgressSnapshot.collection_id == cid)
            .order_by(ProgressSnapshot.id.desc())
        )).scalars().first()

        if snap and snap.synced_at:
            synced_at = snap.synced_at
            if synced_at.tzinfo is None:
                synced_at = synced_at.replace(tzinfo=timezone.utc)
            age = now_dt - synced_at

            if age < SNAPSHOT_TTL:
                owned = json.loads(snap.owned_token_ids_json or "[]")
                token_ids = await get_or_fetch_collection_token_ids(db, cid, limit)
                missing = [t for t in token_ids if t not in set(owned)]

                return {
                    "address": address,
                    "collectionId": cid,
                    "collectionName": meta.get("name"),
                    "collectionDescription": meta.get("description"),
                    "collectionImage": meta.get("image"),
                    "totalTokens": snap.total_tokens,
                    "ownedCount": snap.owned_count,
                    "missingCount": snap.missing_count,
                    "completionPct": snap.completion_pct,
                    "owned": owned[:5000],
                    "missing": missing[:5000],
                    "note": "owned/missing lists truncated to 5000 each",
                    "cached": True,
                    "cachedAgeSeconds": int(age.total_seconds()),
                    "refreshed": False,
                    "refreshAllowedInSeconds": 0,
                }

    # Live fetch path
    token_ids = await get_or_fetch_collection_token_ids(db, cid, limit)
    owned_set = await fetch_owned_set_for_collection(address, cid)

    owned = [t for t in token_ids if t in owned_set]
    missing = [t for t in token_ids if t not in owned_set]

    total = len(token_ids)
    owned_count = len(owned)
    missing_count = len(missing)
    completion_pct = round((owned_count / total) * 100, 2) if total else 0.0

    # Always insert a new snapshot row
    db.add(ProgressSnapshot(
        address=address,
        collection_id=cid,
        total_tokens=total,
        owned_count=owned_count,
        missing_count=missing_count,
        completion_pct=completion_pct,
        owned_token_ids_json=json.dumps(owned),
        synced_at=now_dt,
    ))
    await db.commit()

    return {
        "address": address,
        "collectionId": cid,
        "collectionName": meta.get("name"),
        "collectionDescription": meta.get("description"),
        "collectionImage": meta.get("image"),
        "totalTokens": total,
        "ownedCount": owned_count,
        "missingCount": missing_count,
        "completionPct": completion_pct,
        "owned": owned[:5000],
        "missing": missing[:5000],
        "note": "owned/missing lists truncated to 5000 each",
        "cached": False,
        "refreshed": refresh,
        "refreshAllowedInSeconds": 0,
    }