import requests
import time
from db import supabase

GOOGLE_MAPS_API_KEY = "AIzaSyBxLcMfFJzbRh-rYmoKs7tgi4JsEumy-Nk"

# Line 19: Borek Fałęcki - Kopiec Wandy
new_station_names = [
    "Borek Fałęcki",
    "Solvay",
    "Kościuszkowców",
    "Łagiewniki SKA",
    "Łagiewniki",
    "Rzemieślnicza",
    "Rondo Matecznego",
    "Smolki",
    "Korona",
    "Plac Bohaterów Getta",
    "św. Wawrzyńca",
    "Miodowa",
    "Starowiślna",
    "Hala Targowa",
    "Rondo Grzegórzeckie",
    "Teatr Variété",
    "Nullo",
    "Fabryczna",
    "Ofiar Dąbia",
    "Dąbie",
    "TAURON Arena Kraków al. Pokoju",
    "Ogród Doświadczeń",
    "Rondo 308. Dywizjonu",
    "Gałczyńskiego",
    "Rondo Czyżyńskie",
    "Os. Kolorowe",
    "Plac Centralny im. R.Reagana",
    "Struga",
    "Zalew Nowohucki",
    "Kombinat",
    "Kopiec Wandy"
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

# Fetch existing stations from database
print("Fetching existing stations from database...")
response = supabase.table("stations").select("name").execute()
existing_station_names = [station["name"] for station in response.data]
print(f"Found {len(existing_station_names)} existing stations")

# Find new stations that don't exist yet
stations_to_insert = []
for station_name in new_station_names:
    if station_name not in existing_station_names:
        print(f"New station: {station_name}")
        stations_to_insert.append(station_name)
    else:
        print(f"Already exists: {station_name}")

print(f"\nNeed to insert {len(stations_to_insert)} new stations")

if len(stations_to_insert) > 0:
    # Fetch coordinates for new stations
    print("\nFetching coordinates from Google Maps...")
    stations_data = []
    for station_name in stations_to_insert:
        print(f"  Getting coordinates for {station_name}...")
        lat, lng = get_coordinates(station_name)
        stations_data.append({
            "name": station_name,
            "latitude": lat,
            "longitude": lng
        })
        time.sleep(0.5)  # Avoid rate limiting

    # Insert new stations into database
    print("\nInserting new stations into database...")
    response = supabase.table("stations").insert(stations_data).execute()
    print(f"Inserted {len(response.data)} new stations")
else:
    print("No new stations to insert!")

print("Done!")