from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from bus_simulator import simulate_bus_movements

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background task when app starts
    task = asyncio.create_task(simulate_bus_movements())
    print("Bus simulator background task started")
    yield
    # Cancel task when app shuts down
    task.cancel()
    print("Bus simulator background task stopped")

app = FastAPI(lifespan=lifespan)

@app.get("/health")
def healthcheck():
    return {"status": "ok", "message": "Bus simulator is running"}

@app.get("/")
def root():
    return {"message": "Teriffic.xyz Bus Tracking API"}