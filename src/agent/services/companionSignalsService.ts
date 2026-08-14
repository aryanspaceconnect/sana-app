import { GoogleGenAI } from "@google/genai";
import { getUniversalNotepad } from "../universalNotepad.js";
import { fetchAdvancedEnvironmentalData } from "./WeatherAwarenessEngine.js";
import { getPastScansForUser, db, sanitizeForFirestore } from "../../lib/firebase.js";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";

export interface CompanionSignalResponse {
  id: string;
  userId: string;
  lines: string[];
  windowId: string;
  windowLabel: string;
  timestamp: string;
  cachedAt: string;
  enabled: boolean;
  contextMeta?: {
    locationName: string;
    localHour: number;
    localTimeStr: string;
    temperature: string;
    weatherCondition: string;
    uvIndex: number;
    dewPoint: string;
    peakUvToday?: number;
    maxTempToday?: string;
    afternoonTrend?: string;
    goalSummary: string;
    scansCount: number;
    lastScanDate?: string;
    earlierDayWindowsCount?: number;
  };
}

export type DiurnalWindowKey = 'window_04_06' | 'window_06_11' | 'window_11_17' | 'window_17_22' | 'window_22_04';

interface DiurnalWindowInfo {
  key: DiurnalWindowKey;
  label: string;
  startHour: number;
  endHour: number;
  isNight: boolean;
  periodDescription: string;
}

/**
 * Determine diurnal window from local hour (0-23)
 * 04:00 - 05:59 -> Early Morning (window_04_06)
 * 06:00 - 10:59 -> Morning (window_06_11)
 * 11:00 - 16:59 -> Midday / Afternoon (window_11_17)
 * 17:00 - 21:59 -> Evening (window_17_22)
 * 22:00 - 03:59 -> Night / Recovery (window_22_04)
 */
export function getDiurnalWindowInfo(localHour: number): DiurnalWindowInfo {
  if (localHour >= 4 && localHour < 6) {
    return {
      key: 'window_04_06',
      label: 'Early Morning (4 AM - 6 AM)',
      startHour: 4,
      endHour: 6,
      isNight: false,
      periodDescription: 'Early dawn awakenings, pre-sun barrier preparation.'
    };
  } else if (localHour >= 6 && localHour < 11) {
    return {
      key: 'window_06_11',
      label: 'Morning (6 AM - 11 AM)',
      startHour: 6,
      endHour: 11,
      isNight: false,
      periodDescription: 'Morning barrier setup, rising daylight, diurnal activation.'
    };
  } else if (localHour >= 11 && localHour < 17) {
    return {
      key: 'window_11_17',
      label: 'Midday & Afternoon (11 AM - 5 PM)',
      startHour: 11,
      endHour: 17,
      isNight: false,
      periodDescription: 'Peak solar heat/UV, oil transpiration, hydration refresh.'
    };
  } else if (localHour >= 17 && localHour < 22) {
    return {
      key: 'window_17_22',
      label: 'Evening & Golden Hour (5 PM - 10 PM)',
      startHour: 17,
      endHour: 22,
      isNight: true,
      periodDescription: 'Evening detox, post-sun barrier replenishment.'
    };
  } else {
    return {
      key: 'window_22_04',
      label: 'Night & Cellular Repair (10 PM - 4 AM)',
      startHour: 22,
      endHour: 4,
      isNight: true,
      periodDescription: 'Overnight rest, stratum corneum lipid regeneration.'
    };
  }
}

// In-memory diurnal cache: key is `${userId}_${dateStr}`
const DIURNAL_MEMORY_CACHE: Record<string, {
  dateStr: string;
  windows: Partial<Record<DiurnalWindowKey, CompanionSignalResponse>>;
  lastUpdated: number;
}> = {};

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
 * Programmatic Post-LLM Guard (mirrors eval.md rules)
 *
 * Rules:
 * - lines = lines.slice(0, 6)
 * - Drop line if length > 72
 * - If name appears in >1 line → strip name from extras
 * - If city appears in >1 line → strip from extras
 * - Reject / regen if match:
 *   /it's not .+, it's/i, /here's the thing/i, /remember:/i, /keep in mind/i, /studies show/i,
 *   /don't forget/i, /what most people miss/i, /the key:/i
 * - Night: drop /uv|spf|sunscreen/i
 */
