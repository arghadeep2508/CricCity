from typing import Dict, Any, List


# -------------------------------
# Helpers
# -------------------------------

def safe_number(value, default=0):
    """Convert value to number safely"""
    if value is None or value == "-" or value == "":
        return default
    return value


def normalize_format_key(fmt: str) -> str:
    """Convert TEST/ODI/T20 → test/odi/t20"""
    return fmt.lower()


def parse_highest_score(value: str) -> Dict[str, Any]:
    """
    "254*" → { score: 254, not_out: True }
    "183"  → { score: 183, not_out: False }
    """
    if not value or value == "-":
        return {"score": 0, "not_out": False}

    not_out = "*" in value
    score = int(value.replace("*", ""))

    return {
        "score": score,
        "not_out": not_out
    }


def parse_best_bowling(value: str) -> Dict[str, Any]:
    """
    "5/32" → { wickets: 5, runs: 32 }
    "-"    → { wickets: 0, runs: 0 }
    """
    if not value or value == "-":
        return {"wickets": 0, "runs": 0}

    try:
        wickets, runs = value.split("/")
        return {
            "wickets": int(wickets),
            "runs": int(runs)
        }
    except:
        return {"wickets": 0, "runs": 0}


# -------------------------------
# Core Normalizer
# -------------------------------

def normalize_player(player: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a single player JSON
    """

    stats = player.get("stats", {})

    # -------------------
    # Batting
    # -------------------
    batting = {}
    for fmt, data in stats.get("batting", {}).items():
        key = normalize_format_key(fmt)

        batting[key] = {
            "matches": safe_number(data.get("matches")),
            "innings": safe_number(data.get("innings")),
            "runs": safe_number(data.get("runs")),
            "highest_score": parse_highest_score(data.get("highest_score")),
            "average": safe_number(data.get("average")),
            "strike_rate": safe_number(data.get("strike_rate")),
            "centuries": safe_number(data.get("centuries")),
            "fifties": safe_number(data.get("fifties")),
        }

    # -------------------
    # Bowling
    # -------------------
    bowling = {}
    for fmt, data in stats.get("bowling", {}).items():
        key = normalize_format_key(fmt)

        bowling[key] = {
            "matches": safe_number(data.get("matches")),
            "wickets": safe_number(data.get("wickets")),
            "best_bowling": parse_best_bowling(data.get("best_bowling")),
            "economy": safe_number(data.get("economy")),
        }

    # -------------------
    # Fielding
    # -------------------
    fielding = {}
    for fmt, data in stats.get("fielding", {}).items():
        key = normalize_format_key(fmt)

        fielding[key] = {
            "catches": safe_number(data.get("catches")),
            "run_outs": safe_number(data.get("run_outs")),
        }

    # -------------------
    # Final Normalized Player
    # -------------------
    normalized = {
        "id": player.get("id"),

        "name": player.get("personal_info", {}).get("name"),
        "country": player.get("personal_info", {}).get("country"),
        "role": player.get("personal_info", {}).get("role"),

        "batting_style": player.get("personal_info", {}).get("batting_style"),
        "bowling_style": player.get("personal_info", {}).get("bowling_style"),

        "career": {
            "debut_year": player.get("career", {}).get("debut_year"),
            "retirement_year": player.get("career", {}).get("retirement_year"),
            "formats": [
                normalize_format_key(f)
                for f in player.get("career", {}).get("formats_played", [])
            ]
        },

        "stats": {
            "batting": batting,
            "bowling": bowling,
            "fielding": fielding,
        },

        "meta": player.get("meta", {})
    }

    return normalized


# -------------------------------
# Bulk Normalizer
# -------------------------------

def normalize_players(players: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Normalize list of players"""
    return [normalize_player(player) for player in players]