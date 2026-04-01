import os
import json

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
                raise Exception(f"Failed to load {file}: {e}")

    return all_players

def get_limited_players(players):
    grouped = {}

    for p in players:
        team = normalize_country(p)

        if team not in grouped:
            grouped[team] = []

        grouped[team].append(p)

    final_players = []

    for team, plist in grouped.items():
        limit = TEAM_LIMITS.get(team, 30)

        sorted_players = sorted(
            plist,
            key=lambda x: int(
                x.get("stats", {})
                 .get("batting", {})
                 .get("test", {})
                 .get("runs", 0) or 0
            ),
            reverse=True
        )

        final_players.extend(sorted_players[:limit])

    return final_players

def get_players():
    players = load_all_players()
    players = get_limited_players(players)
    return players
