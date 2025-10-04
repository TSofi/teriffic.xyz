import math

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two points on Earth using Haversine formula.

    Args:
        lat1, lon1: Latitude and longitude of first point
        lat2, lon2: Latitude and longitude of second point

    Returns:
        Distance in kilometers
    """
    # Earth's radius in kilometers
    R = 6371.0

    # Convert degrees to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    # Differences
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    # Haversine formula
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    distance = R * c

    return distance


def calculate_walking_time(distance_km: float, walking_speed_kmh: float = 4.0) -> float:
    """
    Calculate walking time in minutes.

    Args:
        distance_km: Distance in kilometers
        walking_speed_kmh: Walking speed in km/h (default: 4 km/h)

    Returns:
        Walking time in minutes
    """
    if distance_km <= 0:
        return 0.0

    time_hours = distance_km / walking_speed_kmh
    time_minutes = time_hours * 60

    return time_minutes


def find_closest_station(user_lat: float, user_lon: float, stations: list) -> dict:
    """
    Find the closest station to user's location.

    Args:
        user_lat, user_lon: User's coordinates
        stations: List of station dictionaries with 'id', 'name', 'latitude', 'longitude'

    Returns:
        Dictionary with closest station and distance
    """
    if not stations:
        return None

    closest_station = None
    min_distance = float('inf')

    for station in stations:
        distance = haversine_distance(
            user_lat, user_lon,
            station['latitude'], station['longitude']
        )

        if distance < min_distance:
            min_distance = distance
            closest_station = station

    return {
        'station': closest_station,
        'distance_km': min_distance,
        'walking_time_minutes': calculate_walking_time(min_distance)
    }