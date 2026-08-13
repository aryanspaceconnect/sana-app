import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, FacialScanResult, DailyBriefing } from '../types';

interface HomeDashboardProps {
  userProfile: UserProfile | null;
  latestScan: FacialScanResult | null;
  dailyBrief: DailyBriefing;
  onOpenScan: () => void;
  onOpenAgent: () => void;
  onOpenCalendar: () => void;
  onOpenSettings?: () => void;
}

interface RoutineStep {
  id: string;
  title: string;
  completed: boolean;
  time: 'AM' | 'PM' | 'ANY';
}

const getDynamicGreetingConfig = (name: string, variantOffset = 0) => {
  const now = new Date();
  const hour = now.getHours();
  const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let greetingList: string[];
  let subtext: string;
  let iconName: string;
  let iconColor: string;

  if (hour >= 4 && hour < 12) {
    greetingList = [
      `Good morning, ${name}`,
      `Rise & glow, ${name}`,
      `Bright morning, ${name}`,
      `Sun's up, ${name}`,
      `Fresh morning, ${name}`
    ];
    subtext = "Time for your morning barrier & SPF routine";
    iconName = "solar:sun-2-bold-duotone";
    iconColor = "text-amber-500";
  } else if (hour >= 12 && hour < 17) {
    greetingList = [
      `Good afternoon, ${name}`,
      `Sunlit afternoon, ${name}`,
      `Midday refresh, ${name}`,
      `Afternoon glow, ${name}`,
      `Radiant afternoon, ${name}`
    ];
    subtext = "Hydrate & reapply UV protection if needed";
    iconName = "solar:sun-bold-duotone";
    iconColor = "text-amber-400";
  } else if (hour >= 17 && hour < 21) {
    greetingList = [
      `Good evening, ${name}`,
      `Golden hour, ${name}`,
      `Evening unwind, ${name}`,
      `Twilight glow, ${name}`,
      `Peaceful evening, ${name}`
    ];
    subtext = "Unwind & prepare for your evening repair regimen";
    iconName = "solar:sunset-bold-duotone";
    iconColor = "text-orange-500";
  } else {
    greetingList = [
      `Restful night, ${name}`,
      `Late night breeze, ${name}`,
      `Nighttime glow, ${name}`,
      `Peaceful night, ${name}`,
      `Starlit night, ${name}`
    ];
    subtext = "Overnight cellular recovery in progress";
    iconName = "solar:moon-stars-bold-duotone";
    iconColor = "text-indigo-400";
  }

  const baseIndex = Math.floor(now.getMinutes() / 12);
  const greetingIndex = (baseIndex + variantOffset) % greetingList.length;
  const greeting = greetingList[greetingIndex];

  return { greeting, subtext, iconName, iconColor, formattedTime };
};

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userProfile,
  latestScan,
  dailyBrief,
  onOpenScan,
  onOpenAgent,
  onOpenCalendar,
  onOpenSettings
}) => {
  const [variantOffset, setVariantOffset] = useState(0);

  const userName = userProfile?.displayName ? userProfile.displayName.split(' ')[0] : 'Marcy';

  const [greetingConfig, setGreetingConfig] = useState(() =>
    getDynamicGreetingConfig(userName, variantOffset)
  );

  useEffect(() => {
    setGreetingConfig(getDynamicGreetingConfig(userName, variantOffset));

    const interval = setInterval(() => {
      setGreetingConfig(getDynamicGreetingConfig(userName, variantOffset));
    }, 30000);

    return () => clearInterval(interval);
  }, [userName, variantOffset]);

  const cycleGreeting = () => {
    setVariantOffset(prev => prev + 1);
  };

  // Dynamic hydration logs with local persistence
  const [hydrationLogs, setHydrationLogs] = useState<number>(() => {
    const saved = localStorage.getItem('sana_hydration_logs');
    return saved ? parseFloat(saved) : 1.2;
  });

  // Dynamic regimen steps with local persistence
  const [regimenSteps, setRegimenSteps] = useState<RoutineStep[]>(() => {
    const saved = localStorage.getItem('sana_regimen_steps');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* fallback */ }
    }
    return [
      { id: '1', title: 'Gentle pH-balanced Cleanser', completed: false, time: 'AM' },
      { id: '2', title: 'Hyaluronic Acid Barrier Serum', completed: false, time: 'AM' },
      { id: '3', title: 'Broad Spectrum SPF 50 Sunscreen', completed: false, time: 'AM' },
      { id: '4', title: 'Ceramide Night Repair Moisturizer', completed: false, time: 'PM' }
    ];
  });

  const [notesList, setNotesList] = useState<string[]>(() => {
    const saved = localStorage.getItem('sana_quick_notes');
    return saved ? JSON.parse(saved) : [];
  });
  const [quickInput, setQuickInput] = useState('Japan Trip');

  useEffect(() => {
    localStorage.setItem('sana_quick_notes', JSON.stringify(notesList));
  }, [notesList]);

  const handleQuickCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setNotesList(prev => [quickInput.trim(), ...prev]);
    setQuickInput('');
  };

  useEffect(() => {
    localStorage.setItem('sana_hydration_logs', hydrationLogs.toString());
  }, [hydrationLogs]);

  useEffect(() => {
    localStorage.setItem('sana_regimen_steps', JSON.stringify(regimenSteps));
  }, [regimenSteps]);

  const toggleStep = (id: string) => {
    setRegimenSteps(prev =>
      prev.map(s => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const addHydration = () => {
    setHydrationLogs(prev => Math.min(3.0, Number((prev + 0.25).toFixed(2))));
  };

  const [showExposomeModal, setShowExposomeModal] = useState(false);

  return (
    <div className="w-full px-5 pt-2 pb-28 space-y-5 overflow-y-auto no-scrollbar">
      {/* Dynamic Warm Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="pt-2 pb-1"
      >
        <div
          onClick={cycleGreeting}
          className="group cursor-pointer select-none inline-block"
          title="Click to cycle creative greeting"
        >
          <div className="flex items-center space-x-2 text-[11px] font-medium text-[#737a87] mb-1">
            <Icon icon={greetingConfig.iconName} className={`w-3.5 h-3.5 ${greetingConfig.iconColor}`} />
            <span>{greetingConfig.formattedTime}</span>
            <span className="text-[#cbd5e1]">•</span>
            <span className="text-[#94a3b8]">{greetingConfig.subtext}</span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight text-[#121316] tracking-tight group-hover:text-black transition-colors flex items-center space-x-2">
            <span>{greetingConfig.greeting}</span>
          </h1>
        </div>
      </motion.div>

      {/* Weather & Environmental Exposome Card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div
          onClick={onOpenSettings}
          className="squircle-card p-4.5 flex flex-col justify-between relative overflow-hidden rounded-[24px] bg-white border border-[#eaedf1] shadow-2xs hover:shadow-xs transition-all cursor-pointer group"
        >
          {/* Card Top: Weather Title, Location Badge & AQI Badge */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center space-x-1.5">
              <span className="text-[12px] font-semibold text-[#737a87]">Weather</span>
              <span className="text-[10px] text-[#cbd5e1]">•</span>
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] text-[10.5px] font-medium">
                <Icon icon="solar:map-point-bold-duotone" className="w-3 h-3 text-[#0284c7]" />
                <span className="truncate max-w-[110px]">
                  {dailyBrief.locationName || userProfile?.settings?.locationName || 'Bardoli, IN'}
                </span>
              </div>
            </div>

            {/* Air Quality Badge */}
            {dailyBrief.airQualityAqi !== undefined && (
              <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-[#f0fdf4] border border-[#dcfce7] text-[#16a34a] text-[10.5px] font-semibold shadow-2xs">
                <Icon icon="solar:leaf-bold-duotone" className="w-3.5 h-3.5 text-[#16a34a]" />
                <span>AQI {dailyBrief.airQualityAqi}</span>
              </div>
            )}
          </div>

          {/* Temperature & Main Badges */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[32px] font-bold text-[#121316] tracking-tight leading-none">
                {dailyBrief.temperature}
              </div>
              <p className="text-[12.5px] font-medium text-[#5e6573] mt-1 flex items-center space-x-1">
                <span>{dailyBrief.weatherCondition}</span>
              </p>
            </div>

            {/* Key Metrics Badges */}
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[10.5px] font-semibold max-w-[190px]">
              {Number(dailyBrief.uvIndex) > 0 && (
                <div className="px-2 py-1 rounded-xl bg-[#fff7ed] border border-[#ffedd5] text-[#c2410c] flex items-center space-x-1">
                  <Icon icon="solar:sun-bold" className="w-3 h-3 text-[#ea580c]" />
                  <span>UV {dailyBrief.uvIndex}</span>
                </div>
              )}
              {dailyBrief.humidity && (
                <div className="px-2.5 py-1 rounded-xl bg-[#f0f9ff] border border-[#e0f2fe] text-[#0369a1] flex items-center space-x-1 shadow-2xs">
                  <Icon icon="solar:droplet-bold" className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>{dailyBrief.humidity.includes('Humidity') ? dailyBrief.humidity : `${dailyBrief.humidity} Humidity`}</span>
                </div>
              )}
              {dailyBrief.precipProb !== undefined && dailyBrief.precipProb > 0 && (
                <div className="px-2 py-1 rounded-xl bg-[#f0f9ff] border border-[#bae6fd] text-[#0284c7] flex items-center space-x-1">
                  <Icon icon="solar:cloud-waterdrops-bold-duotone" className="w-3 h-3 text-[#0284c7]" />
                  <span>{dailyBrief.precipProb}% Rain</span>
                </div>
              )}
            </div>
          </div>

          {/* Clean 1-Line Exposome Micro-Bar (Zero-Noise) */}
          <div className="mt-3 pt-2.5 border-t border-[#f1f5f9] flex items-center justify-between text-[11px] text-[#64748b]">
            <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar py-0.5">
              {dailyBrief.windSpeed !== undefined && (
                <span className="flex items-center space-x-1 whitespace-nowrap text-[#475569] font-medium">
                  <Icon icon="solar:wind-bold-duotone" className="w-3.5 h-3.5 text-[#0284c7]" />
                  <span>{dailyBrief.windSpeed} km/h</span>
                </span>
              )}
              {dailyBrief.cloudCover !== undefined && (
                <span className="flex items-center space-x-1 whitespace-nowrap text-[#475569] font-medium">
                  <Icon icon="solar:clouds-bold-duotone" className="w-3.5 h-3.5 text-[#64748b]" />
                  <span>{dailyBrief.cloudCover}% Clouds</span>
                </span>
              )}
              {dailyBrief.dewPoint && (
                <span className="flex items-center space-x-1 whitespace-nowrap text-[#475569] font-medium">
                  <Icon icon="solar:water-drop-bold-duotone" className="w-3.5 h-3.5 text-[#0ea5e9]" />
                  <span>Dew {dailyBrief.dewPoint}</span>
                </span>
              )}
              {dailyBrief.pm25 !== undefined && (
                <span className="flex items-center space-x-1 whitespace-nowrap text-[#475569] font-medium">
                  <Icon icon="solar:shield-warning-bold-duotone" className="w-3.5 h-3.5 text-[#16a34a]" />
                  <span>PM2.5 {dailyBrief.pm25}</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowExposomeModal(true);
              }}
              className="flex items-center space-x-1 text-[10.5px] font-semibold text-[#0284c7] bg-[#f0f9ff] hover:bg-[#e0f2fe] border border-[#bae6fd] px-2 py-0.5 rounded-lg transition-colors ml-2 shrink-0 cursor-pointer"
            >
              <span>Exposome</span>
              <Icon icon="solar:alt-arrow-right-linear" className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Environmental Exposome Deep Modal */}
      <AnimatePresence>
        {showExposomeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl border border-[#eaedf1] space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar relative"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-sky-50 text-[#0284c7]">
                    <Icon icon="solar:planet-bold-duotone" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-[#121316]">Environmental Exposome</h3>
                    <p className="text-[11px] text-[#64748b]">Live Open-Meteo Meteorological & AQI Metrics</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExposomeModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-[#64748b] transition-colors cursor-pointer"
                >
                  <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                </button>
              </div>

              {/* Grid 1: Air Quality & Pollution */}
              <div className="p-3.5 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-[#0f172a] flex items-center space-x-1.5">
                    <Icon icon="solar:leaf-bold-duotone" className="w-4 h-4 text-[#16a34a]" />
                    <span>Air Quality & Pollution</span>
                  </span>
                  <span className="text-[11px] font-semibold text-[#16a34a] bg-[#f0fdf4] px-2 py-0.5 rounded-full border border-[#dcfce7]">
                    AQI {dailyBrief.airQualityAqi ?? 65} ({ (dailyBrief.airQualityAqi ?? 65) <= 50 ? 'Good' : 'Moderate' })
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                  <div className="p-2 rounded-xl bg-white border border-[#f1f5f9]">
                    <span className="text-[#64748b] text-[10px] block">PM2.5 Microparticles</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.pm25 ?? 18.5} μg/m³</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#f1f5f9]">
                    <span className="text-[#64748b] text-[10px] block">PM10 Coarse Dust</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.pm10 ?? 32.0} μg/m³</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#f1f5f9]">
                    <span className="text-[#64748b] text-[10px] block">Ozone (O₃)</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.ozone ?? 35.0} μg/m³</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#f1f5f9]">
                    <span className="text-[#64748b] text-[10px] block">Nitrogen Dioxide (NO₂)</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.no2 ?? 14.2} μg/m³</span>
                  </div>
                </div>
                <p className="text-[10.5px] text-[#475569] bg-white p-2 rounded-xl border border-[#f1f5f9]">
                  💡 <strong>Skin Impact:</strong> PM2.5 triggers oxidative stress and AhR receptors. Double-cleansing is recommended tonight.
                </p>
              </div>

              {/* Grid 2: Solar Radiation & Cloud UV Ratio */}
              <div className="p-3.5 rounded-2xl bg-[#fff7ed] border border-[#ffedd5] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-[#9a3412] flex items-center space-x-1.5">
                    <Icon icon="solar:sun-bold-duotone" className="w-4 h-4 text-[#ea580c]" />
                    <span>Solar Radiation & UV</span>
                  </span>
                  <span className="text-[11px] font-semibold text-[#c2410c] bg-white px-2 py-0.5 rounded-full border border-[#ffedd5]">
                    UV Index {dailyBrief.uvIndex} ({dailyBrief.uvLevel})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                  <div className="p-2 rounded-xl bg-white border border-[#ffedd5]">
                    <span className="text-[#9a3412] text-[10px] block">Clear-Sky UV Max</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.uvIndexClearSky ?? dailyBrief.uvIndex}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#ffedd5]">
                    <span className="text-[#9a3412] text-[10px] block">Cloud Cover</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.cloudCover ?? 40}%</span>
                  </div>
                </div>
                <p className="text-[10.5px] text-[#7c2d12] bg-white p-2 rounded-xl border border-[#ffedd5]">
                  ☀️ <strong>UV Cloud Penetration:</strong> UVA rays penetrate cloud cover. Reapply SPF 50 if outdoors.
                </p>
              </div>

              {/* Grid 3: Atmospheric Hydration & Wind */}
              <div className="p-3.5 rounded-2xl bg-[#f0f9ff] border border-[#e0f2fe] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-bold text-[#0369a1] flex items-center space-x-1.5">
                    <Icon icon="solar:droplet-bold-duotone" className="w-4 h-4 text-[#0284c7]" />
                    <span>Atmospheric Dynamics</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                  <div className="p-2 rounded-xl bg-white border border-[#e0f2fe]">
                    <span className="text-[#0369a1] text-[10px] block">Dew Point</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.dewPoint ?? '21°C'}</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#e0f2fe]">
                    <span className="text-[#0369a1] text-[10px] block">Vapour Pressure Deficit</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.vpdKpa ?? 0.85} kPa</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#e0f2fe]">
                    <span className="text-[#0369a1] text-[10px] block">Wind Speed</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.windSpeed ?? 12} km/h</span>
                  </div>
                  <div className="p-2 rounded-xl bg-white border border-[#e0f2fe]">
                    <span className="text-[#0369a1] text-[10px] block">Wind Gusts</span>
                    <span className="font-bold text-[#0f172a]">{dailyBrief.windGusts ?? 22} km/h</span>
                  </div>
                </div>
              </div>

              {/* Close Action */}
              <button
                onClick={() => setShowExposomeModal(false)}
                className="w-full py-2.5 rounded-2xl bg-[#0f172a] text-white text-[13px] font-semibold hover:bg-black transition-colors cursor-pointer text-center"
              >
                Close Exposome Breakdown
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
