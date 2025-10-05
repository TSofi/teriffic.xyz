import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { Notification } from '../services/notificationService';

interface NotificationToastProps {
  notification: Notification | null;
  onDismiss: () => void;
}

const isWeb = Platform.OS === 'web';

export default function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (notification) {
      // Slide in and fade in
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after 5 seconds
      const timeout = setTimeout(() => {
        dismissNotification();
      }, 5000);

      return () => clearTimeout(timeout);
    }
  }, [notification]);

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!notification) {
    return null;
  }

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'bus_delay':
        return '#FF9800'; // Orange
      case 'route_update':
        return '#2196F3'; // Blue
      case 'bus_arrival':
        return '#4CAF50'; // Green
      case 'service_alert':
        return '#F44336'; // Red
      case 'test':
        return '#9C27B0'; // Purple
      default:
        return '#757575'; // Gray
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.toast}
        onPress={dismissNotification}
        activeOpacity={0.9}
      >
        <View style={[styles.indicator, { backgroundColor: getNotificationColor(notification.type) }]} />
        <View style={styles.content}>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.message}>{notification.message}</Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={dismissNotification}>
          <Text style={styles.closeIcon}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  toast: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  indicator: {
    width: 4,
    height: 50,
    borderRadius: 2,
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 4,
    fontFamily: 'Inter, sans-serif',
  },
  message: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'Inter, sans-serif',
  },
  closeButton: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    fontSize: 24,
    color: '#999999',
    fontWeight: '300',
  },
});
