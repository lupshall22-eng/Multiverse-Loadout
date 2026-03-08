import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CollectionMetaCache, CollectionTokenCache
from app.services.enjin import enjin_graphql

router = APIRouter(prefix="/wallet", tags=["wallet"])


def _safe_json_load(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass
    return []


@router.post("/request-account")
async def request_account() -> dict:
    q = """
    query RequestAccount {
      RequestAccount {
        qrCode
        verificationId
      }
    }
    """
    data = await enjin_graphql(q, {})
    req = data.get("RequestAccount") or {}
    qr_code = req.get("qrCode")
    verification_id = req.get("verificationId")

    if not qr_code or not verification_id:
        raise HTTPException(status_code=500, detail="Failed to start wallet verification.")

    return {
        "qrCode": qr_code,
        "verificationId": verification_id,
    }


@router.get("/verify/{verification_id}")
async def verify_account(verification_id: str) -> dict:
    verification_id = (verification_id or "").strip()
    if not verification_id:
        raise HTTPException(status_code=400, detail="verificationId is required.")

    q = """
    query GetAccountVerified($verification_id: String!) {
      GetAccountVerified(verificationId: $verification_id) {
        verified
        account {
          publicKey
          address
        }
      }
    }
    """
    data = await enjin_graphql(q, {"verification_id": verification_id})
    res = data.get("GetAccountVerified") or {}

    verified = bool(res.get("verified"))
    account = res.get("account") or {}
    address = account.get("address")

    return {
        "verified": verified,
        "address": address if verified else None,
        "publicKey": account.get("publicKey") if verified else None,
    }


@router.get("/{address}/collections")
async def wallet_collections(address: str, db: AsyncSession = Depends(get_db)):
    address = (address or "").strip()
    if not address:
        raise HTTPException(status_code=400, detail="Wallet address is required.")

    q = """
    query WalletTokens($account: String, $after: String) {
      GetWallet(account: $account) {
        tokenAccounts(after: $after, first: 200) {
          pageInfo { endCursor hasNextPage }
          edges {
            node {
              balance
              reservedBalance
              token {
                tokenId
                collection { collectionId }
              }
            }
          }
        }
      }
    }
    """

    owned_by_collection: dict[str, set[str]] = defaultdict(set)
    after = None

    while True:
        data = await enjin_graphql(q, {"account": address, "after": after})
        wallet = data.get("GetWallet")
        if not wallet:
            break

        token_accounts = wallet["tokenAccounts"]
        for edge in token_accounts["edges"]:
            node = edge["node"]
            bal = int(node.get("balance") or 0) + int(node.get("reservedBalance") or 0)
            if bal <= 0:
                continue

            cid = str(node["token"]["collection"]["collectionId"])
            tid = str(node["token"]["tokenId"])
            owned_by_collection[cid].add(tid)

        if not token_accounts["pageInfo"]["hasNextPage"]:
            break

        after = token_accounts["pageInfo"]["endCursor"]

    if not owned_by_collection:
        return {"address": address, "items": []}

    collection_ids = list(owned_by_collection.keys())

    meta_rows = (
        await db.execute(
            select(CollectionMetaCache).where(CollectionMetaCache.collection_id.in_(collection_ids))
        )
    ).scalars().all()
    meta_map = {str(r.collection_id): r for r in meta_rows}

    token_rows = (
        await db.execute(
            select(CollectionTokenCache).where(CollectionTokenCache.collection_id.in_(collection_ids))
        )
    ).scalars().all()
    token_map = {str(r.collection_id): r for r in token_rows}

    items = []
    for cid, owned_set in owned_by_collection.items():
        token_row = token_map.get(cid)
        token_ids = _safe_json_load(token_row.token_ids_json if token_row else None)
        total_tokens = len(token_ids)

        owned_count = len(owned_set)
        completion_pct = round((owned_count / total_tokens) * 100, 2) if total_tokens > 0 else 0.0

        meta = meta_map.get(cid)
        items.append(
            {
                "collectionId": cid,
                "name": meta.name if meta and meta.name else f"Collection {cid}",
                "description": meta.description if meta else None,
                "image": meta.image if meta else None,
                "ownedCount": owned_count,
                "totalTokens": total_tokens,
                "completionPct": completion_pct,
                "isIndexed": bool(token_row and getattr(token_row, "is_complete", False)),
            }
        )

    items.sort(
        key=lambda x: (
            -x["completionPct"],
            -x["ownedCount"],
            x["name"].lower(),
        )
    )

    return {
        "address": address,
        "count": len(items),
        "items": items,
    }