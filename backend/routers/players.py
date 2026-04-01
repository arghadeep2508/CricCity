from fastapi import APIRouter
import json
import os

from utils.normalizer import normalize_players

router = APIRouter()

# 📁 Base directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "seed_data")

# 🔧 Normalize country (same logic as frontend)
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


# 📦 Load ALL JSON files
def load_all_players():
    all_players = []

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
                print(f"Error loading {file}: {e}")

    return all_players


# 🎯 Group + sort ONLY (NO LIMIT)
def process_players(players):
    grouped = {}

    # group players
    for p in players:
        team = normalize_country(p)

        if team not in grouped:
            grouped[team] = []

        grouped[team].append(p)

    print("TOTAL PLAYERS BY TEAM:", {k: len(v) for k, v in grouped.items()})

    final_players = []

    for team, plist in grouped.items():
        # sort by performance (test runs fallback)
        sorted_players = sorted(
            plist,
            key=lambda x: x.get("stats", {}).get("batting", {}).get("test", {}).get("runs", 0),
            reverse=True
        )

        # ✅ NO LIMIT — keep all players
        final_players.extend(sorted_players)

    print("FINAL TOTAL:", len(final_players))

    return final_players


# 🚀 MAIN API
@router.get("/")
def get_players(format: str = "TEST"):
    try:
        # 1. Load all country files
        players = load_all_players()

        # 2. Normalize
        clean_players = normalize_players(players)

        # 3. REMOVE LIMIT SYSTEM
        final_players = process_players(clean_players)

        fmt = format.lower()

        # ✅ KEEP ALL PLAYERS (NO FILTER DROP)
        for p in final_players:
            if "stats" not in p:
                p["stats"] = {}
            if "batting" not in p["stats"]:
                p["stats"]["batting"] = {}
            if fmt not in p["stats"]["batting"]:
                p["stats"]["batting"][fmt] = {"runs": 0}

        return {
            "status": "success",
            "count": len(final_players),
            "format": fmt,
            "data": final_players
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }