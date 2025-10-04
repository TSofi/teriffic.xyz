from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import sys
sys.path.append('..')

from models.journey_dto import JourneyRequest, JourneyResponse, StationInfo, BusStationStop, JourneyError
from utils.distance_calculator import find_closest_station, haversine_distance, calculate_walking_time
from db import supabase

router = APIRouter()

LINE_NUMBERS = ["2", "19", "20"]

# Cache stations to avoid refetching on every request
_stations_cache = None
_line_stations_cache = {}

def get_all_stations() -> List[Dict]:
    """Fetch all stations from database with caching"""
    global _stations_cache

    if _stations_cache is not None:
        return _stations_cache

    all_stations = []
    offset = 0
    page_size = 1000

    while True:
        response = supabase.table("stations").select("*").range(offset, offset + page_size - 1).execute()
        if not response.data:
            break
        all_stations.extend(response.data)
        offset += page_size
        if len(response.data) < page_size:
            break

    _stations_cache = all_stations
    return all_stations


def get_stations_for_lines(line_numbers: List[str]) -> List[int]:
    """Get all unique station IDs used by specific lines with caching"""
    global _line_stations_cache

    cache_key = ",".join(sorted(line_numbers))
    if cache_key in _line_stations_cache:
        return _line_stations_cache[cache_key]

    station_ids = set()

    for line_number in line_numbers:
        offset = 0
        page_size = 1000  # Increased from 100 to 1000

        while True:
            response = supabase.table("routes").select("stations_info").eq("line_number", line_number).range(offset, offset + page_size - 1).execute()
            if not response.data:
                break

            for route in response.data:
                for station_info in route["stations_info"]:
                    station_ids.add(station_info["station_id"])

            offset += page_size
            if len(response.data) < page_size:
                break

    result = list(station_ids)
    _line_stations_cache[cache_key] = result
    return result


def find_best_route(
    departure_station_id: int,
    arrival_station_id: int,
    user_arrival_time: datetime,
    line_numbers: List[str]
) -> Optional[Dict]:
    """Find the best route that connects two stations"""

    best_route = None
    min_waiting_time = float('inf')

    # Calculate time window: user arrival time to 12 hours later
    max_time = user_arrival_time + timedelta(hours=12)

    for line_number in line_numbers:
        offset = 0
        page_size = 1000
        routes_checked_for_line = 0
        should_stop = False

        while True:
            response = supabase.table("routes").select("*").eq("line_number", line_number).range(offset, offset + page_size - 1).execute()

            if not response.data:
                break

            for route in response.data:
                stations_info = route["stations_info"]

                # Quick date filter: check first station's departure time
                if not stations_info or len(stations_info) == 0:
                    continue

                first_departure = datetime.strptime(stations_info[0]["departure_time"], "%Y-%m-%d %H:%M:%S")

                # OPTIMIZATION: Since routes are sorted by date, stop when we pass 12-hour window
                if first_departure > max_time:
                    should_stop = True
                    break

                # Skip if route starts before user arrival time
                if first_departure < user_arrival_time:
                    continue

                routes_checked_for_line += 1

                # Find if this route contains both stations in correct order
                departure_index = None
                arrival_index = None

                for i, station_info in enumerate(stations_info):
                    if station_info["station_id"] == departure_station_id and departure_index is None:
                        departure_index = i
                    if station_info["station_id"] == arrival_station_id and departure_index is not None:
                        arrival_index = i
                        break

                # Check if route connects the stations
                if departure_index is not None and arrival_index is not None and arrival_index > departure_index:
                    # Get bus departure time at departure station
                    bus_departure = datetime.strptime(
                        stations_info[departure_index]["departure_time"],
                        "%Y-%m-%d %H:%M:%S"
                    )

                    # Check if bus departs after user arrives and within 12 hours
                    if bus_departure >= user_arrival_time and bus_departure <= max_time:
                        waiting_time = (bus_departure - user_arrival_time).total_seconds() / 60

                        if waiting_time < min_waiting_time:
                            min_waiting_time = waiting_time
                            best_route = {
                                "route": route,
                                "departure_index": departure_index,
                                "arrival_index": arrival_index,
                                "waiting_time_minutes": waiting_time
                            }

            # Stop searching this line if we passed the time window
            if should_stop:
                print(f"DEBUG: Stopped early for line {line_number} (checked {routes_checked_for_line} routes)")
                break

            offset += page_size
            if len(response.data) < page_size:
                break

    return best_route


