from fastapi import APIRouter, Query
from app.services.enjin import enjin_graphql

router = APIRouter(prefix="/enjin", tags=["enjin"])


@router.get("/wallet/{address}")
async def enjin_wallet_tokens(
    address: str,
    limit: int = Query(200, ge=1, le=2000, description="Max tokenAccounts to return (approx)"),
):
    """
    Returns token accounts for a wallet (paged). Raw building block.
    """
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

    edges = []
    after = None

    while True:
        data = await enjin_graphql(q, {"account": address, "after": after})
        wallet = data.get("GetWallet")
        if not wallet:
            return {"address": address, "count": 0, "tokenAccounts": [], "note": "Wallet not found or empty"}

        ta = wallet["tokenAccounts"]
        edges.extend(ta["edges"])

        if len(edges) >= limit:
            break
        if not ta["pageInfo"]["hasNextPage"]:
            break
        after = ta["pageInfo"]["endCursor"]

    simplified = []
    for e in edges[:limit]:
        n = e["node"]
        simplified.append(
            {
                "collectionId": str(n["token"]["collection"]["collectionId"]),
                "tokenId": str(n["token"]["tokenId"]),
                "balance": int(n.get("balance") or 0),
                "reservedBalance": int(n.get("reservedBalance") or 0),
            }
        )

    return {"address": address, "count": len(simplified), "tokenAccounts": simplified}


@router.get("/collection/{collection_id}/tokens")
async def enjin_collection_tokens(
    collection_id: int,
    limit: int = Query(500, ge=1, le=20000, description="Max tokenIds to return"),
):
    """
    Returns tokenIds for a collection (paged). Useful for caching later.
    """
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

    token_ids: list[str] = []
    after = None

    while True:
        data = await enjin_graphql(q, {"cid": int(collection_id), "after": after})
        col = data.get("GetCollection")
        if not col:
            return {"collectionId": str(collection_id), "count": 0, "tokenIds": [], "note": "Collection not found"}

        toks = col["tokens"]
        token_ids.extend([str(edge["node"]["tokenId"]) for edge in toks["edges"]])

        if len(token_ids) >= limit:
            token_ids = token_ids[:limit]
            break
        if not toks["pageInfo"]["hasNextPage"]:
            break
        after = toks["pageInfo"]["endCursor"]

    return {"collectionId": str(collection_id), "count": len(token_ids), "tokenIds": token_ids}