/**
 * Isolated Real-Time Weather, Environmental & Air Quality Exposome Engine
 * 
 * Comprehensive Open-Meteo API Integration:
 * 1. Forecast Weather API: cloud_cover, precipitation_probability (12h), wind_speed_10m + wind_gusts_10m,
 *    dew_point_2m, vapour_pressure_deficit (VPD), uv_index, uv_index_clear_sky, past_days=1 comparison, hourly next 24h.
 * 2. Air Quality API: US AQI, PM2.5, PM10, Nitrogen Dioxide (NO2), Ozone (O3), Dust, Pollen (Alder, Birch, Grass, Mugwort, Olive, Ragweed).
 * 3. Location Geocoding & City Label Resolution ("Because of where you live").
 * 4. Actionable Skin Exposome Copy Triggers & Clinical Guidance.
 */

export interface FetchAdvancedEnvironmentalDataArgs {
  latitude?: number;
  longitude?: number;
  locationName?: string;
  includeAirQuality?: boolean;
  includeHourlyForecast?: boolean;
  includeDaily7DayTrend?: boolean;
  includeGeologicalSoil?: boolean;
  includeSolarRadiation?: boolean;
  includePollen?: boolean;
  includeYesterdayComparison?: boolean;
}

export interface AirQualityMetrics {
  usAqi: number;
  aqiCategory: 'Good' | 'Moderate' | 'Unhealthy for Sensitive Groups' | 'Unhealthy' | 'Very Unhealthy' | 'Hazardous';
  pm25: number; // ug/m3
  pm10: number; // ug/m3
  no2: number; // ug/m3 (nitrogen dioxide)
  ozone: number; // ug/m3 (ground-level ozone)
  dust: number; // ug/m3
  pollen?: {
    alder: number | null;
    birch: number | null;
    grass: number | null;
    mugwort: number | null;
    olive: number | null;
    ragweed: number | null;
    totalPollenGrains: number;
    pollenRiskLevel: 'None' | 'Low' | 'Moderate' | 'High' | 'Very High';
    hasPollenData: boolean;
  };
}

export interface HourlyForecastPoint {
  time: string;
  tempC: number;
  humidityPercent: number;
  dewPointC: number;
  vpdKpa: number;
  uvIndex: number;
  uvIndexClearSky: number;
  precipitationProbabilityPercent: number;
  cloudCoverPercent: number;
  windSpeedKmH: number;
  windGustsKmH: number;
}

export interface YesterdayComparison {
  avgHumidityPercent: number;
  avgTempC: number;
  avgDewPointC: number;
  avgVpdKpa: number;
  humidityDiffVsTodayPercent: number;
  tempDiffVsTodayC: number;
  summaryNote: string;
}

export interface AdvancedEnvironmentalResponse {
  location: {
    latitude: number;
    longitude: number;
    cityLabel: string;
    elevation?: number;
    timezone?: string;
  };
  currentExposome: {
    tempC: number;
    feelsLikeC: number;
    humidityPercent: number;
    dewPointC: number;
    vpdKpa: number; // Vapour Pressure Deficit in kPa
    vpdCategory: 'Low / Muggy' | 'Balanced / Optimal' | 'High / Dry Heat' | 'Extreme Aridity';
    cloudCoverPercent: number;
    precipitationMm: number;
    precipitationProbability12hMaxPercent: number;
    windSpeedKmH: number;
    windGustsKmH: number;
    uvIndex: number;
    uvIndexClearSky: number;
    weatherCode: number;
    weatherCondition: string;
  };
  airQuality?: AirQualityMetrics;
  yesterdayComparison?: YesterdayComparison;
  hourlyForecastNext24h?: {
    hourlyPoints: HourlyForecastPoint[];
    peakUvHour: { time: string; uv: number; clearSkyUv: number };
    peakTempHour: { time: string; tempC: number };
    maxPrecipProb6to12h: number;
    afternoonWorseningNote: string;
  };
  solarRadiationAndClouds?: {
    uvIndexMaxToday: number;
    uvIndexClearSkyMaxToday: number;
    cloudUvPenetrationRatio: number;
    cloudsAreNotSafetyNote: string;
    directNormalIrradiance?: number;
  };
  forecast7DaySummary?: Array<{
    date: string;
    maxTemp: number;
    minTemp: number;
    maxUv: number;
    maxClearSkyUv: number;
    precipSumMm: number;
    maxPrecipProbPercent: number;
    weatherCode: number;
  }>;
  soilAndMoisture?: {
    dewPoint: number;
    dewPointDepression: number;
    relativeHumidity: number;
    soilMoisture0to7cm?: number;
  };
  skinExposomeCopyTriggers: {
    cleansingEmphasis: boolean; // High PM2.5 / PM10 / NO2 -> Double cleanse & pore detox
    antioxidantBias: boolean; // High Ozone / AQI -> Vitamin C / Ferulic acid antioxidant shield
    reapplyBlotWarning: boolean; // High rain chance or high sweat mugginess -> Blot / reapply SPF
    barrierDrynessWarning: boolean; // High wind / gusts or high VPD -> Barrier lipids & lip care
    cloudyUvWarning: boolean; // High cloud cover but high clear sky UV -> Clouds aren't safety
    pollenIrritationAlert: boolean; // Elevated pollen count -> Soothing anti-itch / eye rinse
    summaryGuidance: string[];
  };
  fetchedAtIso: string;
  note: string;
}

