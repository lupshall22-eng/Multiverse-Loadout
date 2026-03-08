from __future__ import annotations
from sqlalchemy import String, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.db_base import Base  # if your Base is elsewhere, change this import

class ProgressSnapshot(Base):
    __tablename__ = "progress_snapshot"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    wallet: Mapped[str] = mapped_column(String(80), index=True)
    collection_id: Mapped[str] = mapped_column(String(40), index=True)

    total_tokens: Mapped[int] = mapped_column(Integer)
    owned_count: Mapped[int] = mapped_column(Integer)
    completion_pct: Mapped[float] = mapped_column(Float)

    # unix epoch seconds
    updated_at: Mapped[int] = mapped_column(Integer, index=True)