from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import players
from config import settings

# NO Mongo import ❌

app = FastAPI(
    title="CricCity API",
    description="Backend for CricCity — Cricket Legends Visualized as a 3D City",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        settings.FRONTEND_URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router, prefix="/api/players", tags=["Players"])

@app.get("/")
def root():
    return {
        "message": "CricCity API is live 🏏",
        "docs": "/docs"
    }
