from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import players
from config import settings

# 🚀 Create FastAPI app
app = FastAPI(
    title="CricCity API",
    description="Backend for CricCity — Cricket Legends Visualized as a 3D City",
    version="1.0.0",
)

# ✅ Safe CORS handling (prevents crash if env missing)
allowed_origins = [
    "http://localhost:3000"
]

# Add frontend URL only if exists
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    allowed_origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Routes
app.include_router(players.router, prefix="/api/players", tags=["Players"])

# ✅ Root endpoint
@app.get("/")
def root():
    return {
        "message": "CricCity API is live 🏏",
        "docs": "/docs"
    }
