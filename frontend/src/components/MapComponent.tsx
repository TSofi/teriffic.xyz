import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBxLcMfFJzbRh-rYmoKs7tgi4JsEumy-Nk';

interface MapComponentProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  useCurrentLocation?: boolean;
}

export default function MapComponent({
  center = { lat: 50.0647, lng: 19.9450 },
  zoom = 13,
  useCurrentLocation = true
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState(center);

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

      // Add marker at current location
      new google.maps.Marker({
        position: currentLocation,
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
