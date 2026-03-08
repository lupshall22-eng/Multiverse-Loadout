import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

ENJIN_API_URL = os.getenv("ENJIN_API_URL", "https://platform.enjin.io/graphql")
ENJIN_API_KEY = os.getenv("ENJIN_API_KEY")

SYNC_INTERVAL_HOURS = int(os.getenv("SYNC_INTERVAL_HOURS", 6))

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL in .env")
if not ENJIN_API_KEY:
    raise RuntimeError("Missing ENJIN_API_KEY in .env")