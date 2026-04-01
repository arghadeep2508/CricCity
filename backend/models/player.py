from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


class PlayerStats(BaseModel):
    runs: Optional[int] = 0
    wickets: Optional[int] = 0
    centuries: Optional[int] = 0
    five_wicket_hauls: Optional[int] = 0
    average: Optional[float] = 0.0
    matches: Optional[int] = 0
    high_score: Optional[int] = 0
    best_bowling: Optional[str] = "-"


class Player(BaseModel):
    player_id: str
    name: str
    country: str
    role: Literal["batter", "bowler", "allrounder"]
    formats: list[str] = []
    career_start: Optional[int] = None
    career_end: Optional[int] = None
    career_years: Optional[int] = None
    stats: dict[str, PlayerStats] = {}
    image_url: Optional[str] = None
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class BuildingData(BaseModel):
    """Normalized output sent to the Three.js frontend."""
    player_id: str
    name: str
    country: str
    role: str
    height: float
    width: float
    lit_windows: int
    has_antenna: bool
    color: str
    district: str
    raw_stat: int
    career_years: int
    formats: list[str]