export function runPostLlmGuard(
  rawLines: string[],
  options: {
    userName?: string;
    cityName?: string;
    isNight?: boolean;
  }
): string[] {
  let lines = Array.isArray(rawLines) ? [...rawLines] : [];

  const REJECT_PATTERNS = [
    /it's not .+, it's/i,
    /here's the thing/i,
    /remember:/i,
    /keep in mind/i,
    /studies show/i,
    /don't forget/i,
    /what most people miss/i,
    /the key:/i,
    /nobody tells you/i,
    /not a routine/i,
    /not a checklist/i,
    /\b(delve|foster|leverage|utilize|facilitate|empower|streamline|cutting-edge|transformative|elevate|embark|harness|meticulous|paramount|game-changer|tapestry|realm)\b/i
  ];

  // 1. Cap to max 6 lines
  lines = lines.slice(0, 6);

  const cleaned: string[] = [];
  let nameCount = 0;
  let cityCount = 0;

  const normalizedName = options.userName?.trim();
  const normalizedCity = options.cityName?.split(',')[0]?.trim();

  for (const line of lines) {
    if (typeof line !== 'string') continue;
    let l = line.trim();
    if (!l) continue;

    // Strip leading dashes, bullet points, numbers, emoji, outer quotes
    l = l.replace(/^[-*•\d.)\]]+\s*/, '')
         .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
         .replace(/^["']|["']$/g, '')
         .trim();

    if (!l) continue;

    // Reject / filter if matches hard slop patterns
    if (REJECT_PATTERNS.some(rgx => rgx.test(l))) {
      continue;
    }

    // Night: drop /uv|spf|sunscreen/i
    if (options.isNight && /uv|spf|sunscreen/i.test(l)) {
      continue;
    }

    // Drop line if length > 72
    if (l.length > 72) {
      if (l.length > 80) {
        continue;
      }
      // Trim slightly if just over 72
      l = l.slice(0, 72).replace(/[\s,;:-]+$/, '');
      if (!l.endsWith('.')) l += '.';
    }

    // If name appears in > 1 line → strip name from extras
    if (normalizedName && normalizedName.length > 1) {
      const nameRegex = new RegExp(`\\b${normalizedName}\\b`, 'gi');
      if (nameRegex.test(l)) {
        nameCount++;
        if (nameCount > 1) {
          l = l.replace(nameRegex, '').replace(/\s{2,}/g, ' ').replace(/^,\s*/, '').replace(/,\s*,/g, ',').trim();
        }
      }
    }

    // If city appears in > 1 line → strip from extras
    if (normalizedCity && normalizedCity.length > 2) {
      const cityRegex = new RegExp(`\\b${normalizedCity}\\b`, 'gi');
      if (cityRegex.test(l)) {
        cityCount++;
        if (cityCount > 1) {
          l = l.replace(cityRegex, 'here').replace(/\s{2,}/g, ' ').trim();
        }
      }
    }

    l = l.trim();
    if (l && l.length <= 72) {
      cleaned.push(l);
    }
  }

  // If no lines passed guard, provide a clean fall-through conforming to guard
  if (cleaned.length === 0) {
    if (options.isNight) {
      return [
        "Evening air is quiet — let a rich barrier cream work overnight.",
        "Rest early to support cellular skin repair."
      ];
    }
    return [
      "Keep morning hydration lightweight and breathable today.",
      "Let active serums rest if your barrier feels reactive."
    ];
  }

  return cleaned.slice(0, 6);
}

/**
 * Generate or fetch warm, context-aware Daily Compassion Sync Signals for the user
 */
