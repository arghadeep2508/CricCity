import httpx
from config import settings
from models.player import Player, PlayerStats
import logging

logger = logging.getLogger(__name__)

BASE_URL = f"https://{settings.RAPIDAPI_HOST}"

HEADERS = {
    "X-RapidAPI-Key": settings.RAPIDAPI_KEY,
    "X-RapidAPI-Host": settings.RAPIDAPI_HOST,
}

def detect_role(batting_stats: dict, bowling_stats: dict) -> str:
    runs = batting_stats.get("runs", 0) or 0
    wickets = bowling_stats.get("wickets", 0) or 0
    if runs >= 5000 and wickets >= 100:
        return "allrounder"
    if wickets > runs // 50:
        return "bowler"
    return "batter"

def parse_batting(raw: dict) -> PlayerStats:
    return PlayerStats(
        runs=int(raw.get("runs", 0) or 0),
        centuries=int(raw.get("hundreds", 0) or 0),
        average=float(raw.get("avg", 0) or 0),
        matches=int(raw.get("matches", 0) or 0),
        high_score=int(str(raw.get("highScore", "0")).replace("*", "") or 0),
    )

def parse_bowling(raw: dict) -> PlayerStats:
    return PlayerStats(
        wickets=int(raw.get("wickets", 0) or 0),
        five_wicket_hauls=int(raw.get("fiveWickets", 0) or 0),
        average=float(raw.get("avg", 0) or 0),
        matches=int(raw.get("matches", 0) or 0),
        best_bowling=raw.get("bestBowlingInnings", "-"),
    )

async def search_player(name: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/stats/v1/player/search",
            headers=HEADERS,
            params={"plrN": name},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("player", [])

async def fetch_player_stats(player_id: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/stats/v1/player/{player_id}",
            headers=HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

async def build_player_from_cricbuzz(player_id: str, raw_info: dict) -> Player:
    stats_raw = await fetch_player_stats(player_id)

    batting_all: dict[str, PlayerStats] = {}
    bowling_all: dict[str, PlayerStats] = {}

    bat_map = {
        "testBattingStats": "TEST",
        "odiBattingStats": "ODI",
        "t20iBattingStats": "T20I",
    }
    bowl_map = {
        "testBowlingStats": "TEST",
        "odiBowlingStats": "ODI",
        "t20iBowlingStats": "T20I",
    }

    for key, fmt in bat_map.items():
        if key in stats_raw:
            batting_all[fmt] = parse_batting(stats_raw[key])

    for key, fmt in bowl_map.items():
        if key in stats_raw:
            bowling_all[fmt] = parse_bowling(stats_raw[key])

    merged: dict[str, PlayerStats] = {}
    for fmt in set(batting_all.keys()) | set(bowling_all.keys()):
        b = batting_all.get(fmt, PlayerStats())
        w = bowling_all.get(fmt, PlayerStats())
        merged[fmt] = PlayerStats(
            runs=b.runs,
            wickets=w.wickets,
            centuries=b.centuries,
            five_wicket_hauls=w.five_wicket_hauls,
            average=b.average or w.average,
            matches=b.matches or w.matches,
            high_score=b.high_score,
            best_bowling=w.best_bowling,
        )

    role = detect_role(
        {"runs": sum(s.runs or 0 for s in batting_all.values())},
        {"wickets": sum(s.wickets or 0 for s in bowling_all.values())},
    )

    debut_year = None
    try:
        debut_year = int(stats_raw.get("debutYear", 0) or 0) or None
    except (ValueError, TypeError):
        pass

    return Player(
        player_id=player_id,
        name=raw_info.get("name", "Unknown"),
        country=raw_info.get("teamName", "Unknown"),
        role=role,
        formats=list(merged.keys()),
        career_start=debut_year,
        stats=merged,
    )