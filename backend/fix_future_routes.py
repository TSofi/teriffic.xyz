from datetime import datetime
from db import supabase

# Cutoff date - routes after this should have null actual times
cutoff_date = datetime(2025, 10, 3, 23, 59, 59)

print("Fetching all routes from database...")

# Fetch all routes with pagination
all_routes = []
page_size = 1000
offset = 0

while True:
    print(f"Fetching routes {offset} to {offset + page_size}...")
    response = supabase.table("routes").select("*").range(offset, offset + page_size - 1).execute()
    routes_batch = response.data

    if not routes_batch:
        break

    all_routes.extend(routes_batch)
    offset += page_size

    if len(routes_batch) < page_size:
        break

print(f"Found {len(all_routes)} total routes")

routes_to_update = []

for route in all_routes:
    # Check each station in the route's schedule
    stations_info = route["stations_info"]
    needs_update = False
    updated_stations_info = []

    for station_info in stations_info:
        # Parse departure time
        departure_time = datetime.strptime(station_info["departure_time"], "%Y-%m-%d %H:%M:%S")

        # Check if this is a future route
        if departure_time > cutoff_date:
            # Set actual times to null for future routes
            station_info["actual_departure_time"] = None
            station_info["actual_arrival_time"] = None
            needs_update = True

        updated_stations_info.append(station_info)

    if needs_update:
        # Update the route with corrected stations_info
        print(f"Updating route ID {route['id']} (Line {route['line_number']})")
        supabase.table("routes").update({
            "stations_info": updated_stations_info
        }).eq("id", route["id"]).execute()
        routes_to_update.append(route["id"])

print(f"\nUpdated {len(routes_to_update)} routes")
print("Done!")