from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from config import settings
from models.player import Player
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

client: AsyncIOMotorClient = None
db = None


async def connect():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URI)
    db = client[settings.DATABASE_NAME]
    await _ensure_indexes()
    logger.info("MongoDB connected ✓")


async def disconnect():
    if client:
        client.close()


async def _ensure_indexes():
    await db.players.create_indexes([
        IndexModel([("player_id", ASCENDING)], unique=True),
        IndexModel([("country", ASCENDING)]),
        IndexModel([("role", ASCENDING)]),
        IndexModel([("last_updated", DESCENDING)]),
        IndexModel([("country", ASCENDING), ("role", ASCENDING)]),
    ])
    await db.refresh_log.create_indexes([
        IndexModel([("run_at", DESCENDING)]),
    ])
    logger.info("MongoDB indexes ensured ✓")


async def get_player(player_id: str) -> Player | None:
    doc = await db.players.find_one({"player_id": player_id})
    if doc:
        doc.pop("_id", None)
        return Player(**doc)
    return None


async def upsert_player(player: Player):
    doc = player.model_dump()
    doc["last_updated"] = datetime.utcnow()
    await db.players.update_one(
        {"player_id": player.player_id},
        {"$set": doc},
        upsert=True,
    )


async def get_all_players(country: str | None = None) -> list[Player]:
    query = {"country": country} if country else {}
    cursor = db.players.find(query)
    results = []
    async for doc in cursor:
        doc.pop("_id", None)
        results.append(Player(**doc))
    return results


async def get_player_count() -> int:
    return await db.players.count_documents({})


async def is_stale(player_id: str, max_age_hours: int = 24) -> bool:
    doc = await db.players.find_one(
        {"player_id": player_id},
        projection={"last_updated": 1}
    )
    if not doc or not doc.get("last_updated"):
        return True
    return datetime.utcnow() - doc["last_updated"] > timedelta(hours=max_age_hours)


async def get_stale_player_ids(max_age_hours: int = 24) -> list[str]:
    cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
    cursor = db.players.find(
        {"last_updated": {"$lt": cutoff}},
        projection={"player_id": 1}
    )
    ids = []
    async for doc in cursor:
        ids.append(doc["player_id"])
    return ids


async def log_refresh(refreshed: int, failed: int, details: list[dict]):
    await db.refresh_log.insert_one({
        "run_at": datetime.utcnow(),
        "refreshed": refreshed,
        "failed": failed,
        "details": details,
    })


async def get_last_refresh() -> dict | None:
    doc = await db.refresh_log.find_one(sort=[("run_at", DESCENDING)])
    if doc:
        doc.pop("_id", None)
    return doc