export async function getOrGenerateCompanionSignals(
  userId: string,
  userProfile: any,
  options: {
    forceRefresh?: boolean;
    latitude?: number;
    longitude?: number;
    clientLocalTime?: string;
    clientHour?: number;
    clientDateStr?: string;
    timezone?: string;
  } = {}
): Promise<CompanionSignalResponse> {
  const safeUid = userId || 'guest_user';
  const settings = userProfile?.settings || {};
  const enabled = settings.companionSignalsEnabled !== false; // default true

  // Derive local date & hour accurately
  let localHour = typeof options.clientHour === 'number' && !isNaN(options.clientHour)
    ? options.clientHour
    : new Date().getHours();

  if (options.clientLocalTime) {
    try {
      const clientDate = new Date(options.clientLocalTime);
      if (!isNaN(clientDate.getTime())) {
        localHour = clientDate.getHours();
      }
    } catch {
      // ignore
    }
  }

  const now = new Date();
  const dateStr = options.clientDateStr || now.toISOString().split('T')[0];
  const windowInfo = getDiurnalWindowInfo(localHour);
  const isNight = windowInfo.isNight;

  if (!enabled) {
    return {
      id: `signal_disabled_${Date.now()}`,
      userId: safeUid,
      lines: [],
      windowId: windowInfo.key,
      windowLabel: windowInfo.label,
      timestamp: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
      enabled: false
    };
  }

  // Check In-Memory Diurnal Cache
  const memoryEntry = DIURNAL_MEMORY_CACHE[safeUid];
  if (!options.forceRefresh && memoryEntry && memoryEntry.dateStr === dateStr) {
    const cachedWindowSignal = memoryEntry.windows[windowInfo.key];
    if (cachedWindowSignal && cachedWindowSignal.lines && cachedWindowSignal.lines.length > 0) {
      return cachedWindowSignal;
    }
  }

  // Check Firestore Diurnal Store: users/{uid}/diurnal_signals/{dateStr}
  let earlierDayWindowsContext: Array<{ window: string; label: string; lines: string[] }> = [];
  try {
    if (db) {
      const dayDocRef = doc(db, 'users', safeUid, 'diurnal_signals', dateStr);
      const snap = await getDoc(dayDocRef);
      if (snap.exists()) {
        const dayData = snap.data() as any;
        const storedWindows = dayData.windows || {};

        // Collect all previous windows from earlier in the day
        const windowOrder: DiurnalWindowKey[] = [
          'window_04_06',
          'window_06_11',
          'window_11_17',
          'window_17_22',
          'window_22_04'
        ];

        for (const wKey of windowOrder) {
          if (wKey === windowInfo.key) break;
          if (storedWindows[wKey]?.lines && Array.isArray(storedWindows[wKey].lines)) {
            earlierDayWindowsContext.push({
              window: wKey,
              label: storedWindows[wKey].windowLabel || wKey,
              lines: storedWindows[wKey].lines
            });
          }
        }

        // If not force refresh, and current window is already generated, return it
        if (!options.forceRefresh && storedWindows[windowInfo.key]?.lines?.length > 0) {
          const resObj = storedWindows[windowInfo.key] as CompanionSignalResponse;
          // Update in-memory
          if (!DIURNAL_MEMORY_CACHE[safeUid] || DIURNAL_MEMORY_CACHE[safeUid].dateStr !== dateStr) {
            DIURNAL_MEMORY_CACHE[safeUid] = { dateStr, windows: storedWindows, lastUpdated: Date.now() };
          } else {
            DIURNAL_MEMORY_CACHE[safeUid].windows[windowInfo.key] = resObj;
          }
          return resObj;
        }
      }
    }
  } catch (err) {
    console.warn("[CompassionSignalsService] Firestore read warning:", err);
  }

  // Gather Context
  const preferredName = settings.preferredName || userProfile?.displayName?.split(' ')[0] || 'friend';
  const locationName = settings.locationName || userProfile?.locationName || 'Bardoli, IN';
  const lat = options.latitude ?? settings.latitude ?? 21.12;
  const lon = options.longitude ?? settings.longitude ?? 73.11;

  // Goals & Constraints
  const skincareGoals = settings.skincareGoals || userProfile?.skincareGoals || 'Restore skin barrier & boost glow';
  const skinPriorities = settings.skinPriorities || userProfile?.skinPriorities || 'Barrier protection & hydration';
  const userPerception = settings.userPerceptionText || userProfile?.userPerceptionText || 'Skin sensitive to dryness';
  const hormonalFactors = settings.hormonalFactors || userProfile?.hormonalFactors || 'None reported';

  // Universal Notepad Memory
  let universalNotepad = '';
  try {
    universalNotepad = await getUniversalNotepad(safeUid);
  } catch (e) {
    console.warn("[CompassionSignalsService] Notepad error:", e);
  }

  // Fetch Live Weather + Forecast Throughout the Day
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
    console.warn("[CompassionSignalsService] Weather error:", e);
  }

  // Fetch Past Scans
  let pastScans: any[] = [];
  try {
    pastScans = await getPastScansForUser(safeUid, 15);
  } catch (e) {
    console.warn("[CompassionSignalsService] Scans error:", e);
  }

  const currentTemp = envData ? `${Math.round(envData.currentExposome.tempC)}°C` : '28°C';
  const weatherCond = envData ? envData.currentExposome.weatherCondition : 'Partly Sunny';
  const uvIdx = envData ? envData.currentExposome.uvIndex : 5.0;
  const dewPt = envData ? `${envData.currentExposome.dewPointC}°C` : '22°C';
  const humidity = envData?.currentExposome?.humidityPercent ?? 70;
  const aqi = envData?.airQuality?.usAqi ?? 65;

  const peakUvToday = envData?.solarRadiationAndClouds?.uvIndexMaxToday ?? (uvIdx + 1.5);
  const maxTempToday = envData?.hourlyForecastNext24h?.peakTempHour?.tempC
    ? `${Math.round(envData.hourlyForecastNext24h.peakTempHour.tempC)}°C`
    : currentTemp;
  const afternoonOutlook = envData?.hourlyForecastNext24h?.afternoonWorseningNote || 'Stable conditions across the day';

  // Build string of what was suggested earlier in the day
  let earlierAdviceContextBlock = 'None (First refresh of the day).';
  if (earlierDayWindowsContext.length > 0) {
    earlierAdviceContextBlock = earlierDayWindowsContext
      .map(w => `[${w.label}]:\n` + w.lines.map(l => `  - "${l}"`).join('\n'))
      .join('\n\n');
  }

  // Build System & User Prompt according to exact user specifications
  const systemInstruction = `You write Daily Companion lines for a skincare home screen.

Brain-wise: home is glanced, not read. Working memory holds ~one idea per line. Extra name/city is noise, not care. Care = one true local detail + one true personal constraint, said once, lightly.

Max 72 characters a line, 50-55 suggested, expand only when necessary and max 6 lines.

VOICE
- A quiet, warm friend. Not a coach, not a doctor order list, not marketing.
- Short. Glanced in under two seconds.
- Compassion = specific and light, not soft filler and not lectures.

HARD RULES
- Output ONLY a JSON array of strings. No markdown, no keys, no prose outside the array.
- 2 to 4 lines preferred. Absolute maximum 6.
- Each line: max 64 characters (absolute hard limit 72). No exceptions.
- Do NOT use the user's name unless a single line truly needs it (almost never).
- Do NOT repeat the city/location name in more than one line. Prefer zero times; weather can imply place.
- Do NOT start multiple lines the same way.
- Do NOT invent products, scores, events, or weather not in CONTEXT.
- No bullets, numbering, emoji, hashtags, or "Remember:" / "Don't forget:".
- No full routines. No streaks, quotes, or motivation speeches.
- If night / is_day false: no SPF or UV pressure.
- Prefer one environmental truth + one personal constraint across the set—not the same idea six times.

CONTENT PRIORITY (use only what exists in CONTEXT)
1) Air right now / next hours (humidity, wet, wind, heat)
2) Their goal or recent skin note (if any)
3) Latest scan or trend only if it changes advice
4) Notepad / incident only if concrete

NO-SLOP (hard):
- No binary contrasts ("It's not X, it's Y").
- No throat-clearing ("Remember," "Keep in mind," "Here's the thing," "Don't forget").
- No faux-insight ("What most people miss," "Nobody tells you").
- No colon drama ("The key: light layers.").
- No negative lists ("Not a routine. Not a checklist.").
- No puffery ("vital," "crucial," "journey," "support your goals").
- No "experts/studies say." No invented facts.
- No em-dash stacks.
- No synonym cycling for "skin."
- Portability test: if the line works for anyone, anywhere, make it concrete from CONTEXT or drop it.
- Banned: delve, foster, leverage, utilize, facilitate, empower, streamline, robust, cutting-edge, transformative, elevate, embark, harness, meticulous, paramount, game-changer, tapestry, realm.
- State the thing. Don't explain why it matters.

STYLE EXAMPLES (match this density, not the facts)
["Humidity’s high — keep layers light.", "Let actives rest if the barrier’s been reactive."]
["Grey light still carries UV — a thin SPF is enough.", "Skip heavy cream until the air dries out."]`;

  const promptContent = `CURRENT TIME & DIURNAL WINDOW:
- Local Time: ${localHour.toString().padStart(2, '0')}:00 (Window: ${windowInfo.label})
- Window Phase: ${windowInfo.periodDescription}
- Is Night/Dark: ${isNight}

ENVIRONMENTAL GROUND TRUTH (Location: ${locationName}):
- Current: ${currentTemp}, ${weatherCond}, UV ${uvIdx}, Dew point ${dewPt}, Humidity ${humidity}%, AQI ${aqi}
- Day-Long Forecast: Peak UV ${peakUvToday}, Peak Temp ${maxTempToday}, Outlook: "${afternoonOutlook}"

USER PROFILE & CONSTRAINTS (Internal understanding only — do NOT parrot stupidly):
- Preferred Name: ${preferredName}
- Goal / Priority: "${skincareGoals}" | "${skinPriorities}"
- Skin Note: "${userPerception}"
- Cycle / Incident: "${hormonalFactors}"
${universalNotepad ? `- Notepad Memory: "${universalNotepad}"` : ''}

WHAT YOU SUGGESTED IN EARLIER WINDOWS TODAY (Do not repeat or contradict; evolve smoothly for this window):
${earlierAdviceContextBlock}

Generate 2 to 4 concise lines (each under 64 chars, absolute max 72). JSON array of strings only.`;

  let rawLines: string[] = [];
  try {
    const ai = getGeminiClient();
    if (ai) {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContent,
        config: {
          systemInstruction,
          temperature: 0.65,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || '';
      try {
        const parsed = JSON.parse(responseText);
        if (Array.isArray(parsed)) {
          rawLines = parsed.map(s => String(s).trim()).filter(Boolean);
        }
      } catch {
        const cleanJsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const fallbackArray = JSON.parse(cleanJsonStr);
        if (Array.isArray(fallbackArray)) {
          rawLines = fallbackArray.map(s => String(s).trim()).filter(Boolean);
        }
      }
    }
  } catch (llmErr) {
    console.warn("[CompassionSignalsService] LLM error:", llmErr);
  }

  // Run Programmatic Post-LLM Guard
  const finalLines = runPostLlmGuard(rawLines, {
    userName: preferredName,
    cityName: locationName,
    isNight
  });

  const nowMs = Date.now();
  const timestampIso = new Date().toISOString();
  const signalId = `signal_${windowInfo.key}_${dateStr}_${nowMs}`;

  const resultObj: CompanionSignalResponse = {
    id: signalId,
    userId: safeUid,
    lines: finalLines,
    windowId: windowInfo.key,
    windowLabel: windowInfo.label,
    timestamp: timestampIso,
    cachedAt: timestampIso,
    enabled: true,
    contextMeta: {
      locationName,
      localHour,
      localTimeStr: `${localHour.toString().padStart(2, '0')}:00`,
      temperature: currentTemp,
      weatherCondition: weatherCond,
      uvIndex: Number(uvIdx),
      dewPoint: dewPt,
      peakUvToday: Number(peakUvToday),
      maxTempToday,
      afternoonTrend: afternoonOutlook,
      goalSummary: skincareGoals,
      scansCount: pastScans.length,
      lastScanDate: pastScans.length > 0 ? safeIsoString(pastScans[0].scanDate || pastScans[0].timestamp) : undefined,
      earlierDayWindowsCount: earlierDayWindowsContext.length
    }
  };

  // Update in-memory cache
  if (!DIURNAL_MEMORY_CACHE[safeUid] || DIURNAL_MEMORY_CACHE[safeUid].dateStr !== dateStr) {
    DIURNAL_MEMORY_CACHE[safeUid] = {
      dateStr,
      windows: { [windowInfo.key]: resultObj },
      lastUpdated: nowMs
    };
  } else {
    DIURNAL_MEMORY_CACHE[safeUid].windows[windowInfo.key] = resultObj;
    DIURNAL_MEMORY_CACHE[safeUid].lastUpdated = nowMs;
  }

  // Persist to Firestore
  try {
    if (db) {
      // 1. Update diurnal document
      const dayDocRef = doc(db, 'users', safeUid, 'diurnal_signals', dateStr);
      await setDoc(dayDocRef, sanitizeForFirestore({
        dateStr,
        userId: safeUid,
        [`windows.${windowInfo.key}`]: resultObj,
        lastUpdatedWindow: windowInfo.key,
        updatedAt: serverTimestamp()
      }), { merge: true });

      // 2. Also keep latest pointer
      const latestRef = doc(db, 'users', safeUid, 'companion_signals', 'latest');
      await setDoc(latestRef, sanitizeForFirestore({
        ...resultObj,
        updatedAt: serverTimestamp()
      }), { merge: true });

      // 3. Append history
      const historyCol = collection(db, 'users', safeUid, 'companion_signals_history');
      await addDoc(historyCol, sanitizeForFirestore({
        ...resultObj,
        createdAt: serverTimestamp()
      }));
    }
  } catch (fsErr) {
    console.warn("[CompassionSignalsService] Firestore persist warning:", fsErr);
  }

  return resultObj;
}
