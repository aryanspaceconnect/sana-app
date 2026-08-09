export type NavigationTab = 'home' | 'agent' | 'calendar';

export interface UserSettings {
  temperatureUnit: 'C' | 'F';
  scanNotificationTime: string;
  theme: 'light' | 'dark';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  isAnonymous: boolean;
  settings: UserSettings;
}

export interface FacialScanResult {
  id?: string;
  hydrationScore: number;
  barrierScore: number;
  clarityScore: number;
  summary: string;
  recommendations: string[];
  uvRecommendation?: string;
  timestamp?: any;
}

export interface ThinkingMeta {
  intent: string;
  thinkingMode: 'hard' | 'easy';
  complexityScore: number;
  appliedRules: string[];
  reasoningSteps: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  thinkingMeta?: ThinkingMeta;
  actionProposal?: any;
  passOnTrace?: any[];
  sessionId?: string;
}

export interface CalendarEventItem {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: 'scan' | 'routine' | 'wellness';
  completed?: boolean;
}

export interface DailyBriefing {
  greeting: string;
  temperature: string;
  weatherCondition: string;
  uvIndex: number;
  uvLevel: string;
  humidity: string;
  waterTargetLiters: string;
  primaryReminders: string[];
}

export interface PopUpNotification {
  id: string;
  type: 'facial_scan' | 'uv_alert' | 'agent_reminder';
  title: string;
  subtitle: string;
  timeAgo: string;
  actionText?: string;
  iconType: 'scan' | 'sun' | 'sparkle';
}
