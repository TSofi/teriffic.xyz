import random
from datetime import datetime, timedelta
from db import supabase

# Cutoff date for actual times
CUTOFF_DATE = datetime(2025, 10, 3, 23, 59, 59)

# Lines to create reverse routes for
LINE_NUMBERS = ["2", "19", "20"]

print("Fetching existing routes...")

# Fetch all routes for these lines
all_routes = []
for line_number in LINE_NUMBERS:
    page_size = 1000
    offset = 0

    while True:
        response = supabase.table("routes").select("*").eq("line_number", line_number).range(offset, offset + page_size - 1).execute()
        routes_batch = response.data

        if not routes_batch:
            break

        all_routes.extend(routes_batch)
        offset += page_size

        if len(routes_batch) < page_size:
            break

print(f"Found {len(all_routes)} routes to reverse")

reverse_routes = []

for route in all_routes:
    # Get original stations
    original_stations = route["stations_info"]

    # Reverse the stations order
    reversed_stations = list(reversed(original_stations))

    # Get the first departure time from original route
    first_departure = datetime.strptime(original_stations[0]["departure_time"], "%Y-%m-%d %H:%M:%S")

    # Calculate travel times between stations (from original)
    travel_times = []
    for i in range(len(original_stations) - 1):
        curr_time = datetime.strptime(original_stations[i]["departure_time"], "%Y-%m-%d %H:%M:%S")
        next_time = datetime.strptime(original_stations[i + 1]["departure_time"], "%Y-%m-%d %H:%M:%S")
        travel_minutes = int((next_time - curr_time).total_seconds() / 60)
        travel_times.append(travel_minutes)

    # Reverse travel times as well
    travel_times.reverse()

    # Recalculate times for reversed route
    new_stations_info = []
    current_time = first_departure

    # Determine if this route has delay (for past routes)
    is_past = first_departure <= CUTOFF_DATE
    has_delay = False
    accumulated_delay = 0

    if is_past:
        has_delay = random.random() >= 0.8  # 20% chance of delay
        if has_delay:
            accumulated_delay = random.randint(0, 600)  # 0-10 minutes

    for i, station in enumerate(reversed_stations):
        departure_time = current_time
        arrival_time = current_time

        if is_past:
            # Set actual times with delays
            if has_delay:
                actual_departure_time = departure_time + timedelta(seconds=accumulated_delay)
                actual_arrival_time = arrival_time + timedelta(seconds=accumulated_delay)

                # Delay can vary at each station
                if i > 0 and random.random() < 0.3:
                    accumulated_delay += random.randint(-60, 120)
                    accumulated_delay = max(0, accumulated_delay)
            else:
                actual_departure_time = departure_time
                actual_arrival_time = arrival_time

            new_station = {
                "station_id": station["station_id"],
                "departure_time": departure_time.strftime("%Y-%m-%d %H:%M:%S"),
                "actual_departure_time": actual_departure_time.strftime("%Y-%m-%d %H:%M:%S"),
                "arrival_time": arrival_time.strftime("%Y-%m-%d %H:%M:%S"),
                "actual_arrival_time": actual_arrival_time.strftime("%Y-%m-%d %H:%M:%S"),
                "current_latitude": 0.0,
                "current_longitude": 0.0
            }
        else:
            # Future route - actual times are null
            new_station = {
                "station_id": station["station_id"],
                "departure_time": departure_time.strftime("%Y-%m-%d %H:%M:%S"),
                "actual_departure_time": None,
                "arrival_time": arrival_time.strftime("%Y-%m-%d %H:%M:%S"),
                "actual_arrival_time": None,
                "current_latitude": 0.0,
                "current_longitude": 0.0
            }

        new_stations_info.append(new_station)

        # Move to next station time
        if i < len(travel_times):
            current_time += timedelta(minutes=travel_times[i])

    # Create reverse route
    reverse_route = {
        "line_number": route["line_number"],  # Keep same line number
        "stations_info": new_stations_info,
        "current_latitude": 0.0,
        "current_longitude": 0.0
    }

    reverse_routes.append(reverse_route)

# Insert reverse routes in batches (faster)
print(f"\nInserting {len(reverse_routes)} reverse routes in batches...")
batch_size = 100
total_inserted = 0

for i in range(0, len(reverse_routes), batch_size):
    batch = reverse_routes[i:i + batch_size]
    response = supabase.table("routes").insert(batch).execute()
    total_inserted += len(response.data)
    print(f"Inserted {total_inserted}/{len(reverse_routes)} routes")

print(f"Completed! Inserted {total_inserted} reverse routes")

print("Done!")