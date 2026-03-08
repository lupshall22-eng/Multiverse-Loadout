from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, distinct

from app.db_session import get_db  # change if your get_db is elsewhere
from app.models.leaderboard import ProgressSnapshot

router = APIRouter(tags=["leaderboard"])

@router.get("/leaderboard/top")
def leaderboard_top(
    limit: int = Query(default=25, ge=1, le=200),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Ranks wallets by:
      - completed_collections: count of collections at 100%
      - avg_completion_pct: average completion across unique collections
      - tracked_collections: number of collections the wallet has checked
    Uses latest snapshot per wallet+collection within the window.
    """
    now = int(time.time())
    since = now - days * 86400

    # latest snapshot per (wallet, collection_id)
    subq = (
        db.query(
            ProgressSnapshot.wallet.label("wallet"),
            ProgressSnapshot.collection_id.label("collection_id"),
            func.max(ProgressSnapshot.updated_at).label("max_ts"),
        )
        .filter(ProgressSnapshot.updated_at >= since)
        .group_by(ProgressSnapshot.wallet, ProgressSnapshot.collection_id)
        .subquery()
    )

    latest = (
        db.query(ProgressSnapshot)
        .join(
            subq,
            (ProgressSnapshot.wallet == subq.c.wallet)
            & (ProgressSnapshot.collection_id == subq.c.collection_id)
            & (ProgressSnapshot.updated_at == subq.c.max_ts),
        )
        .subquery()
    )

    completed_expr = case((latest.c.completion_pct >= 100.0, 1), else_=0)

    rows = (
        db.query(
            latest.c.wallet.label("wallet"),
            func.sum(completed_expr).label("completed_collections"),
            func.avg(latest.c.completion_pct).label("avg_completion_pct"),
            func.count(distinct(latest.c.collection_id)).label("tracked_collections"),
        )
        .group_by(latest.c.wallet)
        .order_by(
            func.sum(completed_expr).desc(),
            func.avg(latest.c.completion_pct).desc(),
            func.count(distinct(latest.c.collection_id)).desc(),
        )
        .limit(limit)
        .all()
    )

    return {
        "days": days,
        "items": [
            {
                "wallet": r.wallet,
                "completedCollections": int(r.completed_collections or 0),
                "avgCompletionPct": round(float(r.avg_completion_pct or 0.0), 2),
                "trackedCollections": int(r.tracked_collections or 0),
            }
            for r in rows
        ],
    }