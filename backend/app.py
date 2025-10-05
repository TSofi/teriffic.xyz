from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
from bus_simulator import simulate_bus_movements
from routes.journey_planner import router as journey_router
from routes.rewards import router as rewards_router

# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     # Start background task when app starts
#     task = asyncio.create_task(simulate_bus_movements())
#     print("Bus simulator background task started")
#     yield
#     # Cancel task when app shuts down
#     task.cancel()
#     print("Bus simulator background task stopped")

app = FastAPI(
    title="Teriffic.xyz Bus Tracking API",
    description="Real-time bus tracking and journey planning for Krakow",
    version="1.0.0",
    # lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(journey_router, prefix="/api", tags=["Journey Planning"])
app.include_router(rewards_router, prefix="/api", tags=["Rewards & Tickets"])

@app.get("/health")
def healthcheck():
    return {"status": "ok", "message": "Bus simulator is running"}

@app.get("/")
def root():
    return {"message": "Teriffic.xyz Bus Tracking API"}