import { GoogleGenAI } from "@google/genai";
import { getUniversalNotepad } from "../universalNotepad.js";
import { fetchAdvancedEnvironmentalData } from "./WeatherAwarenessEngine.js";
import { getPastScansForUser, db, sanitizeForFirestore } from "../../lib/firebase.js";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";

export interface CompanionSignalResponse {
  id: string;
  userId: string;
  lines: string[];
  timestamp: string;
  cachedAt: string;
  enabled: boolean;
  contextMeta?: {
    locationName: string;
    temperature: string;
    weatherCondition: string;
    uvIndex: number;
    dewPoint: string;
    goalSummary: string;
    scansCount: number;
    lastScanDate?: string;
  };
}

const MEMORY_CACHE: Record<string, { timestamp: number; data: CompanionSignalResponse }> = {};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours cache

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

function parseToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      // ignore
    }
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function safeIsoString(val: any, fallback: string = new Date().toISOString()): string {
  const d = parseToDate(val);
  return d ? d.toISOString() : (typeof val === 'string' && val.length > 0 ? val : fallback);
}

function safeDateOnlyString(val: any, fallback: string = 'Unknown'): string {
  const d = parseToDate(val);
  if (d) return d.toISOString().split('T')[0];
  if (typeof val === 'string' && val.length > 0) return val;
  return fallback;
}

/**
 * Generate or fetch warm, context-aware Daily Companion Signals for the user
 */
