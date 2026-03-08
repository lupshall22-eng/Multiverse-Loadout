from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
# Routers
from app.routes.progress import router as progress_router
from app.routes.tokens import router as tokens_router
from app.routes.collections import router as collections_router
from app.routes.wallet import router as wallet_router


app = FastAPI(
    title="Enjin Tracker API",
    version="0.1.0",
)

# CORS for local dev (frontend on localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000",
        "https://multiverse-loadout.vercel.app"],  # change to ["http://localhost:3000"] later if you want tighter security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers (MUST be after app is created)
app.include_router(progress_router)
app.include_router(tokens_router)
app.include_router(collections_router)
app.include_router(wallet_router)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {
        "project": "Enjin Tracker",
        "version": "0.1.0",
        "network": "Enjin",
        "status": "running",
    }
