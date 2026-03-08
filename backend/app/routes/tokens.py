import asyncio
import httpx
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import TokenMetaCache
from app.services.enjin import enjin_graphql

router = APIRouter(prefix="/tokens", tags=["tokens"])

TOKEN_META_TTL = timedelta(days=7)
IPFS_GATEWAY = "https://ipfs.io/ipfs/"
MAX_IDS_PER_REQUEST = 120
CONCURRENCY = 8

# How deep we’ll scan GetTokens to find requested tokenIds (safety cap)
MAX_TOKEN_SCAN = 5000
PAGE_SIZE = 200


def resolve_uri(uri: str) -> str:
    uri = (uri or "").strip()
    if uri.startswith("ipfs://"):
        return IPFS_GATEWAY + uri.replace("ipfs://", "")
    return uri


def _pick_first_string(*vals) -> str | None:
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def extract_image_from_meta(meta: dict) -> str | None:
    """
    Enjin-friendly:
      - media[] where type startswith image/ -> uri
      - fallback_image
      - image/image_url
    """
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

    return _pick_first_string(
        meta.get("image"),
        meta.get("image_url"),
        meta.get("imageUrl"),
    )


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


def attr_value(attrs: list[dict], key: str) -> str | None:
    for a in attrs or []:
        if (a.get("key") or "").lower() == key.lower():
            v = a.get("value")
            return v.strip() if isinstance(v, str) else v
    return None


def fill_template(uri: str, token_id: str) -> str:
    """
    If uri contains {id}, replace with tokenId.
    """
    u = (uri or "").strip()
    if "{id}" in u:
        return u.replace("{id}", str(token_id))
    return u


async def get_token_uri_map_via_gettokens(collection_id: str, want_ids: list[str]) -> dict[str, str]:
    """
    Use GetTokens(collectionId, after, first) to fetch token attributes and extract 'uri'
    for the requested token ids.
    """
    want_set = set(want_ids)
    found: dict[str, str] = {}

    q = """
    query GetTokenNameAndUriIndex($collectionId: BigInt!, $after: String, $first: Int!) {
      GetTokens(collectionId: $collectionId, after: $after, first: $first) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            tokenId
            attributes { key value }
          }
        }
      }
    }
    """

    after = None
    scanned = 0

    while True:
        data = await enjin_graphql(
            q,
            {"collectionId": int(collection_id), "after": after, "first": PAGE_SIZE},
        )
        gt = data.get("GetTokens")
        if not gt:
            break

        edges = gt.get("edges") or []
        for e in edges:
            node = e.get("node") or {}
            tid = str(node.get("tokenId") or "")
            if not tid:
                continue

            scanned += 1
            if scanned > MAX_TOKEN_SCAN:
                return found

            if tid in want_set and tid not in found:
                attrs = node.get("attributes") or []
                uri = attr_value(attrs, "uri")
                if isinstance(uri, str) and uri.strip():
                    found[tid] = uri.strip()

            if len(found) == len(want_set):
                return found

        page = gt.get("pageInfo") or {}
        if not page.get("hasNextPage"):
            break
        after = page.get("endCursor")
        if not after:
            break

    return found


async def get_token_uri_direct(collection_id: str, token_id: str) -> str | None:
    """
    Fallback direct token lookup when GetTokens scanning doesn't return a uri.
    """
    q = """
    query GetToken($collectionId: BigInt!, $tokenId: EncodableTokenIdInput!) {
      GetToken(collectionId: $collectionId, tokenId: $tokenId) {
        tokenId
        attributes { key value }
      }
    }
    """

    token_input = {"stringId": str(token_id)}

    try:
        data = await enjin_graphql(
            q,
            {"collectionId": int(collection_id), "tokenId": token_input},
        )
        tok = data.get("GetToken") or {}
        attrs = tok.get("attributes") or []
        uri = attr_value(attrs, "uri")
        return uri.strip() if isinstance(uri, str) and uri.strip() else None
    except Exception:
        return None