interface WeatherCache {
  timestamp: number;
  cacheKey: string;
  data: {
    tempC: number;
    feelsLikeC: number;
    humidity: number;
    dewPointC: number;
    vpdKpa: number;
    uvIndex: number;
    uvIndexClearSky: number;
    cloudCoverPercent: number;
    precipMm: number;
    precipProbPercent: number;
    weatherCode: number;
    weatherCondition: string;
    windSpeedKmH: number;
    windGustsKmH: number;
    locationName: string;
    airQualityAqi?: number;
    pm25?: number;
    pm10?: number;
    ozone?: number;
    no2?: number;
  };
}

let baselineCache: WeatherCache | null = null;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes in-memory cache

const DEFAULT_LAT = 21.12;
const DEFAULT_LON = 73.11;

/**
 * Search locations via Open-Meteo Geocoding API
 */
export async function searchLocations(query: string) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];
    return data.results.map((item: any) => ({
      name: item.name,
      admin1: item.admin1,
      country: item.country,
      countryCode: item.country_code,
      latitude: item.latitude,
      longitude: item.longitude,
      elevation: item.elevation,
      displayName: [item.name, item.admin1, item.country].filter(Boolean).join(', ')
    }));
  } catch (err) {
    console.warn('[WeatherAwarenessEngine] Geocoding search error:', err);
    return [];
  }
}

/**
 * Reverse geocode coordinates to city label ("Because of where you live")
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SanaSkincareApp/1.0' } });
    if (!res.ok) return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || data.address?.state;
    const country = data.address?.country;
    if (city && country) return `${city}, ${country}`;
    if (city) return city;
    return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
  } catch {
    return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
  }
}

/**
 * WMO Weather Interpretation Codes mapping
 */
function getWmoConditionName(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1) return 'Mainly Clear';
  if (code === 2) return 'Partly Sunny';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rainy';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95 && code <= 99) return 'Thunderstorm';
  return 'Partly Sunny';
}

/**
 * Categorize US AQI numeric score
 */
