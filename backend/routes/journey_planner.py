from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import sys
sys.path.append('..')

from models.journey_dto import JourneyRequest, JourneyResponse, StationInfo, BusStationStop, JourneyError
from utils.distance_calculator import find_closest_station, haversine_distance, calculate_walking_time
from db import supabase

router = APIRouter()

LINE_NUMBERS = ["2", "19", "20", "52", "10"]

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
        found_valid_route_for_line = False

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
                            found_valid_route_for_line = True

                        # OPTIMIZATION: If we found a valid route and next route has longer wait, stop this line
                        elif found_valid_route_for_line:
                            # Routes are sorted by time, so remaining routes will have even longer waits
                            should_stop = True
                            print(f"DEBUG: Found best route for line {line_number}, skipping remaining routes")
                            break

            # Stop searching this line if we passed the time window or found best
            if should_stop:
                print(f"DEBUG: Stopped early for line {line_number} (checked {routes_checked_for_line} routes)")
                break

            offset += page_size
            if len(response.data) < page_size:
                break

    return best_route


@router.get("/closest-station")
async def get_closest_station(latitude: float, longitude: float):
    """
    Find the closest station to given coordinates.

    Returns station details including distance and walking time.
    """
    try:
        # Get all stations (uses cache)
        all_stations = get_all_stations()

        # Find closest station
        result = find_closest_station(latitude, longitude, all_stations)

        if not result:
            raise HTTPException(status_code=404, detail="No station found")

        return {
            "station": result['station'],
            "distance_km": result['distance_km'],
            "walking_time_minutes": result['walking_time_minutes']
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


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
        all_stations = get_all_stations()
        line_station_ids = get_stations_for_lines(LINE_NUMBERS)
        line_stations = [s for s in all_stations if s['id'] in line_station_ids]

        # Find closest departure station (globally across all lines)
        dep_search_start = time.time()
        departure_result = find_closest_station(
            request.start_latitude,
            request.start_longitude,
            line_stations
        )

        if not departure_result:
            raise HTTPException(status_code=404, detail="No departure station found")

        print(f"DEBUG: Departure station: {departure_result['station']['name']} (ID: {departure_result['station']['id']}) - Distance: {departure_result['distance_km']:.2f}km")

        # Calculate when user arrives at departure station
        user_arrival_at_station = user_departure_time + timedelta(minutes=departure_result['walking_time_minutes'])

        print(f"DEBUG: User departure time: {user_departure_time}")
        print(f"DEBUG: User arrives at station: {user_arrival_at_station}")

        # Now for each line, find the closest arrival station on that line
        best_route = None
        best_total_time = float('inf')
        best_arrival_result = None

        route_search_start = time.time()

        for line_number in LINE_NUMBERS:
            # Get stations for this specific line only
            line_specific_station_ids = get_stations_for_lines([line_number])
            line_specific_stations = [s for s in all_stations if s['id'] in line_specific_station_ids]

            # Find closest arrival station on this line
            arrival_result = find_closest_station(
                request.destination_latitude,
                request.destination_longitude,
                line_specific_stations
            )

            if not arrival_result:
                print(f"DEBUG: No arrival station found for line {line_number}")
                continue

            # Check if it's the same station
            if departure_result['station']['id'] == arrival_result['station']['id']:
                print(f"DEBUG: Line {line_number} - Departure and arrival stations are the same, skipping")
                continue

            print(f"DEBUG: Line {line_number} - Trying route from {departure_result['station']['name']} to {arrival_result['station']['name']}")

            # Try to find route between these stations on this line
            route = find_best_route(
                departure_result['station']['id'],
                arrival_result['station']['id'],
                user_arrival_at_station,
                [line_number]  # Only search this specific line
            )

            if route:
                # Calculate total journey time for comparison
                bus_departure = datetime.strptime(route['route']['stations_info'][route['departure_index']]["departure_time"], "%Y-%m-%d %H:%M:%S")
                bus_arrival = datetime.strptime(route['route']['stations_info'][route['arrival_index']]["arrival_time"], "%Y-%m-%d %H:%M:%S")

                # Calculate walking time from arrival station to destination
                walking_from_arrival_distance = haversine_distance(
                    arrival_result['station']['latitude'], arrival_result['station']['longitude'],
                    request.destination_latitude, request.destination_longitude
                )
                walking_from_arrival_time = calculate_walking_time(walking_from_arrival_distance)

                total_time = (
                    departure_result['walking_time_minutes'] +
                    route['waiting_time_minutes'] +
                    (bus_arrival - bus_departure).total_seconds() / 60 +
                    walking_from_arrival_time
                )

                print(f"DEBUG: Line {line_number} - Found route with total time: {total_time:.2f} minutes")

                if total_time < best_total_time:
                    best_total_time = total_time
                    best_route = route
                    best_arrival_result = arrival_result

        print(f"⏱️ Find best route: {time.time() - route_search_start:.2f}s")

        if not best_route:
            print(f"DEBUG: No route found from station {departure_result['station']['id']} to destination")
            raise HTTPException(
                status_code=404,
                detail="No route found connecting these stations"
            )

        # Use the best route and arrival result found
        arrival_result = best_arrival_result

        # Extract route details
        route = best_route['route']
        dep_idx = best_route['departure_index']
        arr_idx = best_route['arrival_index']

        departure_station_info = route['stations_info'][dep_idx]
        arrival_station_info = route['stations_info'][arr_idx]

        # Calculate average historical delay for this route at this time
        scheduled_departure = datetime.strptime(departure_station_info["departure_time"], "%Y-%m-%d %H:%M:%S")
        scheduled_arrival = datetime.strptime(arrival_station_info["arrival_time"], "%Y-%m-%d %H:%M:%S")

        # Get time window (30 minutes before/after scheduled time)
        time_start = scheduled_departure - timedelta(minutes=30)
        time_end = scheduled_departure + timedelta(minutes=30)

        # Find historical routes on same line, same stations, similar time
        historical_delays_departure = []
        historical_delays_arrival = []

        offset = 0
        page_size = 1000

        while offset < 5000:  # Limit to first 5000 routes for performance
            response = supabase.table("routes").select("*").eq("line_number", route['line_number']).range(offset, offset + page_size - 1).execute()

            if not response.data:
                break

            for hist_route in response.data:
                hist_stations = hist_route["stations_info"]

                # Find if this historical route has same station pair
                hist_dep_idx = None
                hist_arr_idx = None

                for i, station_info in enumerate(hist_stations):
                    if station_info["station_id"] == departure_result['station']['id'] and hist_dep_idx is None:
                        hist_dep_idx = i
                    if station_info["station_id"] == arrival_result['station']['id'] and hist_dep_idx is not None:
                        hist_arr_idx = i
                        break

                if hist_dep_idx is not None and hist_arr_idx is not None:
                    hist_dep_time = datetime.strptime(hist_stations[hist_dep_idx]["departure_time"], "%Y-%m-%d %H:%M:%S")

                    # Check if within time window (same time of day, different dates)
                    if time_start.time() <= hist_dep_time.time() <= time_end.time():
                        # Check if actual times exist (past routes only)
                        if hist_stations[hist_dep_idx]["actual_departure_time"]:
                            actual_dep = datetime.strptime(hist_stations[hist_dep_idx]["actual_departure_time"], "%Y-%m-%d %H:%M:%S")
                            scheduled_dep = datetime.strptime(hist_stations[hist_dep_idx]["departure_time"], "%Y-%m-%d %H:%M:%S")
                            delay = (actual_dep - scheduled_dep).total_seconds() / 60
                            historical_delays_departure.append(delay)

                        if hist_stations[hist_arr_idx]["actual_arrival_time"]:
                            actual_arr = datetime.strptime(hist_stations[hist_arr_idx]["actual_arrival_time"], "%Y-%m-%d %H:%M:%S")
                            scheduled_arr = datetime.strptime(hist_stations[hist_arr_idx]["arrival_time"], "%Y-%m-%d %H:%M:%S")
                            delay = (actual_arr - scheduled_arr).total_seconds() / 60
                            historical_delays_arrival.append(delay)

            offset += page_size

        # Calculate averages in seconds (rounded to whole number)
        avg_departure_delay_min = sum(historical_delays_departure) / len(historical_delays_departure) if historical_delays_departure else 0
        avg_arrival_delay_min = sum(historical_delays_arrival) / len(historical_delays_arrival) if historical_delays_arrival else 0

        avg_departure_delay_sec = round(avg_departure_delay_min * 60)
        avg_arrival_delay_sec = round(avg_arrival_delay_min * 60)

        print(f"DEBUG: Historical data - {len(historical_delays_departure)} past departures, avg delay: {avg_departure_delay_sec} sec")

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
                    is_exit_station=(i == arr_idx),
                    route_id=route['id']
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
            total_waiting_time_minutes=best_route['waiting_time_minutes'],

            average_departure_delay_seconds=avg_departure_delay_sec,
            average_arrival_delay_seconds=avg_arrival_delay_sec,
            historical_sample_size=len(historical_delays_departure)
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