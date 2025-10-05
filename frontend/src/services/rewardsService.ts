// Rewards and Tickets Service
const BACKEND_URL = typeof window !== 'undefined'
  ? (process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000')
  : 'http://backend:8000';

export interface Report {
  id: number;
  user_id: number;
  route?: string;
  station_id?: string;
  reported_time: string;
  delay?: number;
  bus_number?: string;
  status: string;
  issue?: string;
  verified_at?: string;
}

export interface CreateReportRequest {
  user_id: number;
  route?: string;
  station_id?: string;
  delay?: number;
  bus_number?: string;
  issue: string;
  status?: string;
}

export interface UserLevel {
  id: number;
  email: string;
  current_level: number;
  total_verified_reports: number;
  points: number;
}

export interface UserProgress {
  user_id: number;
  current_level: number;
  total_verified_reports: number;
  reports_for_current_level: number;
  current_progress: number;
  progress_percentage: number;
  reward_days: number;
  reports_to_next_ticket: number;
}

export interface Ticket {
  id: number;
  user_id: number;
  days: number;
  earned_date: string;
  earned_level: number;
  activated_date?: string;
  expiry_date?: string;
  is_active: boolean;
  status: string;
  created_at: string;
}

class RewardsService {
  private baseUrl: string;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl;
  }

  // ============= Reports =============

  async createReport(report: CreateReportRequest): Promise<Report> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        throw new Error(`Failed to create report: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Create report error:', error);
      throw error;
    }
  }

  async getUserReports(userId: number, statusFilter?: string): Promise<Report[]> {
    try {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.append('status_filter', statusFilter);
      }

      const url = `${this.baseUrl}/api/reports/user/${userId}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to get reports: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get reports error:', error);
      throw error;
    }
  }

  async verifyReport(reportId: number): Promise<{ message: string; report: Report }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/reports/${reportId}/verify`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error(`Failed to verify report: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Verify report error:', error);
      throw error;
    }
  }

  // ============= User Level =============

  async getUserLevel(userId: number): Promise<UserLevel> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users/${userId}/level`);

      if (!response.ok) {
        throw new Error(`Failed to get user level: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get user level error:', error);
      throw error;
    }
  }

  async getUserProgress(userId: number): Promise<UserProgress> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users/${userId}/progress`);

      if (!response.ok) {
        throw new Error(`Failed to get user progress: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get user progress error:', error);
      throw error;
    }
  }

  // ============= Tickets =============

  async getUserTickets(userId: number): Promise<Ticket[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tickets/user/${userId}`);

      if (!response.ok) {
        throw new Error(`Failed to get tickets: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get tickets error:', error);
      throw error;
    }
  }

  async activateTicket(ticketId: number): Promise<{ message: string; ticket: Ticket }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tickets/${ticketId}/activate`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to activate ticket: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Activate ticket error:', error);
      throw error;
    }
  }

  // ============= Stats =============

  async getLeaderboard(limit: number = 10): Promise<UserLevel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/stats/leaderboard?limit=${limit}`);

      if (!response.ok) {
        throw new Error(`Failed to get leaderboard: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get leaderboard error:', error);
      throw error;
    }
  }
}

export const rewardsService = new RewardsService();