function getAqiCategory(aqi: number): AirQualityMetrics['aqiCategory'] {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

/**
 * Fetches baseline current weather & exposome from Open-Meteo with 20-min caching.
 */
export async function getBaselineWeatherData(lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON, locationNameOverride?: string) {
  const cacheKey = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const now = Date.now();
  if (baselineCache && (now - baselineCache.timestamp) < CACHE_TTL_MS && baselineCache.cacheKey === cacheKey) {
    return baselineCache.data;
  }

  try {
    const params = [
      `latitude=${lat}`,
      `longitude=${lon}`,
      'current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,uv_index,uv_index_clear_sky,vapour_pressure_deficit',
      'timezone=auto'
    ].join('&');

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetch(weatherUrl);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = await res.json();

    const current = json.current || {};
    const condName = getWmoConditionName(current.weather_code ?? 2);

    let displayLocName = locationNameOverride;
    if (!displayLocName) {
      displayLocName = await reverseGeocode(lat, lon);
    }

    // Quick AQI fetch for baseline prompt
    let aqiVal: number | undefined;
    let pm25Val: number | undefined;
    let pm10Val: number | undefined;
    let o3Val: number | undefined;
    let no2Val: number | undefined;

    try {
      const aqRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide`);
      if (aqRes.ok) {
        const aqJson = await aqRes.json();
        const aqCurr = aqJson.current || {};
        aqiVal = aqCurr.us_aqi;
        pm25Val = aqCurr.pm2_5;
        pm10Val = aqCurr.pm10;
        o3Val = aqCurr.ozone;
        no2Val = aqCurr.nitrogen_dioxide;
      }
    } catch {
      // Non-blocking fallback
    }

    const data = {
      tempC: current.temperature_2m ?? 28,
      feelsLikeC: current.apparent_temperature ?? 30,
      humidity: current.relative_humidity_2m ?? 65,
      dewPointC: current.dew_point_2m ?? 21,
      vpdKpa: current.vapour_pressure_deficit ?? 0.85,
      uvIndex: current.uv_index ?? 6.5,
      uvIndexClearSky: current.uv_index_clear_sky ?? 7.8,
      cloudCoverPercent: current.cloud_cover ?? 40,
      precipMm: current.precipitation ?? 0,
      precipProbPercent: current.precipitation_probability ?? 20,
      weatherCode: current.weather_code ?? 2,
      weatherCondition: condName,
      windSpeedKmH: current.wind_speed_10m ?? 12,
      windGustsKmH: current.wind_gusts_10m ?? 22,
      locationName: displayLocName,
      airQualityAqi: aqiVal ?? 65,
      pm25: pm25Val ?? 18.5,
      pm10: pm10Val ?? 32.0,
      ozone: o3Val ?? 35.0,
      no2: no2Val ?? 14.2
    };

    baselineCache = { timestamp: now, cacheKey, data };
    return data;
  } catch (err) {
    console.warn('[WeatherAwarenessEngine] Failed to fetch live Open-Meteo baseline weather, using fallback:', err);
    return {
      tempC: 28,
      feelsLikeC: 30,
      humidity: 65,
      dewPointC: 21,
      vpdKpa: 0.85,
      uvIndex: 6.5,
      uvIndexClearSky: 7.8,
      cloudCoverPercent: 40,
      precipMm: 0,
      precipProbPercent: 20,
      weatherCode: 2,
      weatherCondition: 'Partly Sunny',
      windSpeedKmH: 12,
      windGustsKmH: 22,
      locationName: locationNameOverride || `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`,
      airQualityAqi: 65,
      pm25: 18.5,
      pm10: 32.0,
      ozone: 35.0,
      no2: 14.2
    };
  }
}

/**
 * Generates rich baseline prompt header string for LLM system prompt
 */
export async function getBaselineWeatherPromptHeader(lat: number = DEFAULT_LAT, lon: number = DEFAULT_LON): Promise<string> {
  try {
    const w = await getBaselineWeatherData(lat, lon);
    const condName = getWmoConditionName(w.weatherCode);
    
    let uvCategory = 'Low';
    if (w.uvIndex >= 3 && w.uvIndex < 6) uvCategory = 'Moderate';
    else if (w.uvIndex >= 6 && w.uvIndex < 8) uvCategory = 'High';
    else if (w.uvIndex >= 8 && w.uvIndex < 11) uvCategory = 'Very High';
    else if (w.uvIndex >= 11) uvCategory = 'Extreme';

    return `[ENVIRONMENT & EXPOSOME - ${w.locationName}] Temp: ${w.tempC}°C (Feels ${w.feelsLikeC}°C) | Hum: ${w.humidity}% | Dew Pt: ${w.dewPointC}°C | VPD: ${w.vpdKpa} kPa | UV: ${w.uvIndex} (${uvCategory}, ClearSkyMax: ${w.uvIndexClearSky}) | Clouds: ${w.cloudCoverPercent}% | Precip Prob (12h): ${w.precipProbPercent}% | Wind: ${w.windSpeedKmH} km/h (Gusts: ${w.windGustsKmH} km/h) | AQI: ${w.airQualityAqi} (PM2.5: ${w.pm25}, PM10: ${w.pm10}, O3: ${w.ozone}, NO2: ${w.no2})`;
  } catch (err) {
    console.warn('[WeatherAwarenessEngine] Header error, using baseline fallback:', err);
    return `[ENVIRONMENT & EXPOSOME] Temp: 28°C | Hum: 65% | Dew Pt: 21°C | VPD: 0.85 kPa | UV: 6.5 (High) | Clouds: 40% | Precip Prob: 20% | AQI: 65 (PM2.5: 18.5) | Condition: Partly Sunny`;
  }
}

/**
 * Deep multi-variable environmental, air quality & exposome data fetch tool
 */
export async function fetchAdvancedEnvironmentalData(args: FetchAdvancedEnvironmentalDataArgs): Promise<AdvancedEnvironmentalResponse> {
  const lat = args.latitude ?? DEFAULT_LAT;
  const lon = args.longitude ?? DEFAULT_LON;
  const fetchedAtIso = new Date().toISOString();

  let cityLabel = args.locationName;
  if (!cityLabel) {
    cityLabel = await reverseGeocode(lat, lon);
  }

  const response: AdvancedEnvironmentalResponse = {
    location: { latitude: lat, longitude: lon, cityLabel },
    currentExposome: {
      tempC: 28,
      feelsLikeC: 30,
      humidityPercent: 65,
      dewPointC: 21,
      vpdKpa: 0.85,
      vpdCategory: 'Balanced / Optimal',
      cloudCoverPercent: 40,
      precipitationMm: 0,
      precipitationProbability12hMaxPercent: 20,
      windSpeedKmH: 12,
      windGustsKmH: 22,
      uvIndex: 6.5,
      uvIndexClearSky: 7.8,
      weatherCode: 2,
      weatherCondition: 'Partly Sunny'
    },
    skinExposomeCopyTriggers: {
      cleansingEmphasis: false,
      antioxidantBias: false,
      reapplyBlotWarning: false,
      barrierDrynessWarning: false,
      cloudyUvWarning: false,
      pollenIrritationAlert: false,
      summaryGuidance: []
    },
    fetchedAtIso,
    note: `Deep environmental & exposome metrics retrieved for ${cityLabel} from Open-Meteo.`
  };

  try {
    // 1. Fetch Air Quality & Pollen if requested or default true
    if (args.includeAirQuality !== false) {
      try {
        const aqParams = [
          `latitude=${lat}`,
          `longitude=${lon}`,
          'current=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,dust,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        ].join('&');

        const aqRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams}`);
        if (aqRes.ok) {
          const aqJson = await aqRes.json();
          const curr = aqJson.current || {};
          const aqi = curr.us_aqi ?? 65;

          const alder = curr.alder_pollen ?? null;
          const birch = curr.birch_pollen ?? null;
          const grass = curr.grass_pollen ?? null;
          const mugwort = curr.mugwort_pollen ?? null;
          const olive = curr.olive_pollen ?? null;
          const ragweed = curr.ragweed_pollen ?? null;

          const pollenValues = [alder, birch, grass, mugwort, olive, ragweed].filter((v): v is number => typeof v === 'number');
          const totalPollen = pollenValues.reduce((a, b) => a + b, 0);
          const hasPollenData = pollenValues.length > 0;

          let pollenRiskLevel: AirQualityMetrics['pollen']['pollenRiskLevel'] = 'None';
          if (totalPollen > 100) pollenRiskLevel = 'Very High';
          else if (totalPollen > 50) pollenRiskLevel = 'High';
          else if (totalPollen > 20) pollenRiskLevel = 'Moderate';
          else if (totalPollen > 0) pollenRiskLevel = 'Low';

          response.airQuality = {
            usAqi: aqi,
            aqiCategory: getAqiCategory(aqi),
            pm25: curr.pm2_5 ?? 18.5,
            pm10: curr.pm10 ?? 32.0,
            no2: curr.nitrogen_dioxide ?? 14.2,
            ozone: curr.ozone ?? 35.0,
            dust: curr.dust ?? 8.0,
            pollen: {
              alder,
              birch,
              grass,
              mugwort,
              olive,
              ragweed,
              totalPollenGrains: Math.round(totalPollen),
              pollenRiskLevel,
              hasPollenData
            }
          };
        }
      } catch (e) {
        console.warn('[WeatherAwarenessEngine] AQI/Pollen fetch error:', e);
      }
    }

    // 2. Fetch Forecast Weather (past_days=1, forecast_days=2, hourly next 24h)
    const forecastParams = [
      `latitude=${lat}`,
      `longitude=${lon}`,
      'current=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,uv_index,uv_index_clear_sky,vapour_pressure_deficit',
      'hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,uv_index,uv_index_clear_sky,vapour_pressure_deficit,cloud_cover,wind_speed_10m,wind_gusts_10m,soil_temperature_0_to_7cm,soil_moisture_0_to_7cm',
      'daily=temperature_2m_max,temperature_2m_min,uv_index_max,uv_index_clear_sky_max,precipitation_sum,precipitation_probability_max,weather_code',
      'past_days=1',
      'forecast_days=2',
      'timezone=auto'
    ].join('&');

    const fRes = await fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams}`);

    if (fRes.ok) {
      const fJson = await fRes.json();
      const current = fJson.current || {};
      const daily = fJson.daily || {};
      const hourly = fJson.hourly || {};

      response.location.elevation = fJson.elevation;
      response.location.timezone = fJson.timezone;

      const tempC = current.temperature_2m ?? 28;
      const humidityPercent = current.relative_humidity_2m ?? 65;
      const dewPointC = current.dew_point_2m ?? 21;
      const vpdKpa = current.vapour_pressure_deficit ?? 0.85;
      const cloudCoverPercent = current.cloud_cover ?? 40;
      const windSpeedKmH = current.wind_speed_10m ?? 12;
      const windGustsKmH = current.wind_gusts_10m ?? 22;
      const uvIndex = current.uv_index ?? 6.5;
      const uvIndexClearSky = current.uv_index_clear_sky ?? 7.8;

      let vpdCategory: AdvancedEnvironmentalResponse['currentExposome']['vpdCategory'] = 'Balanced / Optimal';
      if (vpdKpa < 0.5) vpdCategory = 'Low / Muggy';
      else if (vpdKpa > 2.0) vpdCategory = 'Extreme Aridity';
      else if (vpdKpa > 1.2) vpdCategory = 'High / Dry Heat';

      response.currentExposome = {
        tempC,
        feelsLikeC: current.apparent_temperature ?? (tempC + 2),
        humidityPercent,
        dewPointC,
        vpdKpa,
        vpdCategory,
        cloudCoverPercent,
        precipitationMm: current.precipitation ?? 0,
        precipitationProbability12hMaxPercent: current.precipitation_probability ?? 20,
        windSpeedKmH,
        windGustsKmH,
        uvIndex,
        uvIndexClearSky,
        weatherCode: current.weather_code ?? 2,
        weatherCondition: getWmoConditionName(current.weather_code ?? 2)
      };

      // 3. Yesterday Comparison Analysis (past_days=1 -> hourly indices 0..23)
      if (hourly.time && hourly.time.length >= 48) {
        const yesterdayHums = hourly.relative_humidity_2m?.slice(0, 24) || [];
        const yesterdayTemps = hourly.temperature_2m?.slice(0, 24) || [];
        const yesterdayDews = hourly.dew_point_2m?.slice(0, 24) || [];
        const yesterdayVpds = hourly.vapour_pressure_deficit?.slice(0, 24) || [];

        if (yesterdayHums.length > 0) {
          const avgHumYest = Math.round(yesterdayHums.reduce((a: number, b: number) => a + b, 0) / yesterdayHums.length);
          const avgTempYest = Number((yesterdayTemps.reduce((a: number, b: number) => a + b, 0) / yesterdayTemps.length).toFixed(1));
          const avgDewYest = Number((yesterdayDews.reduce((a: number, b: number) => a + b, 0) / yesterdayDews.length).toFixed(1));
          const avgVpdYest = Number((yesterdayVpds.reduce((a: number, b: number) => a + b, 0) / yesterdayVpds.length).toFixed(2));

          const humDiff = humidityPercent - avgHumYest;
          const tempDiff = Number((tempC - avgTempYest).toFixed(1));

          let summaryNote = `Humidity is ${Math.abs(humDiff)}% ${humDiff >= 0 ? 'higher' : 'lower'} than yesterday's average (${avgHumYest}%).`;
          if (Math.abs(humDiff) > 10) {
            summaryNote += humDiff > 0 ? " Noticeably more muggy today — expect increased sebum flux." : " Dryer atmospheric conditions today — reinforce ceramides.";
          }

          response.yesterdayComparison = {
            avgHumidityPercent: avgHumYest,
            avgTempC: avgTempYest,
            avgDewPointC: avgDewYest,
            avgVpdKpa: avgVpdYest,
            humidityDiffVsTodayPercent: humDiff,
            tempDiffVsTodayC: tempDiff,
            summaryNote
          };
        }
      }

      // 4. Hourly Forecast Next 24 Hours (indices 24..47)
      if (args.includeHourlyForecast !== false && hourly.time && hourly.time.length >= 48) {
        const times = hourly.time.slice(24, 48);
        const temps = hourly.temperature_2m.slice(24, 48);
        const hums = hourly.relative_humidity_2m.slice(24, 48);
        const dews = hourly.dew_point_2m.slice(24, 48);
        const vpds = hourly.vapour_pressure_deficit.slice(24, 48);
        const uvs = hourly.uv_index.slice(24, 48);
        const clearUvs = hourly.uv_index_clear_sky.slice(24, 48);
        const precips = hourly.precipitation_probability.slice(24, 48);
        const clouds = hourly.cloud_cover.slice(24, 48);
        const winds = hourly.wind_speed_10m.slice(24, 48);
        const gusts = hourly.wind_gusts_10m.slice(24, 48);

        const hourlyPoints: HourlyForecastPoint[] = times.map((t: string, idx: number) => ({
          time: t,
          tempC: temps[idx] ?? 28,
          humidityPercent: hums[idx] ?? 65,
          dewPointC: dews[idx] ?? 21,
          vpdKpa: vpds[idx] ?? 0.85,
          uvIndex: uvs[idx] ?? 0,
          uvIndexClearSky: clearUvs[idx] ?? 0,
          precipitationProbabilityPercent: precips[idx] ?? 0,
          cloudCoverPercent: clouds[idx] ?? 0,
          windSpeedKmH: winds[idx] ?? 10,
          windGustsKmH: gusts[idx] ?? 15
        }));

        let maxUvVal = -1, maxUvTime = '', maxUvClearSky = 0;
        let maxTempVal = -100, maxTempTime = '';
        let maxPrecipProb = 0;

        hourlyPoints.forEach(p => {
          if (p.uvIndex > maxUvVal) {
            maxUvVal = p.uvIndex;
            maxUvTime = p.time;
            maxUvClearSky = p.uvIndexClearSky;
          }
          if (p.tempC > maxTempVal) {
            maxTempVal = p.tempC;
            maxTempTime = p.time;
          }
          if (p.precipitationProbabilityPercent > maxPrecipProb) {
            maxPrecipProb = p.precipitationProbabilityPercent;
          }
        });

        const afternoonWorseningNote = `Peak solar intensity at ${maxUvTime.split('T')[1] || maxUvTime} (UV ${maxUvVal.toFixed(1)}, ClearSkyMax ${maxUvClearSky.toFixed(1)}). Afternoon heat peaks at ${maxTempVal.toFixed(1)}°C around ${maxTempTime.split('T')[1] || maxTempTime}.`;

        response.hourlyForecastNext24h = {
          hourlyPoints,
          peakUvHour: { time: maxUvTime, uv: maxUvVal, clearSkyUv: maxUvClearSky },
          peakTempHour: { time: maxTempTime, tempC: maxTempVal },
          maxPrecipProb6to12h: maxPrecipProb,
          afternoonWorseningNote
        };

        response.currentExposome.precipitationProbability12hMaxPercent = maxPrecipProb;
      }

      // 5. Solar Radiation & Cloud Penetration Ratio
      const maxUvToday = daily.uv_index_max?.[1] ?? uvIndex;
      const maxClearSkyUvToday = daily.uv_index_clear_sky_max?.[1] ?? uvIndexClearSky;
      const ratio = maxClearSkyUvToday > 0 ? Number((maxUvToday / maxClearSkyUvToday).toFixed(2)) : 0.85;

      response.solarRadiationAndClouds = {
        uvIndexMaxToday: maxUvToday,
        uvIndexClearSkyMaxToday: maxClearSkyUvToday,
        cloudUvPenetrationRatio: ratio,
        cloudsAreNotSafetyNote: `Cloud cover is ${cloudCoverPercent}%, but ${Math.round(ratio * 100)}% of UV penetrates cloud cover. Clouds aren't safety — broad-spectrum SPF remains mandatory.`
      };

      // 6. 7-Day Trend
      if (args.includeDaily7DayTrend && daily.time && Array.isArray(daily.time)) {
        response.forecast7DaySummary = daily.time.map((dateStr: string, idx: number) => ({
          date: dateStr,
          maxTemp: daily.temperature_2m_max?.[idx] ?? 30,
          minTemp: daily.temperature_2m_min?.[idx] ?? 24,
          maxUv: daily.uv_index_max?.[idx] ?? 7.5,
          maxClearSkyUv: daily.uv_index_clear_sky_max?.[idx] ?? 8.0,
          precipSumMm: daily.precipitation_sum?.[idx] ?? 0,
          maxPrecipProbPercent: daily.precipitation_probability_max?.[idx] ?? 20,
          weatherCode: daily.weather_code?.[idx] ?? 0
        }));
      }

      // 7. Soil Moisture if requested
      if (args.includeGeologicalSoil && hourly.soil_moisture_0_to_7cm) {
        const soilMoisture = hourly.soil_moisture_0_to_7cm[24] ?? 0.35;
        response.soilAndMoisture = {
          dewPoint: dewPointC,
          dewPointDepression: Number((tempC - dewPointC).toFixed(1)),
          relativeHumidity: humidityPercent,
          soilMoisture0to7cm: soilMoisture
        };
      }
    }
  } catch (err) {
    console.warn('[WeatherAwarenessEngine] Advanced Environmental fetch error:', err);
  }

  // 8. Generate Actionable Skin Exposome Copy Triggers
  const triggers = response.skinExposomeCopyTriggers;
  const aq = response.airQuality;
  const curr = response.currentExposome;

  if (aq) {
    if (aq.pm25 > 25 || aq.pm10 > 50 || aq.no2 > 20) {
      triggers.cleansingEmphasis = true;
      triggers.summaryGuidance.push(`High particulate pollution (PM2.5: ${aq.pm25} µg/m³, PM10: ${aq.pm10} µg/m³) — double cleansing & salicylic acid/clay pore detox recommended tonight.`);
    }
    if (aq.ozone > 40 || aq.usAqi > 100) {
      triggers.antioxidantBias = true;
      triggers.summaryGuidance.push(`Elevated ground-level ozone (${aq.ozone} µg/m³) & AQI (${aq.usAqi}) — layer L-ascorbic acid / Niacinamide antioxidant shield against reactive oxidative stress.`);
    }
    if (aq.pollen && aq.pollen.totalPollenGrains > 20) {
      triggers.pollenIrritationAlert = true;
      triggers.summaryGuidance.push(`Elevated pollen levels (${aq.pollen.totalPollenGrains} grains/m³) — periocular irritation risk; rinse face with thermal water post-outdoors.`);
    }
  }

  if (curr.precipitationProbability12hMaxPercent > 40 || curr.vpdKpa < 0.5) {
    triggers.reapplyBlotWarning = true;
    triggers.summaryGuidance.push(`High rain chance (${curr.precipitationProbability12hMaxPercent}%) / muggy VPD (${curr.vpdKpa} kPa) — sweat/water reapplication of sunscreen required; use oil-blotting paper.`);
  }

  if (curr.windSpeedKmH > 15 || curr.windGustsKmH > 25 || curr.vpdKpa > 1.5) {
    triggers.barrierDrynessWarning = true;
    triggers.summaryGuidance.push(`High wind currents (${curr.windSpeedKmH} km/h, gusts ${curr.windGustsKmH} km/h) & dry VPD (${curr.vpdKpa} kPa) — accelerated transepidermal water loss (TEWL); apply lipid barrier cream & lip occlusive.`);
  }

  if (curr.cloudCoverPercent > 40 && response.solarRadiationAndClouds?.uvIndexMaxToday && response.solarRadiationAndClouds.uvIndexMaxToday > 3) {
    triggers.cloudyUvWarning = true;
    triggers.summaryGuidance.push(`Overcast skies (${curr.cloudCoverPercent}% cloud cover) do not block UV radiation (Max UV: ${response.solarRadiationAndClouds.uvIndexMaxToday}) — clouds aren't safety!`);
  }

  if (triggers.summaryGuidance.length === 0) {
    triggers.summaryGuidance.push(`Favorable environmental conditions in ${cityLabel}. Maintain baseline daily SPF and barrier moisturizer.`);
  }

  return response;
}
