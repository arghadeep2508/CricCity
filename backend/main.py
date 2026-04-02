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

print("🔥 MAIN.PY LOADED")

# ✅ CORS CONFIG (PRODUCTION SAFE)

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://cric-city.vercel.app",  # 🔥 your frontend (IMPORTANT)
]

# Optional: dynamic env support (keeps your system intact)
if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    if settings.FRONTEND_URL not in allowed_origins:
        allowed_origins.append(settings.FRONTEND_URL)

print("🔥 CORS ALLOWED ORIGINS:", allowed_origins)

# ✅ Apply CORS middleware
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

# ✅ Health check (VERY useful for deployment debugging)
@app.get("/health")
def health():
    return {"status": "ok"}
