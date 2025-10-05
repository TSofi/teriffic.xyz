import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import MapComponent from '../components/MapComponent';
import { aiService, reverseGeocode, geocodeAddress, planRoute } from '../services/aiService';
import { notificationService, Notification } from '../services/notificationService';
import NotificationToast from '../components/NotificationToast';
import { useUser } from '../context/UserContext';

type MainScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Main'>;

type Props = {
  navigation: MainScreenNavigationProp;
};

const isWeb = Platform.OS === 'web';
const MOBILE_WIDTH = 585;

interface ChatMessageType {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function MainScreen({ navigation }: Props) {
  const { userId } = useUser();
  const [arrivalPoint, setArrivalPoint] = useState('');
  const [destinationPoint, setDestinationPoint] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);
  const [currentRouteId, setCurrentRouteId] = useState<number | undefined>(undefined);
  const [isSearchingRoute, setIsSearchingRoute] = useState(false);
  const [isFindingLocation, setIsFindingLocation] = useState(false);
  const [arrivalSuggestions, setArrivalSuggestions] = useState<any[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([]);
  const [showArrivalSuggestions, setShowArrivalSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    walking1: false,
    waiting: false,
    bus: false,
    walking2: false,
  });
  const [showPredictedDelayPopup, setShowPredictedDelayPopup] = useState(false);
  const [showReportedDelayPopup, setShowReportedDelayPopup] = useState(false);
  const [userCurrentLocation, setUserCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const panelHeightAnim = useRef(new Animated.Value(0)).current;
  const iconOpacityAnim = useRef(new Animated.Value(1)).current;
  const arrivalDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const destinationDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    Animated.timing(panelHeightAnim, {
      toValue: isChatExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isChatExpanded]);

  useEffect(() => {
    Animated.timing(iconOpacityAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [chatMessage]);

  useEffect(() => {
    console.log('Arrival suggestions updated:', arrivalSuggestions.length);
    console.log('Show arrival suggestions:', showArrivalSuggestions);
  }, [arrivalSuggestions, showArrivalSuggestions]);

  useEffect(() => {
    console.log('Destination suggestions updated:', destinationSuggestions.length);
    console.log('Show destination suggestions:', showDestinationSuggestions);
  }, [destinationSuggestions, showDestinationSuggestions]);

  useEffect(() => {
    // Check if Google Maps Places API is loaded
    const checkInterval = setInterval(() => {
      if (window.google?.maps?.places) {
        console.log('Google Maps Places API is loaded!');
        clearInterval(checkInterval);
      } else {
        console.log('Waiting for Google Maps Places API...');
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, []);

  // Notification service disabled - uncomment to re-enable
  // useEffect(() => {
  //   // Only connect if userId is set
  //   if (userId === null) {
  //     console.log('No userId set, skipping notification service');
  //     return;
  //   }

  //   // Set user ID in notification service and connect
  //   notificationService.setUserId(userId);
  //   notificationService.connect();

  //   // Subscribe to notifications
  //   const unsubscribe = notificationService.onNotification((notification) => {
  //     console.log('New notification received:', notification);
  //     setCurrentNotification(notification);
  //   });

  //   // Cleanup on unmount
  //   return () => {
  //     unsubscribe();
  //     notificationService.disconnect();
  //   };
  // }, [userId]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;

    const userMessage: ChatMessageType = {
      id: Date.now().toString(),
      text: chatMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setChatHistory(prev => [...prev, userMessage]);
    setChatMessage('');
    setIsLoading(true);
    setIsChatExpanded(true); // Expand chat when sending message

    try {
      const response = await aiService.chat({
        message: chatMessage,
        conversation_id: conversationIdRef.current,
        include_history: true,
        route_id: currentRouteId,
        user_id: userId || undefined,
      });

      conversationIdRef.current = response.conversation_id;

      const aiMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        text: response.response,
        isUser: false,
        timestamp: new Date(),
      };

      setChatHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessageType = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I could not process your request. Please try again.',
        isUser: false,
        timestamp: new Date(),
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVoiceRecord = async () => {
    if (!isRecording) {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await handleTranscribe(audioBlob);
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Microphone access error:', error);
        alert('Could not access microphone. Please allow microphone access.');
      }
    } else {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handleTranscribe = async (audioBlob: Blob) => {
    setIsLoading(true);
    try {
      const audioBase64 = await aiService.audioToBase64(audioBlob);
      const transcription = await aiService.transcribe({ audio_base64: audioBase64 });

      if (transcription.success && transcription.text) {
        setChatMessage(transcription.text);
        // Automatically send the transcribed message
        const response = await aiService.chat({
          message: transcription.text,
          conversation_id: conversationIdRef.current,
          include_history: true,
          route_id: currentRouteId,
          user_id: userId || undefined,
        });

        conversationIdRef.current = response.conversation_id;

        const userMessage: ChatMessageType = {
          id: Date.now().toString(),
          text: transcription.text,
          isUser: true,
          timestamp: new Date(),
        };

        const aiMessage: ChatMessageType = {
          id: (Date.now() + 1).toString(),
          text: response.response,
          isUser: false,
          timestamp: new Date(),
        };

        setChatHistory(prev => [...prev, userMessage, aiMessage]);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      alert('Could not transcribe audio. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewardsPress = () => {
    navigation.navigate('Rewards');
  };

  const handleTicketsPress = () => {
    navigation.navigate('Tickets');
  };

  const handleFindMyLocation = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsFindingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // Save user location for map marker
        setUserCurrentLocation({ lat: latitude, lng: longitude });

        // Reverse geocode to get address
        const address = await reverseGeocode(latitude, longitude);

        if (address) {
          setArrivalPoint(address);
        } else {
          setArrivalPoint(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }

        setIsFindingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Could not get your location. Please enable location services.');
        setIsFindingLocation(false);
      }
    );
  };

  const fetchPlaceSuggestions = async (input: string, setSuggestions: (suggestions: any[]) => void) => {
    if (!input || input.length < 3) {
      console.log('Input too short:', input);
      setSuggestions([]);
      return;
    }

    try {
      // Check if Google Maps API is loaded
      if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.warn('Google Places API not loaded yet');
        return;
      }

      console.log('Fetching suggestions for:', input);
      const service = new window.google.maps.places.AutocompleteService();

      // Define Krakow bounds
      const krakowBounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(49.9728, 19.7835), // Southwest corner
        new window.google.maps.LatLng(50.1243, 20.2181)  // Northeast corner
      );

      service.getPlacePredictions(
        {
          input: input,
          componentRestrictions: { country: 'pl' },
          bounds: krakowBounds,
          strictBounds: true,
        },
        (predictions, status) => {
          console.log('Autocomplete status:', status);
          console.log('Predictions:', predictions);
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            console.log('Setting suggestions:', predictions.length);
            setSuggestions(predictions);
          } else {
            console.log('No predictions or error status');
            setSuggestions([]);
          }
        }
      );
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestions([]);
    }
  };

  const handleArrivalChange = (text: string) => {
    console.log('Arrival change:', text);
    setArrivalPoint(text);
    setShowArrivalSuggestions(true);

    if (arrivalDebounceRef.current) {
      clearTimeout(arrivalDebounceRef.current);
    }

    arrivalDebounceRef.current = setTimeout(() => {
      console.log('Fetching arrival suggestions after debounce');
      fetchPlaceSuggestions(text, (suggestions) => {
        console.log('Setting arrival suggestions:', suggestions.length);
        setArrivalSuggestions(suggestions);
      });
    }, 300);
  };

  const handleDestinationChange = (text: string) => {
    console.log('Destination change:', text);
    setDestinationPoint(text);
    setShowDestinationSuggestions(true);

    if (destinationDebounceRef.current) {
      clearTimeout(destinationDebounceRef.current);
    }

    destinationDebounceRef.current = setTimeout(() => {
      console.log('Fetching destination suggestions after debounce');
      fetchPlaceSuggestions(text, (suggestions) => {
        console.log('Setting destination suggestions:', suggestions.length);
        setDestinationSuggestions(suggestions);
      });
    }, 300);
  };

  const handleSearchRoute = async () => {
    if (!arrivalPoint.trim() || !destinationPoint.trim()) {
      alert('Please enter both arrival and destination addresses');
      return;
    }

    setIsSearchingRoute(true);

    try {
      // Geocode addresses to coordinates
      const startCoords = await geocodeAddress(arrivalPoint);
      const destCoords = await geocodeAddress(destinationPoint);

      if (!startCoords || !destCoords) {
        alert('Could not find one or both addresses. Please try again.');
        setIsSearchingRoute(false);
        return;
      }

      // Get current time for departure
      const now = new Date();
      const departureTime = now.toISOString().slice(0, 19);

      try {
        // Try to call route service
        const route = await planRoute({
          start_latitude: startCoords.lat,
          start_longitude: startCoords.lng,
          destination_latitude: destCoords.lat,
          destination_longitude: destCoords.lng,
          departure_time: departureTime,
        });

        // Add user's original coordinates to route data for walking segments
        const enrichedRoute = {
          ...route,
          user_start_location: startCoords,
          user_end_location: destCoords,
        };

        setRouteData(enrichedRoute);
        setCurrentRouteId(route.route_id); // Store route_id for AI chat
        console.log('Route planned successfully:', enrichedRoute);
        console.log('Route ID:', route.route_id);
      } catch (routeError: any) {
        console.error('Route service error:', routeError);

        // If route service fails (404 or any error), fallback to walking route using Google Maps Directions
        console.log('Falling back to walking route via Google Maps');

        // Calculate walking distance using haversine formula
        const R = 6371; // Earth radius in km
        const dLat = (destCoords.lat - startCoords.lat) * Math.PI / 180;
        const dLon = (destCoords.lng - startCoords.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(destCoords.lat * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in km

        // Average walking speed: 5 km/h
        const walkingTime = (distance / 5) * 60; // Time in minutes

        // Create a fallback walking-only route
        const walkingRoute = {
          departure_station: null,
          arrival_station: null,
          line_number: null,
          route_id: null,
          bus_stations: [],
          walking_to_departure_time_minutes: walkingTime,
          walking_to_departure_distance_km: distance,
          walking_from_arrival_time_minutes: 0,
          walking_from_arrival_distance_km: 0,
          total_journey_time_minutes: walkingTime,
          total_waiting_time_minutes: 0,
          user_start_location: startCoords,
          user_end_location: destCoords,
          is_walking_only: true, // Flag to identify walking-only routes
        };

        setRouteData(walkingRoute);
        setCurrentRouteId(undefined); // No route_id for walking routes
        console.log('Walking route created:', walkingRoute);
      }
    } catch (error) {
      console.error('Geocoding or general error:', error);
      alert('Could not find addresses. Please try again.');
    } finally {
      setIsSearchingRoute(false);
    }
  };

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Notification Toast */}
        <NotificationToast
          notification={currentNotification}
          onDismiss={() => setCurrentNotification(null)}
        />

        {/* Google Maps Background */}
        <View style={styles.map}>
          <MapComponent
            center={{ lat: 50.0647, lng: 19.9450 }}
            zoom={13}
            useCurrentLocation={false}
            routeData={routeData}
            userLocation={userCurrentLocation}
          />
        </View>

        {/* Top Header with Route Inputs */}
        <View style={styles.topHeader}>
          <View style={styles.routeInputContainer}>
            <View style={styles.inputWrapper}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabelLeft}>FROM</Text>
                <TextInput
                  style={styles.routeInput}
                  placeholder="Arrival point address"
                  placeholderTextColor="#999"
                  value={arrivalPoint}
                  onChangeText={handleArrivalChange}
                  onFocus={() => setShowArrivalSuggestions(true)}
                  editable={!isFindingLocation}
                />
                <TouchableOpacity
                  style={styles.locationButton}
                  onPress={handleFindMyLocation}
                  disabled={isFindingLocation}
                  activeOpacity={0.7}
                >
                  {isFindingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        fill="#FFFFFF"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 2V5M12 19V22M22 12H19M5 12H2"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </TouchableOpacity>
              </View>
              {showArrivalSuggestions && arrivalSuggestions.length > 0 ? (
                <ScrollView
                  style={styles.suggestionsContainer}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  {arrivalSuggestions.slice(0, 5).map((suggestion, index) => {
                    console.log(`Rendering suggestion ${index}:`, suggestion.description);
                    return (
                      <TouchableOpacity
                        key={suggestion.place_id}
                        style={[
                          styles.suggestionItem,
                          index === arrivalSuggestions.slice(0, 5).length - 1 && styles.suggestionItemLast
                        ]}
                        onPress={() => {
                          console.log('Suggestion clicked:', suggestion.description);
                          setArrivalPoint(suggestion.description);
                          setShowArrivalSuggestions(false);
                          setArrivalSuggestions([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.suggestionMainText}>
                          {suggestion.structured_formatting.main_text}
                        </Text>
                        <Text style={styles.suggestionSecondaryText}>
                          {suggestion.structured_formatting.secondary_text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
            <View style={styles.divider} />
            <View style={styles.inputWrapper}>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabelLeft}>TO</Text>
                <TextInput
                  style={[styles.routeInput, styles.routeInputShorter]}
                  placeholder="Destination address"
                  placeholderTextColor="#999"
                  value={destinationPoint}
                  onChangeText={handleDestinationChange}
                  onFocus={() => setShowDestinationSuggestions(true)}
                />
              </View>
              {showDestinationSuggestions && destinationSuggestions.length > 0 ? (
                <ScrollView
                  style={styles.suggestionsContainer}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  {destinationSuggestions.slice(0, 5).map((suggestion, index) => {
                    console.log(`Rendering destination suggestion ${index}:`, suggestion.description);
                    return (
                      <TouchableOpacity
                        key={suggestion.place_id}
                        style={[
                          styles.suggestionItem,
                          index === destinationSuggestions.slice(0, 5).length - 1 && styles.suggestionItemLast
                        ]}
                        onPress={() => {
                          console.log('Destination suggestion clicked:', suggestion.description);
                          setDestinationPoint(suggestion.description);
                          setShowDestinationSuggestions(false);
                          setDestinationSuggestions([]);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.suggestionMainText}>
                          {suggestion.structured_formatting.main_text}
                        </Text>
                        <Text style={styles.suggestionSecondaryText}>
                          {suggestion.structured_formatting.secondary_text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}
            </View>
            {arrivalPoint.trim() && destinationPoint.trim() && (
              <TouchableOpacity
                style={styles.searchRouteButton}
                onPress={handleSearchRoute}
                disabled={isSearchingRoute}
                activeOpacity={0.8}
              >
                {isSearchingRoute ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="10"
                      cy="10"
                      r="7"
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                      fill="none"
                    />
                    <path
                      d="M15 15L21 21"
                      stroke="#FFFFFF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Route Details - Expandable from Bottom */}
        {routeData && (
          <>
            {/* Expandable Journey Details */}
            {expandedSections.summary && (
              <View style={styles.routeDetailsWrapper}>
                <ScrollView
                  style={styles.routeDetailsScroll}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.routeDetailsContent}
                  nestedScrollEnabled={true}
                >
                  {/* Compact Journey Summary - Inside expanded view */}
                  <TouchableOpacity
                    style={styles.journeySummaryCompact}
                    activeOpacity={0.7}
                    onPress={() => toggleSection('summary')}
                  >
                    <View style={styles.summaryLeft}>
                      <Text style={styles.summaryTimeText}>{Math.ceil(routeData.total_journey_time_minutes)} min</Text>
                      {!routeData.is_walking_only && (routeData.average_arrival_delay_seconds > 0 || routeData.reported_delay_seconds > 0) && (
                        <Text style={styles.summaryDelayText}>+{Math.ceil(Math.max(routeData.average_arrival_delay_seconds, routeData.reported_delay_seconds) / 60)} min delay</Text>
                      )}
                    </View>
                    <Text style={styles.expandIconText}>▼</Text>
                  </TouchableOpacity>

                  {/* Journey Timeline Details */}
                <View style={styles.journeyTimeline}>
                  {/* Walking to Station */}
                  <TouchableOpacity
                    style={styles.timelineStepClickable}
                    onPress={() => toggleSection('walking1')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.timelineIconContainer}>
                      <View style={[styles.timelineIcon, { backgroundColor: '#06B6D4' }]}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M13 5C13 6.1 12.1 7 11 7C9.9 7 9 6.1 9 5C9 3.9 9.9 3 11 3C12.1 3 13 3.9 13 5ZM9.8 8.9L7 23H9.1L10.9 15L13 17V23H15V15.5L12.9 13.5L13.5 10.5C14.8 12 16.8 13 19 13V11C16.8 11 15.1 9.8 14.4 8.2L13.5 6.5C13.2 5.9 12.6 5.5 12 5.5C11.7 5.5 11.5 5.6 11.2 5.7L6 8.3V13H8V9.6L9.8 8.9Z" fill="#FFFFFF"/>
                        </svg>
                      </View>
                      <View style={styles.timelineLine} />
                    </View>
                    <View style={styles.timelineContent}>
                      <View style={styles.timelineHeader}>
                        <Text style={styles.timelineTitle}>Walk to {routeData.departure_station?.station_name || 'bus stop'}</Text>
                        <Text style={styles.timelineExpandIcon}>{expandedSections.walking1 ? '▼' : '▶'}</Text>
                      </View>
                      {!expandedSections.walking1 && (
                        <Text style={styles.timelineSubtitle}>
                          {Math.ceil(routeData.walking_to_departure_time_minutes)} min
                        </Text>
                      )}
                      {expandedSections.walking1 && (
                        <>
                          <Text style={styles.timelineSubtitle}>
                            {Math.ceil(routeData.walking_to_departure_time_minutes)} min · {routeData.walking_to_departure_distance_km.toFixed(2)} km
                          </Text>
                          {routeData.user_arrival_at_station_time && (
                            <Text style={styles.timelineTime}>
                              Arrive by {new Date(routeData.user_arrival_at_station_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          )}
                        </>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* Waiting at Station */}
                  {!routeData.is_walking_only && routeData.total_waiting_time_minutes > 0 && (
                    <TouchableOpacity
                      style={styles.timelineStepClickable}
                      onPress={() => toggleSection('waiting')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.timelineIconContainer}>
                        <View style={[styles.timelineIcon, { backgroundColor: '#F59E0B' }]}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM12.5 7H11V13L16.2 16.2L17 14.9L12.5 12.2V7Z" fill="#FFFFFF"/>
                          </svg>
                        </View>
                        <View style={styles.timelineLine} />
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineHeader}>
                          <Text style={styles.timelineTitle}>Wait at station</Text>
                          <Text style={styles.timelineExpandIcon}>{expandedSections.waiting ? '▼' : '▶'}</Text>
                        </View>
                        <Text style={styles.timelineSubtitle}>{Math.ceil(routeData.total_waiting_time_minutes)} min wait</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Bus Ride */}
                  {!routeData.is_walking_only && (
                    <TouchableOpacity
                      style={styles.timelineStepClickable}
                      onPress={() => toggleSection('bus')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.timelineIconContainer}>
                        <View style={[styles.timelineIcon, { backgroundColor: '#8B5CF6' }]}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M4 16C4 16.88 4.39 17.67 5 18.22V20C5 20.55 5.45 21 6 21H7C7.55 21 8 20.55 8 20V19H16V20C16 20.55 16.45 21 17 21H18C18.55 21 19 20.55 19 20V18.22C19.61 17.67 20 16.88 20 16V6C20 2.5 16.42 2 12 2C7.58 2 4 2.5 4 6V16ZM7.5 17C6.67 17 6 16.33 6 15.5C6 14.67 6.67 14 7.5 14C8.33 14 9 14.67 9 15.5C9 16.33 8.33 17 7.5 17ZM16.5 17C15.67 17 15 16.33 15 15.5C15 14.67 15.67 14 16.5 14C17.33 14 18 14.67 18 15.5C18 16.33 17.33 17 16.5 17ZM6 11V6H18V11H6Z" fill="#FFFFFF"/>
                          </svg>
                        </View>
                        <View style={styles.timelineLine} />
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.busLineTag}>
                          <Text style={styles.busLineTagText}>Line {routeData.line_number}</Text>
                        </View>
                        <View style={styles.timelineHeader}>
                          <Text style={styles.timelineTitle}>
                            {routeData.departure_station?.station_name} → {routeData.arrival_station?.station_name}
                          </Text>
                          <Text style={styles.timelineExpandIcon}>{expandedSections.bus ? '▼' : '▶'}</Text>
                        </View>
                        {!expandedSections.bus && routeData.bus_departure_time_scheduled && (
                          <Text style={styles.timelineSubtitle}>
                            Departs {new Date(routeData.bus_departure_time_scheduled).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                        {expandedSections.bus && (
                          <>
                            {routeData.bus_departure_time_scheduled && (
                              <View style={styles.scheduleRow}>
                                <Text style={styles.scheduleLabel}>Scheduled:</Text>
                                <Text style={styles.scheduleTime}>
                                  {new Date(routeData.bus_departure_time_scheduled).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              </View>
                            )}
                            {/* Expected Departure - Redesigned */}
                            {(routeData.average_departure_delay_seconds > 0 || routeData.reported_delay_seconds > 0) && routeData.bus_departure_time_scheduled && (
                              <View style={styles.delaySection}>
                                <View style={styles.expectedTimeRow}>
                                  <Text style={styles.expectedLabel}>Expected:</Text>
                                  <Text style={styles.expectedTime}>
                                    {new Date(
                                      new Date(routeData.bus_departure_time_scheduled).getTime() +
                                      (Math.max(routeData.average_departure_delay_seconds, routeData.reported_delay_seconds) * 1000)
                                    ).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                  <View style={styles.delayBadge}>
                                    <Text style={styles.delayBadgeText}>
                                      +{Math.ceil(Math.max(routeData.average_departure_delay_seconds, routeData.reported_delay_seconds) / 60)} min
                                    </Text>
                                  </View>
                                </View>

                                {routeData.average_departure_delay_seconds > 0 && (
                                  <TouchableOpacity
                                    onPress={() => setShowPredictedDelayPopup(true)}
                                    activeOpacity={0.7}
                                    style={styles.delayInfoLink}
                                  >
                                    <Text style={styles.delayInfoIcon}>📊</Text>
                                    <Text style={styles.delayInfoText}>Predicted delay</Text>
                                  </TouchableOpacity>
                                )}

                                {routeData.reported_delay_seconds > 0 ? (
                                  <TouchableOpacity
                                    onPress={() => setShowReportedDelayPopup(true)}
                                    activeOpacity={0.7}
                                    style={styles.delayInfoLink}
                                  >
                                    <Text style={styles.delayInfoIcon}>🚨</Text>
                                    <Text style={styles.delayInfoText}>User-reported delay</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => setShowReportedDelayPopup(true)}
                                    activeOpacity={0.7}
                                    style={styles.delayInfoLink}
                                  >
                                    <Text style={styles.delayInfoIcon}>✓</Text>
                                    <Text style={[styles.delayInfoText, styles.delayInfoTextPositive]}>No user-reported delays</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                            {/* Bus Stations List */}
                            {routeData.bus_stations && routeData.bus_stations.length > 0 && (
                              <View style={styles.stationsListContainer}>
                                <Text style={styles.stationsListTitle}>Stations ({routeData.bus_stations.length})</Text>
                                {routeData.bus_stations.map((station: any, index: number) => (
                                  <View key={index} style={styles.stationItem}>
                                    <View style={[
                                      styles.stationDot,
                                      station.is_boarding_station && styles.stationDotBoarding,
                                      station.is_exit_station && styles.stationDotExit
                                    ]} />
                                    <View style={styles.stationInfo}>
                                      <Text style={[
                                        styles.stationName,
                                        (station.is_boarding_station || station.is_exit_station) && styles.stationNameBold
                                      ]}>
                                        {station.station_name}
                                        {station.is_boarding_station && ' (Board)'}
                                        {station.is_exit_station && ' (Exit)'}
                                      </Text>
                                      <Text style={styles.stationTime}>
                                        {new Date(station.departure_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Walking from Station */}
                  {routeData.walking_from_arrival_time_minutes > 0 && (
                    <TouchableOpacity
                      style={styles.timelineStepClickable}
                      onPress={() => toggleSection('walking2')}
                      activeOpacity={0.7}
                    >
                      <View style={styles.timelineIconContainer}>
                        <View style={[styles.timelineIcon, { backgroundColor: '#06B6D4' }]}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M13 5C13 6.1 12.1 7 11 7C9.9 7 9 6.1 9 5C9 3.9 9.9 3 11 3C12.1 3 13 3.9 13 5ZM9.8 8.9L7 23H9.1L10.9 15L13 17V23H15V15.5L12.9 13.5L13.5 10.5C14.8 12 16.8 13 19 13V11C16.8 11 15.1 9.8 14.4 8.2L13.5 6.5C13.2 5.9 12.6 5.5 12 5.5C11.7 5.5 11.5 5.6 11.2 5.7L6 8.3V13H8V9.6L9.8 8.9Z" fill="#FFFFFF"/>
                          </svg>
                        </View>
                        <View style={styles.timelineLine} />
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineHeader}>
                          <Text style={styles.timelineTitle}>Walk to destination</Text>
                          <Text style={styles.timelineExpandIcon}>{expandedSections.walking2 ? '▼' : '▶'}</Text>
                        </View>
                        {!expandedSections.walking2 && (
                          <Text style={styles.timelineSubtitle}>
                            {Math.ceil(routeData.walking_from_arrival_time_minutes)} min
                          </Text>
                        )}
                        {expandedSections.walking2 && (
                          <Text style={styles.timelineSubtitle}>
                            {Math.ceil(routeData.walking_from_arrival_time_minutes)} min · {routeData.walking_from_arrival_distance_km.toFixed(2)} km
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Destination */}
                  <View style={styles.timelineStep}>
                    <View style={styles.timelineIconContainer}>
                      <View style={[styles.timelineIcon, { backgroundColor: '#10B981' }]}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#FFFFFF"/>
                        </svg>
                      </View>
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle}>Destination</Text>
                      <Text style={styles.timelineSubtitle}>You have arrived!</Text>
                    </View>
                  </View>

                  {/* AI Chat Section - Inside Route Details */}
                  <View style={styles.aiChatInRoute}>
                    <Text style={styles.aiChatLabel}>Ask AI Assistant</Text>
                    <View style={styles.chatSection}>
                      <TextInput
                        style={[styles.chatInput, !currentRouteId && styles.chatInputDisabled]}
                        placeholder={currentRouteId ? "Ask AI assistant..." : "Generate a route first..."}
                        placeholderTextColor="#666"
                        value={chatMessage}
                        onChangeText={setChatMessage}
                        multiline
                        editable={!isLoading && !!currentRouteId}
                      />
                      {isLoading ? (
                        <View style={styles.actionButton}>
                          <ActivityIndicator size="small" color="#000000" />
                        </View>
                      ) : chatMessage.trim().length > 0 && currentRouteId ? (
                        <Animated.View style={{ opacity: iconOpacityAnim }}>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={handleSendMessage}
                            activeOpacity={0.8}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"
                                fill="#000000"
                              />
                            </svg>
                          </TouchableOpacity>
                        </Animated.View>
                      ) : (
                        <Animated.View style={{ opacity: iconOpacityAnim }}>
                          <TouchableOpacity
                            style={[
                              styles.actionButton,
                              isRecording && styles.actionButtonRecording,
                              !currentRouteId && styles.actionButtonDisabled
                            ]}
                            onPress={currentRouteId ? handleVoiceRecord : undefined}
                            activeOpacity={0.8}
                            disabled={!currentRouteId}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"
                                fill={isRecording ? "#FFFFFF" : "#000000"}
                              />
                              <path
                                d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z"
                                fill={isRecording ? "#FFFFFF" : "#000000"}
                              />
                            </svg>
                          </TouchableOpacity>
                        </Animated.View>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}

            {/* Collapsed Summary Bar - At Bottom */}
            {!expandedSections.summary && (
              <View style={styles.bottomSummaryBar}>
                <TouchableOpacity
                  style={styles.journeySummaryCompact}
                  activeOpacity={0.7}
                  onPress={() => toggleSection('summary')}
                >
                  <View style={styles.summaryLeft}>
                    <Text style={styles.summaryTimeText}>{Math.ceil(routeData.total_journey_time_minutes)} min</Text>
                    {!routeData.is_walking_only && (routeData.average_arrival_delay_seconds > 0 || routeData.reported_delay_seconds > 0) && (
                      <Text style={styles.summaryDelayText}>+{Math.ceil(Math.max(routeData.average_arrival_delay_seconds, routeData.reported_delay_seconds) / 60)} min delay</Text>
                    )}
                  </View>
                  <Text style={styles.expandIconText}>▲</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Predicted Delay Learn More Popup */}
        {showPredictedDelayPopup && (
          <View style={styles.popupOverlay}>
            <View style={styles.popupContainer}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle}>📊 Smart Delay Prediction</Text>
                <TouchableOpacity
                  onPress={() => setShowPredictedDelayPopup(false)}
                  style={styles.popupCloseButton}
                >
                  <Text style={styles.popupCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.popupContent}>
                <Text style={styles.popupText}>
                  Our app analyzes <Text style={styles.popupTextBold}>thousands of past trips</Text> on this route to predict the most probable delays.
                </Text>

                <View style={styles.popupInfoBox}>
                  <Text style={styles.popupInfoTitle}>How it works:</Text>
                  <Text style={styles.popupInfoText}>• Historical data from previous journeys</Text>
                  <Text style={styles.popupInfoText}>• Time of day patterns</Text>
                  <Text style={styles.popupInfoText}>• Traffic conditions analysis</Text>
                  <Text style={styles.popupInfoText}>• Weather impact correlation</Text>
                </View>

                <Text style={styles.popupSubtext}>
                  This helps you plan your journey more accurately and arrive on time!
                </Text>
              </View>

              <TouchableOpacity
                style={styles.popupButton}
                onPress={() => setShowPredictedDelayPopup(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.popupButtonText}>Understood</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reported Delay Learn More Popup */}
        {showReportedDelayPopup && (
          <View style={styles.popupOverlay}>
            <View style={styles.popupContainer}>
              <View style={styles.popupHeader}>
                <Text style={styles.popupTitle}>🚨 Real-Time User Reports</Text>
                <TouchableOpacity
                  onPress={() => setShowReportedDelayPopup(false)}
                  style={styles.popupCloseButton}
                >
                  <Text style={styles.popupCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.popupContent}>
                <Text style={styles.popupText}>
                  Users like you report delays in real-time to help the community have a better travel experience!
                </Text>

                <View style={styles.popupInfoBox}>
                  <Text style={styles.popupInfoTitle}>Why report delays?</Text>
                  <Text style={styles.popupInfoText}>• Help fellow travelers plan better</Text>
                  <Text style={styles.popupInfoText}>• Get real-time delay updates</Text>
                  <Text style={styles.popupInfoText}>• Build a smarter transport system</Text>
                  <Text style={styles.popupInfoText}>• Contribute to your community</Text>
                </View>

                <View style={styles.popupCallToAction}>
                  <Text style={styles.popupCallToActionText}>
                    Start reporting delays today and make everyone's journey better!
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.popupButton}
                onPress={() => setShowReportedDelayPopup(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.popupButtonText}>Understood</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chat History Panel - Only when expanded */}
        {isChatExpanded && chatHistory.length > 0 && (
          <Animated.View
            style={[
              styles.chatHistoryPanel,
              {
                height: panelHeightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 400],
                }),
              }
            ]}
          >
            <View style={styles.chatHistorySection}>
              <View style={styles.chatHistoryHeader}>
                <Text style={styles.chatHistoryTitle}>CONVERSATION</Text>
                <TouchableOpacity
                  onPress={() => {
                    Animated.timing(panelHeightAnim, {
                      toValue: 0,
                      duration: 300,
                      useNativeDriver: false,
                    }).start(() => setIsChatExpanded(false));
                  }}
                  style={styles.closeButtonTouchable}
                >
                  <Text style={styles.chatCloseButton}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.chatHistoryScroll} showsVerticalScrollIndicator={false}>
                {chatHistory.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.chatBubble,
                      msg.isUser ? styles.chatBubbleUser : styles.chatBubbleAI,
                    ]}
                  >
                    <Text style={[styles.chatBubbleText, msg.isUser && styles.chatBubbleTextUser]}>
                      {msg.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  webCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileFrame: {
    width: MOBILE_WIDTH,
    height: 844,
    maxWidth: '100%',
    maxHeight: '100%',
    borderRadius: isWeb ? 40 : 0,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(255, 255, 255, 0.15)',
      },
    }),
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  timeInfoWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 230 : 210,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 5,
  },
  timeInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  timeTag: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 3,
    minWidth: 70,
    alignItems: 'center',
  },
  timeTagText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Inter, sans-serif',
  },
  routeInputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'visible',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  inputWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    zIndex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'Inter, sans-serif',
  },
  inputLabelLeft: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
    fontFamily: 'Inter, sans-serif',
    marginRight: 12,
    minWidth: 50,
  },
  routeInput: {
    fontSize: 18,
    color: '#000',
    fontWeight: '500',
    fontFamily: 'Inter, sans-serif',
    flex: 1,
    paddingVertical: 8,
  },
  routeInputShorter: {
    maxWidth: 'calc(100% - 20px)',
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginTop: 8,
    marginHorizontal: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 9999,
    maxHeight: 280,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
      },
    }),
  },
  suggestionItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    backgroundColor: '#FFFFFF',
    transition: 'background-color 0.2s',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        ':hover': {
          backgroundColor: '#F8F8F8',
        },
      },
    }),
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionMainText: {
    fontSize: 15,
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestionSecondaryText: {
    fontSize: 13,
    color: '#666666',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '400',
  },
  locationButton: {
    width: 36,
    height: 36,
    backgroundColor: '#06B6D4',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRouteButton: {
    position: 'absolute',
    right: 15,
    bottom: 15,
    width: 44,
    height: 44,
    backgroundColor: '#000000',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 20,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingHorizontal: 20,
    elevation: 10,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    transition: 'height 0.3s ease',
  },
  bottomPanelExpanded: {
    height: '60%',
  },
  busLinesSection: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    fontFamily: 'Inter, sans-serif',
  },
  busLinesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busLinesScroll: {
    flexDirection: 'row',
    flex: 1,
  },
  busLinesContent: {
    paddingRight: 10,
    alignItems: 'center',
  },
  busLineCardWrapper: {
    borderRadius: 20,
    padding: 3,
    marginRight: 10,
  },
  busLineCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 18,
    minWidth: 80,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busLineNumber: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Inter, sans-serif',
  },
  rewardsButton: {
    width: 50,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 5,
  },
  ticketsButton: {
    width: 50,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 9,
    marginRight: 0,
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: '#FFFFFF',
    marginVertical: 15,
  },
  chatSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 15,
    fontSize: 15,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: 100,
    fontFamily: 'Inter, sans-serif',
  },
  chatInputDisabled: {
    opacity: 0.5,
    backgroundColor: '#0F0F0F',
  },
  actionButton: {
    width: 50,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionButtonRecording: {
    backgroundColor: '#E63946',
  },
  actionButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#CCCCCC',
  },
  chatHistorySection: {
    flex: 1,
    marginBottom: 15,
  },
  chatHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  chatHistoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    fontFamily: 'Inter, sans-serif',
  },
  closeButtonTouchable: {
    padding: 5,
  },
  chatCloseButton: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '300',
    fontFamily: 'Inter, sans-serif',
  },
  chatHistoryScroll: {
    flex: 1,
  },
  chatBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
  },
  chatBubbleUser: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-end',
  },
  chatBubbleAI: {
    backgroundColor: '#1A1A1A',
    alignSelf: 'flex-start',
  },
  chatBubbleText: {
    fontSize: 14,
    color: '#CCCCCC',
    fontFamily: 'Inter, sans-serif',
  },
  chatBubbleTextUser: {
    color: '#000000',
  },
  routeDetailsWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 220 : 200,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
  },
  routeDetailsScroll: {
    flex: 1,
  },
  routeDetailsContent: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  journeyTimeline: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  },
  timelineStep: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineIconContainer: {
    alignItems: 'center',
    marginRight: 12,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E0E0E0',
  },
  timelineContent: {
    flex: 1,
    paddingTop: 4,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
    fontFamily: 'Inter, sans-serif',
  },
  timelineSubtitle: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 2,
    fontFamily: 'Inter, sans-serif',
  },
  timelineTime: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'Inter, sans-serif',
  },
  busLineTag: {
    backgroundColor: '#8B5CF6',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  busLineTagText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter, sans-serif',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#666666',
    marginRight: 6,
    fontFamily: 'Inter, sans-serif',
  },
  scheduleTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
  },
  delayInfoContainer: {
    marginTop: 6,
    gap: 6,
  },
  delayTag: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  delayTagText: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
  },
  predictedTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  predictedLabel: {
    fontSize: 12,
    color: '#92400E',
    marginRight: 6,
    fontFamily: 'Inter, sans-serif',
  },
  predictedTime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    fontFamily: 'Inter, sans-serif',
  },
  journeySummary: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
    fontFamily: 'Inter, sans-serif',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  journeySummaryCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
      },
    }),
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryTimeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
  },
  summaryDelayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E63946',
    fontFamily: 'Inter, sans-serif',
  },
  expandIconText: {
    fontSize: 16,
    color: '#666666',
    fontFamily: 'Inter, sans-serif',
  },
  timelineStepClickable: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineExpandIcon: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 8,
  },
  noDelayText: {
    fontSize: 12,
    color: '#10B981',
    fontFamily: 'Inter, sans-serif',
    fontWeight: '600',
    marginTop: 4,
  },
  stationsListContainer: {
    marginTop: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  stationsListTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    fontFamily: 'Inter, sans-serif',
  },
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  stationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
    marginRight: 12,
  },
  stationDotBoarding: {
    backgroundColor: '#8B5CF6',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stationDotExit: {
    backgroundColor: '#10B981',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stationInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stationName: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'Inter, sans-serif',
    flex: 1,
  },
  stationNameBold: {
    fontWeight: '700',
    color: '#111827',
  },
  stationTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: 'Inter, sans-serif',
  },
  popupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    paddingHorizontal: 20,
  },
  popupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Inter, sans-serif',
    flex: 1,
  },
  popupCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  popupCloseText: {
    fontSize: 20,
    color: '#666666',
    fontWeight: '300',
  },
  popupContent: {
    padding: 20,
  },
  popupText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
    marginBottom: 16,
    fontFamily: 'Inter, sans-serif',
  },
  popupTextBold: {
    fontWeight: '700',
    color: '#000000',
  },
  popupInfoBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  popupInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 12,
    fontFamily: 'Inter, sans-serif',
  },
  popupInfoText: {
    fontSize: 13,
    color: '#555555',
    lineHeight: 20,
    marginBottom: 6,
    fontFamily: 'Inter, sans-serif',
  },
  popupSubtext: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 20,
    fontFamily: 'Inter, sans-serif',
    fontStyle: 'italic',
  },
  popupCallToAction: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  popupCallToActionText: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: 'Inter, sans-serif',
  },
  popupButton: {
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    margin: 20,
    marginTop: 0,
    alignItems: 'center',
  },
  popupButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter, sans-serif',
  },
  expectedDepartureSection: {
    marginTop: 8,
  },
  learnMoreContainer: {
    marginTop: 8,
    gap: 8,
  },
  learnMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  learnMoreIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  learnMoreText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    textDecorationLine: 'underline',
  },
  learnMoreTextInline: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    fontFamily: 'Inter, sans-serif',
    textDecorationLine: 'underline',
    marginLeft: 6,
  },
  noDelayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  aiChatInRoute: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  aiChatLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666666',
    marginBottom: 12,
    fontFamily: 'Inter, sans-serif',
  },
  chatHistoryPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 20,
    paddingHorizontal: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  bottomSummaryBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 10,
    zIndex: 5,
  },
});
