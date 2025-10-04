import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBxLcMfFJzbRh-rYmoKs7tgi4JsEumy-Nk';

interface MapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  useCurrentLocation?: boolean;
  routeData?: any;
}

// Mock route data - will be replaced with backend data later
const MOCK_ROUTE = {
  userLocation: { lat: 50.0647, lng: 19.9450 }, // Starting point
  firstStation: { lat: 50.05935, lng: 19.943175 }, // Poczta Główna
  busStations: [
    { lat: 50.05935, lng: 19.943175 }, // Poczta Główna
    { lat: 50.054804, lng: 19.9471229 }, // Starowiślna
    { lat: 50.0583292, lng: 19.9492247 }, // Hala Targowa
    { lat: 50.0574422, lng: 19.9594329 }, // Rondo Grzegórzeckie
    { lat: 50.05678109999999, lng: 19.9639488 }, // Teatr Variété
    { lat: 50.0864011, lng: 20.0337437 }, // Cienista (last station)
  ],
  lastStation: { lat: 50.0864011, lng: 20.0337437 }, // Cienista
  finalDestination: { lat: 50.0900, lng: 20.0370 }, // Final destination
};

export default function MapComponent({
  center = { lat: 50.0647, lng: 19.9450 },
  zoom = 13,
  useCurrentLocation = false,
  routeData = null
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState(center);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRenderersRef = useRef<google.maps.DirectionsRenderer[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    // Get user's current location
    if (useCurrentLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentLocation(userLocation);
        },
        (error) => {
          console.log('Geolocation error:', error);
          // Use default center if geolocation fails
        }
      );
    }
  }, [useCurrentLocation]);

  useEffect(() => {
    // Load Google Maps script
    const loadGoogleMaps = () => {
      if (window.google && window.google.maps) {
        initMap();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (!mapRef.current) return;

      googleMapRef.current = new google.maps.Map(mapRef.current, {
        center: currentLocation,
        zoom,
        styles: [
          {
            featureType: 'all',
            elementType: 'geometry',
            stylers: [{ color: '#242f3e' }],
          },
          {
            featureType: 'all',
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#242f3e' }],
          },
          {
            featureType: 'all',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#746855' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#17263c' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#38414e' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#212a37' }],
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca5b3' }],
          },
        ],
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      // Initialize Directions Service
      directionsServiceRef.current = new google.maps.DirectionsService();

      // Draw the routes
      drawRoutes();
    };

    const drawRoutes = () => {
      if (!googleMapRef.current || !directionsServiceRef.current) return;

      // Clear existing renderers and markers
      directionsRenderersRef.current.forEach(renderer => renderer.setMap(null));
      directionsRenderersRef.current = [];
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];

      // Use backend route data if available, otherwise use mock
      const useBackendData = routeData && routeData.bus_stations;

      if (!useBackendData) {
        // Use mock data
        drawMockRoute();
        return;
      }

      // Draw real route from backend
      drawBackendRoute();
    };

    const drawMockRoute = () => {
      // 1. Walking route: User location → First station (DASHED BLUE)
      const walkingRenderer1 = new google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#06B6D4', // Blue for walking to station
          strokeWeight: 4,
          strokeOpacity: 0.8,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 },
            offset: '0',
            repeat: '20px'
          }]
        }
      });

      directionsServiceRef.current.route({
        origin: MOCK_ROUTE.userLocation,
        destination: MOCK_ROUTE.firstStation,
        travelMode: google.maps.TravelMode.WALKING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          walkingRenderer1.setDirections(result);
        }
      });

      directionsRenderersRef.current.push(walkingRenderer1);

      // 2. Bus route: First station → through all stations → Last station (SOLID)
      const busRenderer = new google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#E63946', // Red for bus
          strokeWeight: 6,
          strokeOpacity: 1,
        }
      });

      // Create waypoints from middle stations
      const waypoints = MOCK_ROUTE.busStations.slice(1, -1).map(station => ({
        location: new google.maps.LatLng(station.lat, station.lng),
        stopover: true
      }));

      directionsServiceRef.current.route({
        origin: MOCK_ROUTE.firstStation,
        destination: MOCK_ROUTE.lastStation,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          busRenderer.setDirections(result);
        }
      });

      directionsRenderersRef.current.push(busRenderer);

      // 3. Walking route: Last station → Final destination (DASHED)
      const walkingRenderer2 = new google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#10B981', // Green for walking
          strokeWeight: 4,
          strokeOpacity: 0.8,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 },
            offset: '0',
            repeat: '20px'
          }]
        }
      });

      directionsServiceRef.current.route({
        origin: MOCK_ROUTE.lastStation,
        destination: MOCK_ROUTE.finalDestination,
        travelMode: google.maps.TravelMode.WALKING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          walkingRenderer2.setDirections(result);
        }
      });

      directionsRenderersRef.current.push(walkingRenderer2);

      // Add markers for mock route
      const marker1 = new google.maps.Marker({
        position: MOCK_ROUTE.userLocation,
        map: googleMapRef.current,
        title: 'Your Location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      markersRef.current.push(marker1);

      const marker2 = new google.maps.Marker({
        position: MOCK_ROUTE.firstStation,
        map: googleMapRef.current,
        title: 'Poczta Główna (Boarding)',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#E63946',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });

      markersRef.current.push(marker2);

      const marker3 = new google.maps.Marker({
        position: MOCK_ROUTE.lastStation,
        map: googleMapRef.current,
        title: 'Cienista (Exit)',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#E63946',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });

      markersRef.current.push(marker3);

      const marker4 = new google.maps.Marker({
        position: MOCK_ROUTE.finalDestination,
        map: googleMapRef.current,
        title: 'Final Destination',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#10B981',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      markersRef.current.push(marker4);
    };

    const drawBackendRoute = () => {
      if (!routeData || !googleMapRef.current || !directionsServiceRef.current) return;

      console.log('Drawing backend route:', routeData);

      // Extract coordinates from backend data
      const userLocation = {
        lat: routeData.departure_station.latitude,
        lng: routeData.departure_station.longitude
      };

      const busStations = routeData.bus_stations.map((station: any) => ({
        lat: station.latitude,
        lng: station.longitude,
        name: station.name
      }));

      const finalDestination = {
        lat: routeData.arrival_station.latitude,
        lng: routeData.arrival_station.longitude
      };

      if (busStations.length === 0) {
        console.error('No bus stations found in route data');
        return;
      }

      const firstStation = busStations[0];
      const lastStation = busStations[busStations.length - 1];

      // 1. Walking route: User location → First station (DASHED BLUE)
      const walkingRenderer1 = new google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#06B6D4', // Blue for walking to station
          strokeWeight: 4,
          strokeOpacity: 0.8,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 },
            offset: '0',
            repeat: '20px'
          }]
        }
      });

      directionsServiceRef.current.route({
        origin: userLocation,
        destination: firstStation,
        travelMode: google.maps.TravelMode.WALKING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          walkingRenderer1.setDirections(result);
        } else {
          console.error('Walking route 1 failed:', status);
        }
      });

      directionsRenderersRef.current.push(walkingRenderer1);

      // 2. Bus route: First station → through all stations → Last station (SOLID RED)
      if (busStations.length > 1) {
        const busRenderer = new google.maps.DirectionsRenderer({
          map: googleMapRef.current,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#E63946', // Red for bus
            strokeWeight: 6,
            strokeOpacity: 1,
          }
        });

        // Create waypoints from middle stations (exclude first and last)
        const waypoints = busStations.slice(1, -1).map((station: any) => ({
          location: new google.maps.LatLng(station.lat, station.lng),
          stopover: true
        }));

        directionsServiceRef.current.route({
          origin: firstStation,
          destination: lastStation,
          waypoints: waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result) {
            busRenderer.setDirections(result);
          } else {
            console.error('Bus route failed:', status);
          }
        });

        directionsRenderersRef.current.push(busRenderer);
      }

      // 3. Walking route: Last station → Final destination (DASHED GREEN)
      const walkingRenderer2 = new google.maps.DirectionsRenderer({
        map: googleMapRef.current,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#10B981', // Green for walking
          strokeWeight: 4,
          strokeOpacity: 0.8,
          icons: [{
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4 },
            offset: '0',
            repeat: '20px'
          }]
        }
      });

      directionsServiceRef.current.route({
        origin: lastStation,
        destination: finalDestination,
        travelMode: google.maps.TravelMode.WALKING,
      }, (result, status) => {
        if (status === 'OK' && result) {
          walkingRenderer2.setDirections(result);
        } else {
          console.error('Walking route 2 failed:', status);
        }
      });

      directionsRenderersRef.current.push(walkingRenderer2);

      // Add markers for backend route
      const marker1 = new google.maps.Marker({
        position: userLocation,
        map: googleMapRef.current,
        title: 'Your Location',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      markersRef.current.push(marker1);

      const marker2 = new google.maps.Marker({
        position: firstStation,
        map: googleMapRef.current,
        title: `${firstStation.name} (Boarding)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#E63946',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });

      markersRef.current.push(marker2);

      const marker3 = new google.maps.Marker({
        position: lastStation,
        map: googleMapRef.current,
        title: `${lastStation.name} (Exit)`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#E63946',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
        },
      });

      markersRef.current.push(marker3);

      const marker4 = new google.maps.Marker({
        position: finalDestination,
        map: googleMapRef.current,
        title: 'Final Destination',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#10B981',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
      });

      markersRef.current.push(marker4);

      // Center map to show entire route
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(userLocation);
      bounds.extend(finalDestination);
      busStations.forEach((station: any) => bounds.extend(station));
      googleMapRef.current.fitBounds(bounds);
    };

    loadGoogleMaps();

    return () => {
      if (googleMapRef.current) {
        googleMapRef.current = null;
      }
    };
  }, [currentLocation, zoom]);

  return (
    <View style={styles.container}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
});
