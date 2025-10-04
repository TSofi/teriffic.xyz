import asyncio
import random
from datetime import datetime, timedelta
from db import supabase

async def simulate_bus_movements():
    """Background task that runs every 20 seconds to simulate bus movements"""

    while True:
        try:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Simulating bus movements...")

            current_time = datetime.now()

            # Fetch routes with pagination
            all_routes = []
            page_size = 1000
            offset = 0

            while True:
                response = supabase.table("routes").select("*").range(offset, offset + page_size - 1).execute()
                routes_batch = response.data

                if not routes_batch:
                    break

                all_routes.extend(routes_batch)
                offset += page_size

                if len(routes_batch) < page_size:
                    break

            routes_updated = 0

            for route in all_routes:
                stations_info = route["stations_info"]
                needs_update = False
                accumulated_delay = 0
                current_station_index = None
                route_completed = True

                for i, station_info in enumerate(stations_info):
                    departure_time = datetime.strptime(station_info["departure_time"], "%Y-%m-%d %H:%M:%S")

                    # Check if departure has passed and actual time is null
                    if departure_time <= current_time and station_info["actual_departure_time"] is None:
                        needs_update = True

                        # Check if previous station had delay
                        if i > 0 and stations_info[i-1]["actual_departure_time"] is not None:
                            prev_actual = datetime.strptime(stations_info[i-1]["actual_departure_time"], "%Y-%m-%d %H:%M:%S")
                            prev_scheduled = datetime.strptime(stations_info[i-1]["departure_time"], "%Y-%m-%d %H:%M:%S")
                            accumulated_delay = int((prev_actual - prev_scheduled).total_seconds())

                            # Delay can vary slightly
                            if accumulated_delay > 0 and random.random() < 0.3:
                                accumulated_delay += random.randint(-60, 120)
                                accumulated_delay = max(0, accumulated_delay)
                        else:
                            # First station - 20% chance of delay
                            if random.random() >= 0.8:
                                accumulated_delay = random.randint(0, 600)

                        # Set actual times
                        actual_departure_time = departure_time + timedelta(seconds=accumulated_delay)
                        actual_arrival_time = departure_time + timedelta(seconds=accumulated_delay)

                        station_info["actual_departure_time"] = actual_departure_time.strftime("%Y-%m-%d %H:%M:%S")
                        station_info["actual_arrival_time"] = actual_arrival_time.strftime("%Y-%m-%d %H:%M:%S")

                        current_station_index = i
                        route_completed = False

                    if departure_time > current_time:
                        route_completed = False

                # Update current position - SMART: interpolate between stations
                if needs_update:
                    if route_completed:
                        route["current_latitude"] = 0.0
                        route["current_longitude"] = 0.0
                    elif current_station_index is not None:
                        # Find where bus actually is right now
                        # Check if bus is still at current station or moving to next

                        current_station = stations_info[current_station_index]
                        current_departure = datetime.strptime(current_station["actual_departure_time"], "%Y-%m-%d %H:%M:%S")

                        # Check if there's a next station
                        if current_station_index + 1 < len(stations_info):
                            next_station = stations_info[current_station_index + 1]
                            next_arrival_scheduled = datetime.strptime(next_station["arrival_time"], "%Y-%m-%d %H:%M:%S")

                            # Calculate travel time between stations
                            travel_time_seconds = (next_arrival_scheduled - datetime.strptime(current_station["departure_time"], "%Y-%m-%d %H:%M:%S")).total_seconds()

                            # How long since bus left current station?
                            time_since_departure = (current_time - current_departure).total_seconds()

                            # If bus has left current station and hasn't reached next yet
                            if time_since_departure > 0 and time_since_departure < travel_time_seconds:
                                # Bus is BETWEEN stations - interpolate position!
                                progress = time_since_departure / travel_time_seconds  # 0.0 to 1.0

                                # Get current and next station coordinates
                                current_station_id = current_station["station_id"]
                                next_station_id = next_station["station_id"]

                                current_coords = supabase.table("stations").select("latitude, longitude").eq("id", current_station_id).execute()
                                next_coords = supabase.table("stations").select("latitude, longitude").eq("id", next_station_id).execute()

                                if current_coords.data and next_coords.data:
                                    curr_lat = current_coords.data[0]["latitude"]
                                    curr_long = current_coords.data[0]["longitude"]
                                    next_lat = next_coords.data[0]["latitude"]
                                    next_long = next_coords.data[0]["longitude"]

                                    # Linear interpolation between stations
                                    route["current_latitude"] = curr_lat + (next_lat - curr_lat) * progress
                                    route["current_longitude"] = curr_long + (next_long - curr_long) * progress
                                else:
                                    # Fallback to current station
                                    route["current_latitude"] = current_coords.data[0]["latitude"]
                                    route["current_longitude"] = current_coords.data[0]["longitude"]
                            else:
                                # Bus is AT current station (just arrived or waiting)
                                current_station_id = current_station["station_id"]
                                station_response = supabase.table("stations").select("latitude, longitude").eq("id", current_station_id).execute()
                                if station_response.data:
                                    route["current_latitude"] = station_response.data[0]["latitude"]
                                    route["current_longitude"] = station_response.data[0]["longitude"]
                        else:
                            # Last station - bus is at this station
                            current_station_id = current_station["station_id"]
                            station_response = supabase.table("stations").select("latitude, longitude").eq("id", current_station_id).execute()
                            if station_response.data:
                                route["current_latitude"] = station_response.data[0]["latitude"]
                                route["current_longitude"] = station_response.data[0]["longitude"]

                    # Update database
                    supabase.table("routes").update({
                        "stations_info": stations_info,
                        "current_latitude": route["current_latitude"],
                        "current_longitude": route["current_longitude"]
                    }).eq("id", route["id"]).execute()

                    routes_updated += 1

                    # Get station name for logging
                    if current_station_index is not None:
                        station_id = stations_info[current_station_index]["station_id"]
                        station_response = supabase.table("stations").select("name").eq("id", station_id).execute()
                        station_name = station_response.data[0]["name"] if station_response.data else "Unknown"

                        actual_time = stations_info[current_station_index]["actual_departure_time"]
                        scheduled_time = stations_info[current_station_index]["departure_time"]

                        print(f"  ✓ Line {route['line_number']} (Route #{route['id']}) - Station: {station_name}")
                        print(f"    Scheduled: {scheduled_time} | Actual: {actual_time}")
                        print(f"    Position: ({route['current_latitude']}, {route['current_longitude']})")
                    elif route_completed:
                        print(f"  ✓ Line {route['line_number']} (Route #{route['id']}) - COMPLETED - Reset position to (0.0, 0.0)")

            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Updated {routes_updated} routes\n")

        except Exception as e:
            print(f"Error in bus simulation: {e}")

        # Wait 20 seconds before next iteration
        await asyncio.sleep(20)