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

# ✅ Safe CORS handling (robust for dev + prod)

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# 🔥 ALWAYS add your deployed frontend (IMPORTANT)
allowed_origins.append("https://cric-city.vercel.app")

# Optional: dynamic env support (kept your system)
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    if settings.FRONTEND_URL not in allowed_origins:
        allowed_origins.append(settings.FRONTEND_URL)

# 🔥 DEBUG (optional - remove later)
print("CORS ALLOWED ORIGINS:", allowed_origins)

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
