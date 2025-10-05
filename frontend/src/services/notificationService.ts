const ROUTE_SERVICE_URL = typeof window !== 'undefined'
  ? (process.env.REACT_APP_ROUTE_SERVICE_URL || 'http://localhost:8000')
  : 'http://route-service:8000';

export interface Notification {
  id: number;
  user_id: number;
  type: 'bus_delay' | 'route_update' | 'bus_arrival' | 'service_alert' | 'test';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

type NotificationCallback = (notification: Notification) => void;

class NotificationService {
  private eventSource: EventSource | null = null;
  private callbacks: NotificationCallback[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private userId: number = 1;

  setUserId(userId: number) {
    this.userId = userId;
  }

  connect() {
    if (this.eventSource) {
      console.log('EventSource already connected');
      return;
    }

    const url = `${ROUTE_SERVICE_URL}/api/notifications/stream?user_id=${this.userId}`;
    console.log('Connecting to notification stream:', url);

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('Notification stream connected');
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.eventSource.onmessage = (event) => {
      try {
        const notification: Notification = JSON.parse(event.data);
        console.log('Received notification:', notification);
        this.callbacks.forEach(callback => callback(notification));
      } catch (error) {
        console.error('Failed to parse notification:', error);
      }
    };

    // Listen for custom event types (like report_verified)
    this.eventSource.addEventListener('report_verified', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Report verified notification:', data);

        // Only show if notification is for current user
        if (data.user_id === this.userId) {
          const notification: Notification = {
            id: Date.now(),
            user_id: data.user_id,
            type: 'test', // Using 'test' type for purple color
            title: 'Congrats!',
            message: 'Your report has been verified!',
            timestamp: new Date().toISOString(),
            read: false,
          };
          this.callbacks.forEach(callback => callback(notification));
        }
      } catch (error) {
        console.error('Failed to parse report_verified event:', error);
      }
    });

    this.eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      this.disconnect();

      // Attempt to reconnect after 5 seconds
      this.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect to notification stream...');
        this.connect();
      }, 5000);
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('Notification stream disconnected');
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  onNotification(callback: NotificationCallback) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  async sendTestNotification(): Promise<any> {
    try {
      const response = await fetch(`${ROUTE_SERVICE_URL}/api/notifications/test?user_id=${this.userId}`);
      if (!response.ok) {
        throw new Error(`Test notification failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to send test notification:', error);
      throw error;
    }
  }
}

export const notificationService = new NotificationService();
