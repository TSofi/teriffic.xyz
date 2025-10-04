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
  const [arrivalPoint, setArrivalPoint] = useState('');
  const [destinationPoint, setDestinationPoint] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [routeData, setRouteData] = useState<any>(null);
  const [isSearchingRoute, setIsSearchingRoute] = useState(false);
  const [isFindingLocation, setIsFindingLocation] = useState(false);
  const [arrivalSuggestions, setArrivalSuggestions] = useState<any[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([]);
  const [showArrivalSuggestions, setShowArrivalSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const panelHeightAnim = useRef(new Animated.Value(0)).current;
  const iconOpacityAnim = useRef(new Animated.Value(1)).current;
  const arrivalDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const destinationDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

  const busLines = [
    { number: '999', color: ['#E63946', '#DC2F02'] },
    { number: '704', color: ['#06B6D4', '#0891B2'] },
    { number: '111', color: ['#10B981', '#059669'] },
  ];

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

  const handleFindMyLocation = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsFindingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

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

      // Call route service
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
      console.log('Route planned successfully:', enrichedRoute);
    } catch (error) {
      console.error('Route search error:', error);
      alert('Could not plan route. Please try again.');
    } finally {
      setIsSearchingRoute(false);
    }
  };

  return (
    <View style={[styles.webContainer, isWeb && styles.webCentered]}>
      <View style={[styles.container, isWeb && styles.mobileFrame]}>
        {/* Google Maps Background */}
        <View style={styles.map}>
          <MapComponent
            center={{ lat: 50.0647, lng: 19.9450 }}
            zoom={13}
            useCurrentLocation={false}
            routeData={routeData}
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

        {/* Bottom Panel */}
        <Animated.View
          style={[
            styles.bottomPanel,
            isChatExpanded && {
              height: panelHeightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [200, 500],
              }),
            }
          ]}
        >
          {/* Chat History - Only visible when expanded */}
          {isChatExpanded && chatHistory.length > 0 && (
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
          )}

          {/* Bus Lines Section - Hidden when chat is expanded */}
          {!isChatExpanded && (
            <View style={styles.busLinesSection}>
            <Text style={styles.sectionTitle}>Your Bus Lines</Text>
            <View style={styles.busLinesRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.busLinesScroll}
                contentContainerStyle={styles.busLinesContent}
              >
                {busLines.map((bus, index) => (
                  <View
                    key={index}
                    style={[
                      styles.busLineCardWrapper,
                      {
                        background: `linear-gradient(135deg, ${bus.color[0]}, ${bus.color[1]})`,
                      },
                    ]}
                  >
                    <View style={styles.busLineCard}>
                      <Text
                        style={[
                          styles.busLineNumber,
                          {
                            background: `linear-gradient(135deg, ${bus.color[0]}, ${bus.color[1]})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          },
                        ]}
                      >
                        #{bus.number}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.rewardsButton}
                onPress={handleRewardsPress}
                activeOpacity={0.8}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 4H20V8H4V4Z"
                    stroke="#000000"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 8H20V20H4V8Z"
                    stroke="#000000"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 12H16M8 16H12"
                    stroke="#000000"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {/* White Divider - Hidden when chat is expanded */}
          {!isChatExpanded && <View style={styles.horizontalDivider} />}

          {/* AI Chat Section */}
          <View style={styles.chatSection}>
            <TextInput
              style={styles.chatInput}
              placeholder="Ask AI assistant..."
              placeholderTextColor="#666"
              value={chatMessage}
              onChangeText={setChatMessage}
              multiline
              editable={!isLoading}
            />
            {isLoading ? (
              <View style={styles.actionButton}>
                <ActivityIndicator size="small" color="#000000" />
              </View>
            ) : chatMessage.trim().length > 0 ? (
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
                  style={[styles.actionButton, isRecording && styles.actionButtonRecording]}
                  onPress={handleVoiceRecord}
                  activeOpacity={0.8}
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
        </Animated.View>
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
  routeInputContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
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
});
