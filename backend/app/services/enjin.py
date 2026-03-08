import httpx
from app.config import ENJIN_API_URL, ENJIN_API_KEY


class EnjinError(RuntimeError):
    pass


async def enjin_graphql(query: str, variables: dict | None = None) -> dict:
    headers = {
        "Authorization": ENJIN_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {"query": query, "variables": variables or {}}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(ENJIN_API_URL, json=payload, headers=headers)

    if r.status_code != 200:
        raise EnjinError(f"Enjin HTTP {r.status_code}: {r.text}")

    data = r.json()
    if "errors" in data and data["errors"]:
        raise EnjinError(str(data["errors"]))

    return data.get("data") or {}