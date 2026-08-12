export type NavigationTab = 'home' | 'agent' | 'calendar';

export interface UserSettings {
  temperatureUnit: 'C' | 'F';
  scanNotificationTime: string; // e.g. '00:00', '06:00', '09:00', '12:00'
  scanReminderEnabled?: boolean;
  lastCompletedScanDate?: string; // YYYY-MM-DD
  theme: 'light' | 'dark';
  locationName?: string;
  latitude?: number;
  longitude?: number;
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
  modelThoughts?: string[];
  elapsedSeconds?: number;
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
  searchQuery?: string;
  searchSites?: Array<{ title: string; url: string; discover: number; finish: number }>;
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
  locationName?: string;
  dewPoint?: string;
}

export interface PopUpNotification {
  id: string;
  type: 'facial_scan' | 'uv_alert' | 'agent_reminder' | 'custom_action';
  title: string; // 10-30 characters
  subtitle: string;
  timeAgo: string;
  actionText?: string;
  iconType?: 'scan' | 'sun' | 'sparkle' | 'shield' | 'droplet' | 'clock' | 'alert';
  badgeText?: string;
  actionTarget?: 'scan' | 'calendar' | 'reports' | 'vault' | 'agent';
  autoTriggered?: boolean;
}
