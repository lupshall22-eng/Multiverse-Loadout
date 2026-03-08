from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CollectionMetaCache

router = APIRouter(tags=["collections"])

# Put your JSON index here:
# backend/app/data/collections_index.json
INDEX_PATH = Path(__file__).resolve().parents[1] / "data" / "collections_index.json"


def _load_index() -> list[dict[str, str]]:
    if not INDEX_PATH.exists():
        return []
    try:
        raw = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []

    out: list[dict[str, str]] = []
    for it in raw or []:
        cid = str(it.get("id") or it.get("collectionId") or "").strip()
        name = str(it.get("name") or "").strip()
        if cid and name:
            out.append({"collectionId": cid, "name": name})
    return out


def _search_index(items: list[dict[str, str]], query: str) -> list[dict[str, str]]:
    q = (query or "").strip().lower()
    if not q:
        return items
    return [it for it in items if q in it["name"].lower()]


@router.get("/collections")
async def list_collections(
    query: str = Query(default="", max_length=80),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    JSON-backed collections search with DB-enriched metadata.
    This allows searching ALL known collections without requiring cache/DB,
    while still returning cached image/description when available.
    """
    items = _load_index()
    filtered = _search_index(items, query)

    total = len(filtered)
    page = filtered[offset : offset + limit]

    page_ids = [str(it["collectionId"]) for it in page]
    meta_map: dict[str, CollectionMetaCache] = {}

    if page_ids:
        rows = (
            await db.execute(
                select(CollectionMetaCache).where(CollectionMetaCache.collection_id.in_(page_ids))
            )
        ).scalars().all()

        meta_map = {str(r.collection_id): r for r in rows}

    enriched: list[dict[str, Any]] = []
    for it in page:
        cid = str(it["collectionId"])
        meta = meta_map.get(cid)

        enriched.append(
            {
                "collectionId": cid,
                "name": it["name"],
                "description": meta.description if meta else None,
                "image": meta.image if meta else None,
                "cachedAt": meta.cached_at.isoformat() if meta and meta.cached_at else None,
            }
        )

    return {
        "items": enriched,
        "limit": limit,
        "offset": offset,
        "total": total,
        "source": "index+meta-cache",
        "indexFileFound": INDEX_PATH.exists(),
    }