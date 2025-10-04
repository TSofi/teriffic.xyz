import random
import requests
import time
from datetime import datetime, timedelta
from db import supabase

# Get your API key from https://console.cloud.google.com/google/maps-apis/credentials
GOOGLE_MAPS_API_KEY = "AIzaSyBxLcMfFJzbRh-rYmoKs7tgi4JsEumy-Nk"

# Krakow Tram Line 2: Jarzębiny - Salwator
station_names = [
    "Jarzębiny",
    "Darwina",
    "Wańkowicza",
    "Cienista",
    "Teatr Ludowy",
    "Rondo Kocmyrzowskie im. Ks. Gorzelanego",
    "Bieńczycka",
    "Rondo Czyżyńskie",
    "Gałczyńskiego",
    "Rondo 308. Dywizjonu",
    "Ogród Doświadczeń",
    "TAURON Arena Kraków al. Pokoju",
    "Dąbie",
    "Ofiar Dąbia",
    "Fabryczna",
    "Nullo",
    "Teatr Variété",
    "Rondo Grzegórzeckie",
    "Hala Targowa",
    "Starowiślna",
    "Poczta Główna",
    "Plac Wszystkich Świętych",
    "Filharmonia",
    "Jubilat",
    "Komorowskiego",
    "Salwator"
]

def get_coordinates(station_name):
    """Fetch coordinates for a station in Krakow using Google Maps Geocoding API"""
    url = "https://maps.googleapis.com/maps/api/geocode/json"

    # Try different search variations
    search_terms = [
        f"{station_name} tram stop, Kraków, Poland",
        f"przystanek {station_name}, Kraków, Poland",
        f"{station_name}, Kraków, Poland"
    ]

    for search_term in search_terms:
        params = {
            "address": search_term,
            "key": GOOGLE_MAPS_API_KEY
        }

        response = requests.get(url, params=params)
        data = response.json()

        if data["status"] == "OK" and len(data["results"]) > 0:
            location = data["results"][0]["geometry"]["location"]
            print(f"    Found: {location['lat']}, {location['lng']}")
            return location["lat"], location["lng"]

    print(f"    Could not find coordinates, using 0.0, 0.0")
    return 0.0, 0.0

"""
# Uncomment this section to insert stations with coordinates from Google Maps
# Fetch coordinates and create stations_data
print("Fetching coordinates from Google Maps...")
stations_data = []
for station_name in station_names:
    print(f"  Getting coordinates for {station_name}...")
    lat, lng = get_coordinates(station_name)
    stations_data.append({
        "name": station_name,
        "latitude": lat,
        "longitude": lng
    })
    time.sleep(0.5)  # Avoid rate limiting

# Insert stations into database
print("\nInserting stations into database...")
response = supabase.table("stations").insert(stations_data).execute()
print(f"Inserted {len(response.data)} stations")
"""

# Fetch existing stations from database
print("Fetching existing stations from database...")
response = supabase.table("stations").select("*").order("id").execute()
stations = response.data
print(f"Found {len(stations)} stations")

# Travel times in minutes from Jarzębiny
travel_times = [0, 1, 3, 4, 5, 8, 9, 12, 13, 14, 16, 17, 19, 20, 21, 22, 23, 26, 28, 29, 31, 33, 35, 37, 39, 40]

# Generate routes every 30 minutes from 15.09.2025 00:00 to 15.10.2025 12:00
start_datetime = datetime(2025, 9, 15, 0, 0, 0)
end_datetime = datetime(2025, 10, 25, 12, 0, 0)

routes_to_insert = []
current_start_time = start_datetime

while current_start_time <= end_datetime:
    # Create schedule for this route instance
    stations_info = []

    # Determine if this route will have delays (70% on time, 30% delayed)
    has_delay = random.random() >= 0.8
    accumulated_delay = 0  # Track cumulative delay in seconds

    for i, station in enumerate(stations):
        departure_time = current_start_time + timedelta(minutes=travel_times[i])
        arrival_time = departure_time

        if has_delay:
            # If first station with delay, generate initial delay
            if i == 0:
                accumulated_delay = random.randint(0, 600)  # 0-15 minutes initial delay

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
        "line_number": "2",
        "stations_info": stations_info,
        "current_latitude": 0.0,
        "current_longitude": 0.0
    }
    routes_to_insert.append(route)

    # Move to next departure (30 minutes later)
    current_start_time += timedelta(minutes=30)

# Insert all routes
print(f"Inserting {len(routes_to_insert)} routes...")
response = supabase.table("routes").insert(routes_to_insert).execute()
print(f"Inserted {len(response.data)} routes")

print("Done!")