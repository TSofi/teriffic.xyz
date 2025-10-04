import requests
import time
from db import supabase

# Get your API key from https://console.cloud.google.com/google/maps-apis/credentials
GOOGLE_MAPS_API_KEY = "AIzaSyBxLcMfFJzbRh-rYmoKs7tgi4JsEumy-Nk"

# Station names from Line 2 in Krakow
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
    params = {
        "address": f"{station_name}, Kraków, Poland",
        "key": GOOGLE_MAPS_API_KEY
    }

    response = requests.get(url, params=params)
    data = response.json()

    if data["status"] == "OK" and len(data["results"]) > 0:
        location = data["results"][0]["geometry"]["location"]
        return location["lat"], location["lng"]
    else:
        print(f"Could not find coordinates for {station_name}")
        return 0.0, 0.0

# Fetch existing stations from database
print("Fetching existing stations...")
response = supabase.table("stations").select("*").execute()
stations = response.data
print(f"Found {len(stations)} stations")

# Update each station with coordinates
for station in stations:
    print(f"Fetching coordinates for {station['name']}...")
    lat, lng = get_coordinates(station['name'])

    if lat != 0.0 and lng != 0.0:
        # Update station in database
        supabase.table("stations").update({
            "latitude": lat,
            "longitude": lng
        }).eq("id", station["id"]).execute()
        print(f"  Updated: {lat}, {lng}")
    else:
        print(f"  Skipped (not found)")

    # Sleep to avoid rate limiting
    time.sleep(0.5)

print("Done!")