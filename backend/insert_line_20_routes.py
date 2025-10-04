import random
from datetime import datetime, timedelta
from db import supabase

# Line 20: Mały Płaszów P+R - Bronowice
LINE_NUMBER = "20"
LINE_STATION_NAMES = [
    "Mały Płaszów P+R",
    "Rzebika",
    "Lipska",
    "Gromadzka",
    "Kuklińskiego",
    "Klimeckiego",
    "Zabłocie",
    "Rondo Grzegórzeckie",
    "Rondo Mogilskie",
    "Lubicz",
    "Teatr Słowackiego",
    "Stary Kleparz",
    "Teatr Bagatela",
    "Stefana Batorego",
    "Plac Inwalidów",
    "Urzędnicza",
    "Biprostal",
    "UKEN",
    "Głowackiego",
    "Bronowice"
]

# Travel times in minutes from first station
travel_times = [0, 2, 3, 4, 6, 7, 8, 12, 14, 16, 19, 21, 23, 24, 26, 27, 28, 30, 31, 33]

# Fetch existing stations from database
print("Fetching existing stations from database...")
response = supabase.table("stations").select("*").execute()
all_stations = response.data
print(f"Found {len(all_stations)} total stations in database")

# Filter stations to only those in Line 20, maintaining order
stations = []
station_lookup = {s["name"]: s for s in all_stations}
for station_name in LINE_STATION_NAMES:
    if station_name in station_lookup:
        stations.append(station_lookup[station_name])
    else:
        print(f"ERROR: Station '{station_name}' not found in database!")
        print(f"Please run insert_line_5_stations.py first to insert all stations for Line 20")
        exit(1)

print(f"Found all {len(stations)} stations for Line {LINE_NUMBER}")

# Generate routes every 20 minutes from 15.09.2025 00:00 to 15.10.2025 12:00
start_datetime = datetime(2025, 9, 15, 0, 0, 0)
end_datetime = datetime(2025, 10, 25, 12, 0, 0)

routes_to_insert = []
current_start_time = start_datetime

while current_start_time <= end_datetime:
    # Create schedule for this route instance
    stations_info = []

    # Determine if this route will have delays (80% on time, 20% delayed)
    has_delay = random.random() >= 0.8
    accumulated_delay = 0  # Track cumulative delay in seconds

    for i, station in enumerate(stations):
        departure_time = current_start_time + timedelta(minutes=travel_times[i])
        arrival_time = departure_time

        if has_delay:
            # If first station with delay, generate initial delay
            if i == 0:
                accumulated_delay = random.randint(0, 600)  # 0-10 minutes initial delay

            # Apply accumulated delay to this station
            actual_departure_time = departure_time + timedelta(seconds=accumulated_delay)
            actual_arrival_time = arrival_time + timedelta(seconds=accumulated_delay)

            # Small chance delay increases/decreases slightly at each station
            if random.random() < 0.3:
                accumulated_delay += random.randint(-60, 120)  # -1 to +2 minutes variation
                accumulated_delay = max(0, accumulated_delay)  # Don't go negative
        else:
            # On time
            actual_departure_time = departure_time
            actual_arrival_time = arrival_time

        schedule_entry = {
            "station_id": station["id"],
            "departure_time": departure_time.strftime("%Y-%m-%d %H:%M:%S"),
            "actual_departure_time": actual_departure_time.strftime("%Y-%m-%d %H:%M:%S"),
            "arrival_time": arrival_time.strftime("%Y-%m-%d %H:%M:%S"),
            "actual_arrival_time": actual_arrival_time.strftime("%Y-%m-%d %H:%M:%S"),
            "current_latitude": 0.0,
            "current_longitude": 0.0
        }
        stations_info.append(schedule_entry)

    # Create route
    route = {
        "line_number": LINE_NUMBER,
        "stations_info": stations_info,
        "current_latitude": 0.0,
        "current_longitude": 0.0
    }
    routes_to_insert.append(route)

    # Move to next departure (20 minutes later)
    current_start_time += timedelta(minutes=20)

# Insert all routes
print(f"Inserting {len(routes_to_insert)} routes for Line {LINE_NUMBER}...")
response = supabase.table("routes").insert(routes_to_insert).execute()
print(f"Inserted {len(response.data)} routes")

print("Done!")