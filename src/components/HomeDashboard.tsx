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
          {/* Card Top: Weather Title & Location Pin Badge */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5">
              <span className="text-[12px] font-medium text-[#737a87]">Weather</span>
              <span className="text-[10px] text-[#cbd5e1]">•</span>
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] text-[10.5px] font-medium">
                <Icon icon="solar:map-point-bold-duotone" className="w-3 h-3 text-[#0284c7]" />
                <span className="truncate max-w-[110px]">
                  {dailyBrief.locationName || userProfile?.settings?.locationName || 'Bardoli, IN'}
                </span>
              </div>
            </div>
          </div>

          {/* Temperature & Weather Condition */}
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[30px] font-bold text-[#121316] tracking-tight leading-none">
                {dailyBrief.temperature}
              </div>
              <p className="text-[12.5px] font-medium text-[#5e6573] mt-1 flex items-center space-x-1">
                <span>{dailyBrief.weatherCondition}</span>
              </p>
            </div>

            {/* UV & Humidity Badges */}
            <div className="flex items-center space-x-1.5 text-[10.5px] font-semibold">
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
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
