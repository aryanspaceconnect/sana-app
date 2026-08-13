export type NavigationTab = 'home' | 'agent' | 'calendar';

export interface UserSettings {
  temperatureUnit: 'C' | 'F';
  scanNotificationTime: string; // e.g. '00:00', '06:00', '09:00', '12:00'
  scanReminderEnabled?: boolean;
  lastCompletedScanDate?: string; // YYYY-MM-DD
  theme: 'light' | 'dark' | 'auto';
  locationName?: string;
  latitude?: number;
  longitude?: number;
  isPremium?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  isAnonymous: boolean;
  settings: UserSettings;
}

export interface ConcernImageDetail {
  concernName: string;
  label: string;
  score: number;
  mask_url?: string;
  description?: string;
  bbox?: [number, number, number, number];
}

export interface PerfectCorpRegionOverlay {
  regionId: string;
  regionName: 'pores' | 'dark_circles' | 'redness_barrier' | 'acne_spots' | 'wrinkles_texture' | 'spots' | 'moisture' | 'firmness' | string;
  label: string;
  severityScore: number; // 0-100
  severityLevel: 'mild' | 'moderate' | 'elevated' | 'severe';
  // Bounding box in percentage [top, left, width, height]
  bbox: [number, number, number, number];
  colorHex: string;
  description: string;
}

export interface PerfectCorpConcernDetail {
  concernName: string;
  raw_score: number;
  ui_score: number;
  mask_urls?: string[];
  mask_url?: string;
}

export interface PerfectCorpScoreInfo {
  all: number; // Overall skin score (1-100)
  skin_age: number; // AI estimated skin age
  concerns: Record<string, PerfectCorpConcernDetail>;
}

export interface PerfectCorpRawOutput {
  scanId: string;
  taskId: string;
  fileId: string;
  timestamp: string;
  provider: 'PerfectCorp_S2S_v2.1_Live' | 'PerfectCorp_S2S_v2.1_Simulator' | 'PerfectCorp_S2S_v2.0_Live' | 'PerfectCorp_S2S_v2.0_Simulator' | string;
  rawMetrics: {
    poresScore: number;
    darkCirclesScore: number;
    barrierRednessScore: number;
    acneBlemishScore: number;
    moistureScore: number;
    skinAge: number;
    firmnessScore: number;
    overallScore: number;
  };
  scoreInfo: PerfectCorpScoreInfo;
  s2sStepLogs: string[];
  annotatedRegions: PerfectCorpRegionOverlay[];
  rawResponseLog: string;
}

export interface SkinAnalysisIntegrityLog {
  integrityStatus: 'VALID' | 'WARNING' | 'FAILED';
  passedChecks: string[];
  integrityErrors: string[];
  schemaVerified: boolean;
  directUploadFlag: boolean;
  validatedAt: string;
}

export interface SkinTrendGraphPoint {
  date: string; // YYYY-MM-DD
  hydrationScore: number;
  barrierScore: number;
  clarityScore: number;
  acneIndex: number;
  notes?: string;
}

export interface FacialScanResult {
  id?: string;
  userId?: string;
  scanId?: string;
  scanType?: 'daily_scan' | 'intermediate_scan';
  hydrationScore: number;
  barrierScore: number;
  clarityScore: number;
  summary: string;
  recommendations: string[];
  uvRecommendation?: string;
  timestamp?: any;
  capturedImage?: string;
  concernImages?: Record<string, ConcernImageDetail>;
  // Perfect Corp API & Context Manager Extensions
  rawPerfectCorpOutput?: PerfectCorpRawOutput;
  integrityLog?: SkinAnalysisIntegrityLog;
  annotatedRegions?: PerfectCorpRegionOverlay[];
  s2sStepLogs?: string[];
  rawResponseLog?: string;
  rawJson?: any;
  rawMetrics?: any;
  scoreInfo?: any;
  historicalComparison?: {
    past2ScansSummary: string;
    twoWeekTrendSummary: string;
    progressNotes: string[];
  };
  reportStatus?: 'running' | 'ready';
  reportText?: string;
  reportSessionId?: string;
  masks?: any[];
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
