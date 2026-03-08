from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone


class TokenMetaCache(Base):
    __tablename__ = "token_meta_cache"

    id = Column(Integer, primary_key=True)
    collection_id = Column(String, index=True, nullable=False)
    token_id = Column(String, index=True, nullable=False)

    name = Column(String, nullable=True)
    image = Column(String, nullable=True)
    uri = Column(String, nullable=True)

    cached_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # (optional) enforce uniqueness per (collection_id, token_id) in your migration later


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=True)
    profile_public = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    wallets = relationship("Wallet", back_populates="user")


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, index=True)
    primary = Column(Boolean, default=True)

    user_id = Column(Integer, ForeignKey("users.id"))
    user = relationship("User", back_populates="wallets")


# ─────────────────────────────────────────────
# Collection token list cache
class CollectionTokenCache(Base):
    __tablename__ = "collection_token_cache"

    collection_id = Column(String, primary_key=True)
    token_ids_json = Column(Text, nullable=False)
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # NEW: resume support for large collections
    next_cursor = Column(String, nullable=True)
    is_complete = Column(Boolean, nullable=False, default=False, server_default="0")


# ─────────────────────────────────────────────
# Collection metadata cache (name/image/description)
class CollectionMetaCache(Base):
    __tablename__ = "collection_meta_cache"

    collection_id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    image = Column(String, nullable=True)
    cached_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ─────────────────────────────────────────────
# Progress snapshot cache
class ProgressSnapshot(Base):
    __tablename__ = "progress_snapshot"

    id = Column(Integer, primary_key=True, index=True)
    address = Column(String, index=True, nullable=False)
    collection_id = Column(String, index=True, nullable=False)

    total_tokens = Column(Integer, nullable=False, default=0)
    owned_count = Column(Integer, nullable=False, default=0)
    missing_count = Column(Integer, nullable=False, default=0)
    completion_pct = Column(Float, nullable=False, default=0.0)

    owned_token_ids_json = Column(Text, nullable=False, default="[]")
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)