export async function getOrGenerateCompanionSignals(
  userId: string,
  userProfile: any,
  options: { forceRefresh?: boolean; latitude?: number; longitude?: number } = {}
): Promise<CompanionSignalResponse> {
  const safeUid = userId || 'guest_user';
  const settings = userProfile?.settings || {};
  const enabled = settings.companionSignalsEnabled !== false; // default true

  if (!enabled) {
    return {
      id: `signal_disabled_${Date.now()}`,
      userId: safeUid,
      lines: [],
      timestamp: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
      enabled: false
    };
  }

  // 1. Check in-memory memory cache
  const nowMs = Date.now();
  if (!options.forceRefresh && MEMORY_CACHE[safeUid]) {
    const cached = MEMORY_CACHE[safeUid];
    if (nowMs - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 2. Check Firestore cache
  try {
    if (db && !options.forceRefresh) {
      const docRef = doc(db, 'users', safeUid, 'companion_signals', 'latest');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const fireData = snap.data() as any;
        const fireDate = parseToDate(fireData.timestamp);
        const fireTime = fireDate ? fireDate.getTime() : 0;
        if (nowMs - fireTime < CACHE_TTL_MS && Array.isArray(fireData.lines) && fireData.lines.length > 0) {
          const resObj: CompanionSignalResponse = {
            id: fireData.id || `signal_${fireTime}`,
            userId: safeUid,
            lines: fireData.lines,
            timestamp: safeIsoString(fireData.timestamp),
            cachedAt: safeIsoString(fireData.cachedAt),
            enabled: true,
            contextMeta: fireData.contextMeta
          };
          MEMORY_CACHE[safeUid] = { timestamp: fireTime, data: resObj };
          return resObj;
        }
      }
    }
  } catch (err) {
    console.warn("[CompanionSignalsService] Firestore read warning:", err);
  }

  // 3. Check activity check-in window (>2 days inactive check)
  const lastActiveDate = parseToDate(settings.lastCompletedScanDate || userProfile?.updatedAt);
  if (lastActiveDate && !options.forceRefresh) {
    const lastActiveTime = lastActiveDate.getTime();
    const twoDaysMs = 48 * 60 * 60 * 1000;
    if (nowMs - lastActiveTime > twoDaysMs) {
      console.log(`[CompanionSignalsService] User ${safeUid} inactive > 2 days. Returning default warm pulse.`);
      // Return a soft default pulse until they check in
      const defaultLines = [
        `Welcome back, ${settings.preferredName || userProfile?.displayName || 'friend'} — your skin barrier is ready whenever you are today.`,
        `A gentle water cleanse and light hydration are all your skin needs to start fresh today.`
      ];
      return {
        id: `signal_default_${nowMs}`,
        userId: safeUid,
        lines: defaultLines,
        timestamp: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
        enabled: true
      };
    }
  }

  // 4. Gather Full Payload Context
  const preferredName = settings.preferredName || userProfile?.displayName || 'Friend';
  const locationName = settings.locationName || userProfile?.locationName || 'Bardoli, IN';
  const lat = options.latitude ?? settings.latitude ?? 21.12;
  const lon = options.longitude ?? settings.longitude ?? 73.11;

  // Goals & Dates
  const skincareGoals = settings.skincareGoals || userProfile?.skincareGoals || 'Restore skin barrier & boost glow';
  const skinPriorities = settings.skinPriorities || userProfile?.skinPriorities || 'Barrier protection & even tone';
  const upcomingEvent = settings.upcomingEvent || userProfile?.upcomingEvent || 'Daily skin health milestone';

  // Profile particulars
  const userPerception = settings.userPerceptionText || userProfile?.userPerceptionText || 'Skin feels sensitive and prone to occasional dryness';
  const hormonalFactors = settings.hormonalFactors || userProfile?.hormonalFactors || 'Pre-menstrual chin breakouts';
  const genderProfile = settings.gender || userProfile?.gender || 'Prefer Not to Say';
  const heightProfile = settings.height || userProfile?.height || '170 cm';

  // Fetch Universal Notepad
  let universalNotepad = '';
  try {
    universalNotepad = await getUniversalNotepad(safeUid);
  } catch (e) {
    console.warn("[CompanionSignalsService] Universal notepad fetch error:", e);
  }

  // Fetch Environmental Weather Forecast
  let envData: any = null;
  try {
    envData = await fetchAdvancedEnvironmentalData({
      latitude: lat,
      longitude: lon,
      locationName,
      includeAirQuality: true,
      includeHourlyForecast: true,
      includeYesterdayComparison: true
    });
  } catch (e) {
    console.warn("[CompanionSignalsService] Weather fetch warning:", e);
  }

  // Fetch Scan History & Trend Data (past 30 days)
  let pastScans: any[] = [];
  try {
    pastScans = await getPastScansForUser(safeUid, 30);
  } catch (e) {
    console.warn("[CompanionSignalsService] Past scans fetch warning:", e);
  }

  // Construct scan trend string (X-axis: dates & scan IDs, Y-axis: scores)
  let scanGraphSummary = "No recent facial scans recorded yet.";
  let lastScanDateStr = undefined;
  if (pastScans.length > 0) {
    const rawFirstScanDate = pastScans[0].scanDate || pastScans[0].timestamp;
    lastScanDateStr = safeIsoString(rawFirstScanDate, 'Recently');

    const scanPoints = pastScans.map(s => {
      const scanId = s.scanId || s.id || 'scan';
      const date = s.scanDate ? String(s.scanDate) : safeDateOnlyString(s.timestamp, 'Unknown');
      const h = s.hydrationScore ?? 80;
      const b = s.barrierScore ?? 80;
      const c = s.clarityScore ?? 80;
      return `[Scan ID: ${scanId} | Date: ${date} => Hydration: ${h}/100, Barrier: ${b}/100, Clarity: ${c}/100]`;
    }).join('\n');

    scanGraphSummary = `Scan History (Range: ${pastScans.length} scans in past 30 days):\n${scanPoints}`;
  }

  const currentTemp = envData ? `${Math.round(envData.currentExposome.tempC)}°C` : '28°C';
  const weatherCond = envData ? envData.currentExposome.weatherCondition : 'Partly Sunny';
  const uvIdx = envData ? envData.currentExposome.uvIndex : 6;
  const dewPt = envData ? `${envData.currentExposome.dewPointC}°C` : '20°C';

  // Build LLM Prompt
  const prompt = `You are a warm, highly perceptive, compassionate skin health companion — like a caring dermatologist friend giving a 2-second check-in for ${preferredName}'s home screen.

Context Payload:
1. USER IDENTITY & GOALS:
   - Preferred Name: ${preferredName}
   - Biological / Height Profile: ${genderProfile}, ${heightProfile}
   - Long-Term Skincare Goal: "${skincareGoals}"
   - Skin Focus Priority: "${skinPriorities}"
   - Upcoming Event & Target Timeline: "${upcomingEvent}"
   - Self Skin Perception & Notes: "${userPerception}"
   - Hormonal & Cycle Factors: "${hormonalFactors}"

2. UNIVERSAL NOTEPAD MEMORY:
   ${universalNotepad ? `"${universalNotepad}"` : "None recorded"}

3. ENVIRONMENTAL & WEATHER FORECAST (Location: ${locationName}):
   - Current Temp: ${currentTemp}, Condition: ${weatherCond}
   - UV Index: ${uvIdx}, Dew Point: ${dewPt}, Humidity: ${envData?.currentExposome?.humidityPercent ?? 65}%
   - Air Quality AQI: ${envData?.airQuality?.usAqi ?? 65} (${envData?.airQuality?.aqiCategory ?? 'Moderate'})
   - Afternoon / Forecast Outlook: ${envData?.hourlyForecastNext24h?.afternoonWorseningNote || "Stable conditions"}

4. SKIN ANALYZER GRAPH TREND (Past 30 Days):
   ${scanGraphSummary}

TONE & MANDATORY GUIDELINES:
- Warm, human, non-judgmental, non-instructive, deeply personal.
- NOT a to-do list, NOT do's and don'ts, NOT a checklist, NOT a streak/points/badge, NOT a motivational quote, NOT a lecture.
- "Specific enough to surprise" — tied directly to ${preferredName}'s location (${locationName}), live air/dew point today, and personal skin milestones.
- "One lean / one leave, not a list".
- "If it never earns a 'wait, that's for me' reaction, it's too soft. If it lectures, it's too much. Home's job is to deliver that feeling in under two seconds — before they open chat."
- NO hallucination: do NOT invent fake numbers or made-up metrics not provided above.

OUTPUT FORMAT REQUIREMENTS:
Return ONLY a valid JSON array of 2 or 3 single-line lean sentences. Do NOT include Markdown formatting or code blocks or anything outside the JSON array.
Example:
[
  "Bardoli's dew point is climbing to 21°C this afternoon — swap your heavy cream for a light gel before your 3 PM meeting to keep pores clear.",
  "Since your wedding goal is 3 weeks away, give that chin breakout room to breathe today rather than layering extra salicylic acid."
]`;

  let lines: string[] = [];
  try {
    const ai = getGeminiClient();
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.7,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || '';
      try {
        const parsed = JSON.parse(responseText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          lines = parsed.map(s => String(s).trim()).filter(Boolean).slice(0, 3);
        }
      } catch (parseErr) {
        console.warn("[CompanionSignalsService] JSON parse fallback:", parseErr);
        // Clean manual extract if json codeblock
        const cleanJsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const fallbackArray = JSON.parse(cleanJsonStr);
        if (Array.isArray(fallbackArray)) {
          lines = fallbackArray.map(s => String(s).trim()).filter(Boolean).slice(0, 3);
        }
      }
    }
  } catch (llmErr) {
    console.warn("[CompanionSignalsService] Gemini generation warning:", llmErr);
  }

  // Fallback lines if generation failed
  if (lines.length === 0) {
    lines = [
      `${locationName}'s humidity is ${envData?.currentExposome?.humidityPercent ?? 65}% today — keep hydration lightweight to support your ${skincareGoals.toLowerCase()} goal.`,
      `Your skin barrier resilience is holding steady; give active ingredients a soft pause tonight to let natural repair work.`
    ];
  }

  const signalId = `signal_${nowMs}`;
  const timestampIso = new Date().toISOString();

  const finalResult: CompanionSignalResponse = {
    id: signalId,
    userId: safeUid,
    lines,
    timestamp: timestampIso,
    cachedAt: timestampIso,
    enabled: true,
    contextMeta: {
      locationName,
      temperature: currentTemp,
      weatherCondition: weatherCond,
      uvIndex: uvIdx,
      dewPoint: dewPt,
      goalSummary: skincareGoals,
      scansCount: pastScans.length,
      lastScanDate: lastScanDateStr
    }
  };

  // Update in-memory cache
  MEMORY_CACHE[safeUid] = { timestamp: nowMs, data: finalResult };

  // 5. Persist to Firestore: latest document AND append to change history subcollection
  try {
    if (db) {
      const latestRef = doc(db, 'users', safeUid, 'companion_signals', 'latest');
      await setDoc(latestRef, sanitizeForFirestore({
        ...finalResult,
        updatedAt: serverTimestamp()
      }), { merge: true });

      // Append to history subcollection
      const historyCol = collection(db, 'users', safeUid, 'companion_signals_history');
      await addDoc(historyCol, sanitizeForFirestore({
        ...finalResult,
        createdAt: serverTimestamp()
      }));
    }
  } catch (fsErr) {
    console.warn("[CompanionSignalsService] Firestore write warning:", fsErr);
  }

  return finalResult;
}