async def fetch_one_token_meta(token_id: str, token_uri: str) -> dict:
    url = fill_template(token_uri, token_id)
    meta = await fetch_json(url)

    name = None
    image = None
    final_uri = url if isinstance(url, str) and url.strip() else None

    if isinstance(meta, dict):
        if isinstance(meta.get("name"), str) and meta["name"].strip():
            name = meta["name"].strip()

        img = extract_image_from_meta(meta)
        if isinstance(img, str) and img.strip():
            image = resolve_uri(img.strip())

        # Optional fallback if metadata itself references a source uri/external_url
        meta_uri = _pick_first_string(
            meta.get("uri"),
            meta.get("external_url"),
            meta.get("externalUrl"),
        )
        if not final_uri and meta_uri:
            final_uri = meta_uri.strip()

    return {
        "tokenId": token_id,
        "name": name,
        "image": image,
        "uri": final_uri,
    }


@router.get("/meta/{collection_id}")
async def token_meta(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    ids: str = Query(..., description="Comma-separated token ids, e.g. 1,2,3"),
    refresh: bool = Query(False),
):
    cid = str(collection_id)
    token_ids = [t.strip() for t in ids.split(",") if t.strip()]
    if not token_ids:
        raise HTTPException(400, detail="No token ids supplied.")
    if len(token_ids) > MAX_IDS_PER_REQUEST:
        raise HTTPException(400, detail=f"Too many ids. Max {MAX_IDS_PER_REQUEST} per request.")

    now = datetime.now(timezone.utc)

    # 1) Return cached if fresh
    cached_map: dict[str, dict] = {}
    if not refresh:
        rows = (
            await db.execute(
                select(TokenMetaCache)
                .where(TokenMetaCache.collection_id == cid)
                .where(TokenMetaCache.token_id.in_(token_ids))
            )
        ).scalars().all()

        for r in rows:
            cached_at = r.cached_at
            if cached_at and cached_at.tzinfo is None:
                cached_at = cached_at.replace(tzinfo=timezone.utc)
            if cached_at and (now - cached_at) < TOKEN_META_TTL:
                cached_map[r.token_id] = {
                    "tokenId": r.token_id,
                    "name": r.name,
                    "image": r.image,
                    "uri": r.uri,
                    "cached": True,
                }

    missing = [t for t in token_ids if t not in cached_map]
    if not missing:
        return {"collectionId": cid, "items": [cached_map[t] for t in token_ids]}

    # 2) Get token URIs (bulk) via GetTokens
    uri_map = await get_token_uri_map_via_gettokens(cid, missing)

    # 3) Fallback direct lookup for any token IDs still missing uri
    still_missing_uri = [tid for tid in missing if tid not in uri_map]
    if still_missing_uri:
        direct_results = await asyncio.gather(
            *[get_token_uri_direct(cid, tid) for tid in still_missing_uri],
            return_exceptions=True,
        )
        for tid, direct_uri in zip(still_missing_uri, direct_results):
            if isinstance(direct_uri, str) and direct_uri.strip():
                uri_map[tid] = direct_uri.strip()

    # 4) Fetch metadata json in parallel (only for those with a uri)
    sem = asyncio.Semaphore(CONCURRENCY)

    async def run_one(tid: str):
        async with sem:
            uri = uri_map.get(tid)
            if not uri:
                return {"tokenId": tid, "name": None, "image": None, "uri": None}
            return await fetch_one_token_meta(tid, uri)

    fetched = await asyncio.gather(*[run_one(t) for t in missing], return_exceptions=True)

    # 5) Save to DB + build response map
    for obj in fetched:
        if isinstance(obj, Exception):
            continue

        tid = obj["tokenId"]

        row = (
            await db.execute(
                select(TokenMetaCache)
                .where(TokenMetaCache.collection_id == cid)
                .where(TokenMetaCache.token_id == tid)
            )
        ).scalar_one_or_none()

        if row:
            row.name = obj.get("name")
            row.image = obj.get("image")
            row.uri = obj.get("uri")
            row.cached_at = now
        else:
            db.add(
                TokenMetaCache(
                    collection_id=cid,
                    token_id=tid,
                    name=obj.get("name"),
                    image=obj.get("image"),
                    uri=obj.get("uri"),
                    cached_at=now,
                )
            )

        cached_map[tid] = {
            "tokenId": tid,
            "name": obj.get("name"),
            "image": obj.get("image"),
            "uri": obj.get("uri"),
            "cached": False,
        }

    await db.commit()

    return {
        "collectionId": cid,
        "items": [
            cached_map.get(
                t,
                {"tokenId": t, "name": None, "image": None, "uri": None, "cached": False},
            )
            for t in token_ids
        ],
    }