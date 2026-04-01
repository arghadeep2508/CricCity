import os
import json

# 📁 Path to your JSON folder
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "seed_data")


# 🎯 TEAM LIMITS
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


# 🔧 NORMALIZE COUNTRY (must match frontend)
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


# 📦 LOAD ALL JSON FILES
def load_all_players():
    all_players = []

    for file in os.listdir(DATA_DIR):
        if file.endswith(".json"):
            path = os.path.join(DATA_DIR, file)

            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                    # handle both list and dict formats
                    if isinstance(data, list):
                        all_players.extend(data)
                    elif isinstance(data, dict):
                        all_players.append(data)

            except Exception as e:
                print(f"Error loading {file}: {e}")

    return all_players


# 🎯 APPLY LIMITS
def get_limited_players(players):
    grouped = {}

    # group players
    for p in players:
        team = normalize_country(p)

        if team not in grouped:
            grouped[team] = []

        grouped[team].append(p)

    # debug (important)
    print("TEAM COUNTS BEFORE LIMIT:")
    print({k: len(v) for k, v in grouped.items()})

    final_players = []

    for team, plist in grouped.items():
        limit = TEAM_LIMITS.get(team, 30)

        # sort by performance (runs priority)
        sorted_players = sorted(
            plist,
            key=lambda x: x.get("stats", {}).get("batting", {}).get("test", {}).get("runs", 0),
            reverse=True
        )

        final_players.extend(sorted_players[:limit])

    return final_players


# 🚀 MAIN FUNCTION (THIS IS USED BY API)
def get_players(format: str = "TEST"):
    players = load_all_players()
    players = get_limited_players(players)

    print(f"TOTAL PLAYERS AFTER LIMIT: {len(players)}")

    return players