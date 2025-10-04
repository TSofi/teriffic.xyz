// For web browser, use localhost. For Docker internal, use ai-service
const AI_SERVICE_URL = typeof window !== 'undefined'
  ? (process.env.REACT_APP_AI_SERVICE_URL || 'http://localhost:8001')
  : 'http://ai-service:8001';

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  include_history?: boolean;
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
  tool_calls?: any[];
}

export interface TranscribeRequest {
  audio_base64: string;
}

export interface TranscribeResponse {
  text: string;
  success: boolean;
}

export interface HealthResponse {
  status: string;
  version: string;
  model: string;
}

class AIService {
  private baseUrl: string;

  constructor(baseUrl: string = AI_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    try {
      console.log('Sending chat request to:', `${this.baseUrl}/chat`);
      console.log('Request payload:', request);

      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`Chat API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Response data:', data);
      return data;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Transcribe API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Transcribe error:', error);
      throw error;
    }
  }

  async health(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);

      if (!response.ok) {
        throw new Error(`Health API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  }

  // Helper: Convert audio blob to base64
  async audioToBase64(audioBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (e.g., "data:audio/webm;base64,")
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });
  }
}

export const aiService = new AIService();
