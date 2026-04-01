import os
import json
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "seed_data")

TEAM_LIMITS = {
    "india": 100,
    "australia": 100,
    "england": 70,
    "south africa": 70,
    "west indies": 50,
    "new zealand": 50,
    "afghanistan": 50,
    "sri lanka": 50,
}


def normalize_country(p):
    raw = (
        p.get("country")
        or p.get("team")
        or p.get("personal_info", {}).get("country")
        or p.get("personal_info", {}).get("team")
        or p.get("nationality")
        or ""
    ).lower().strip()

    if "india" in raw or raw == "ind":
        return "india"
    if "eng" in raw:
        return "england"
    if "aus" in raw:
        return "australia"
    if "south" in raw or raw in ["sa", "rsa"]:
        return "south africa"
    if "zealand" in raw or "nz" in raw:
        return "new zealand"
    if "afghan" in raw:
        return "afghanistan"
    if "sri" in raw:
        return "sri lanka"
    if "west" in raw or "windies" in raw:
        return "west indies"

    return "world"


# 📦 Load JSON (cached for performance)
@lru_cache(maxsize=1)
def load_all_players():
    all_players = []

    if not os.path.exists(DATA_DIR):
        logger.error(f"DATA_DIR not found: {DATA_DIR}")
        return []

    for file in os.listdir(DATA_DIR):
        if file.endswith(".json"):
            path = os.path.join(DATA_DIR, file)

            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                    if isinstance(data, list):
                        all_players.extend(data)
                    elif isinstance(data, dict):
                        all_players.append(data)

            except Exception as e:
                logger.error(f"Failed to load {file}: {e}")
                continue  # skip bad file, don't crash

    logger.info(f"Loaded {len(all_players)} players (service layer)")
    return all_players


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def get_limited_players(players):
    grouped = {}

    for p in players:
        if not isinstance(p, dict):
            continue

        team = normalize_country(p)

        if team not in grouped:
            grouped[team] = []

        grouped[team].append(p)

    final_players = []

    for team, plist in grouped.items():
        limit = TEAM_LIMITS.get(team, 30)

        sorted_players = sorted(
            plist,
            key=lambda x: safe_int(
                x.get("stats", {})
                 .get("batting", {})
                 .get("test", {})
                 .get("runs", 0)
            ),
            reverse=True
        )

        final_players.extend(sorted_players[:limit])

    logger.info(f"Players after limit applied: {len(final_players)}")
    return final_players


def get_players():
    players = load_all_players()
    players = get_limited_players(players)
    return players
