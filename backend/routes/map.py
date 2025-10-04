from fastapi import APIRouter

router = APIRouter()

@router.get("/map")
def get_map_data():
    return {
        "routes": [
            {"id": 1, "start": "A", "end": "B", "status": "open"},
            {"id": 2, "start": "B", "end": "C", "status": "closed"},
        ],
        "disruptions": [
            {"location": "B", "type": "construction", "severity": "high"}
        ]
    }