@router.post("/plan-journey", response_model=JourneyResponse)
async def plan_journey(request: JourneyRequest):
    """
    Plan a journey using public transport.

    Takes user's start location, destination, and departure time.
    Returns the best route with walking and bus details.
    """

    try:
        import time
        start_time = time.time()

        # Parse departure time
        user_departure_time = datetime.fromisoformat(request.departure_time)

        # Get all stations
        stations_start = time.time()
        all_stations = get_all_stations()
        print(f"⏱️ Get all stations: {time.time() - stations_start:.2f}s")

        # Get stations used by our lines
        line_stations_start = time.time()
        line_station_ids = get_stations_for_lines(LINE_NUMBERS)
        line_stations = [s for s in all_stations if s['id'] in line_station_ids]
        print(f"⏱️ Get line stations: {time.time() - line_stations_start:.2f}s")

        # Find closest departure station
        dep_search_start = time.time()
        departure_result = find_closest_station(
            request.start_latitude,
            request.start_longitude,
            line_stations
        )
        print(f"⏱️ Find departure station: {time.time() - dep_search_start:.2f}s")

        if not departure_result:
            raise HTTPException(status_code=404, detail="No departure station found")

        print(f"DEBUG: Departure station: {departure_result['station']['name']} (ID: {departure_result['station']['id']})")

        # Find closest arrival station
        arr_search_start = time.time()
        arrival_result = find_closest_station(
            request.destination_latitude,
            request.destination_longitude,
            line_stations
        )
        print(f"⏱️ Find arrival station: {time.time() - arr_search_start:.2f}s")

        if not arrival_result:
            raise HTTPException(status_code=404, detail="No arrival station found")

        print(f"DEBUG: Arrival station: {arrival_result['station']['name']} (ID: {arrival_result['station']['id']})")

        # Calculate when user arrives at departure station
        user_arrival_at_station = user_departure_time + timedelta(minutes=departure_result['walking_time_minutes'])

        print(f"DEBUG: User departure time: {user_departure_time}")
        print(f"DEBUG: User arrives at station: {user_arrival_at_station}")

        # Find best route
        route_search_start = time.time()
        best_route = find_best_route(
            departure_result['station']['id'],
            arrival_result['station']['id'],
            user_arrival_at_station,
            LINE_NUMBERS
        )
        print(f"⏱️ Find best route: {time.time() - route_search_start:.2f}s")

        if not best_route:
            print(f"DEBUG: No route found between station {departure_result['station']['id']} and {arrival_result['station']['id']}")
            raise HTTPException(
                status_code=404,
                detail="No route found connecting these stations"
            )

        # Extract route details
        route = best_route['route']
        dep_idx = best_route['departure_index']
        arr_idx = best_route['arrival_index']

        departure_station_info = route['stations_info'][dep_idx]
        arrival_station_info = route['stations_info'][arr_idx]

        # Get station details
        dep_station = departure_result['station']
        arr_station = arrival_result['station']

        # Calculate walking time from arrival station to destination
        walking_from_arrival_distance = haversine_distance(
            arr_station['latitude'], arr_station['longitude'],
            request.destination_latitude, request.destination_longitude
        )
        walking_from_arrival_time = calculate_walking_time(walking_from_arrival_distance)

        # Calculate total journey time
        bus_departure = datetime.strptime(departure_station_info["departure_time"], "%Y-%m-%d %H:%M:%S")
        bus_arrival = datetime.strptime(arrival_station_info["arrival_time"], "%Y-%m-%d %H:%M:%S")

        total_journey_time = (
            departure_result['walking_time_minutes'] +
            best_route['waiting_time_minutes'] +
            (bus_arrival - bus_departure).total_seconds() / 60 +
            walking_from_arrival_time
        )

        # Build list of all bus stations between boarding and exit
        bus_stations = []
        for i in range(dep_idx, arr_idx + 1):
            station_info = route['stations_info'][i]

            # Fetch station details
            station_response = supabase.table("stations").select("*").eq("id", station_info["station_id"]).execute()
            if station_response.data:
                station_data = station_response.data[0]

                bus_stations.append(BusStationStop(
                    station_id=station_data['id'],
                    station_name=station_data['name'],
                    latitude=station_data['latitude'],
                    longitude=station_data['longitude'],
                    arrival_time=station_info['arrival_time'],
                    departure_time=station_info['departure_time'],
                    is_boarding_station=(i == dep_idx),
                    is_exit_station=(i == arr_idx)
                ))

        # Build response
        return JourneyResponse(
            departure_station=StationInfo(
                station_id=dep_station['id'],
                station_name=dep_station['name'],
                latitude=dep_station['latitude'],
                longitude=dep_station['longitude']
            ),
            walking_to_departure_time_minutes=departure_result['walking_time_minutes'],
            walking_to_departure_distance_km=departure_result['distance_km'],
            user_arrival_at_station_time=user_arrival_at_station.strftime("%Y-%m-%d %H:%M:%S"),

            line_number=route['line_number'],
            route_id=route['id'],
            bus_departure_time_scheduled=departure_station_info["departure_time"],
            bus_departure_time_actual=departure_station_info["actual_departure_time"],
            bus_arrival_time_scheduled=arrival_station_info["arrival_time"],
            bus_arrival_time_actual=arrival_station_info["actual_arrival_time"],
            bus_stations=bus_stations,

            arrival_station=StationInfo(
                station_id=arr_station['id'],
                station_name=arr_station['name'],
                latitude=arr_station['latitude'],
                longitude=arr_station['longitude']
            ),
            walking_from_arrival_time_minutes=walking_from_arrival_time,
            walking_from_arrival_distance_km=walking_from_arrival_distance,

            total_journey_time_minutes=total_journey_time,
            total_waiting_time_minutes=best_route['waiting_time_minutes']
        )

    except HTTPException:
        raise  # Re-raise HTTPException as-is
    except ValueError as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")