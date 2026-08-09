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
}

interface RoutineStep {
  id: string;
  title: string;
  completed: boolean;
  time: 'AM' | 'PM' | 'ANY';
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userProfile,
  latestScan,
  dailyBrief,
  onOpenScan,
  onOpenAgent,
  onOpenCalendar
}) => {
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
        <h1 className="text-[26px] font-bold leading-tight text-[#121316] tracking-tight">
          Good morning, {userProfile?.displayName ? userProfile.displayName.split(' ')[0] : 'Marcy'}
        </h1>
      </motion.div>

      {/* Information & Metrics Row 1: Weather & UV Index */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        {/* Weather Card - Squaricle Shape */}
        <div className="squircle-card p-4.5 flex flex-col justify-between relative overflow-hidden rounded-[24px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[#737a87]">Weather</span>
            <div className="p-1.5 rounded-2xl bg-[#f2f5f8] text-[#2c3038]">
              <Icon icon="solar:sun-cloud-linear" className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-[28px] font-bold text-[#121316] tracking-tight">
              {dailyBrief.temperature}
            </div>
            <p className="text-[12px] font-medium text-[#5e6573] mt-0.5">
              {dailyBrief.weatherCondition}
            </p>
          </div>
        </div>

        {/* UV & Sunscreen Reminder Card - Squaricle Shape */}
        <div className="squircle-card p-4.5 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-white/90 to-[#fdfbf7] rounded-[24px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[#737a87]">UV Index</span>
            <span className="text-[11px] font-semibold text-[#d97706] bg-[#fef3c7] px-2.5 py-0.5 rounded-xl">
              Index {dailyBrief.uvIndex}
            </span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#121316]">
              Apply sunscreen today
            </p>
            <p className="text-[11px] text-[#6b7280] mt-1 leading-snug">
              High UV forecasted. Reapply SPF 50 every 2 hours.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Facial Skin Health Status Widget - Squaricle Shape */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="squircle-card p-5 space-y-4 rounded-[26px]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-2xl bg-[#1a1c1e] text-white">
              <Icon icon="solar:scanner-bold" className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[#121316]">Skin Barrier Health</h3>
              <p className="text-[11px] text-[#737a87]">Latest AI Facial Scan Metrics</p>
            </div>
          </div>

          <button
            onClick={onOpenScan}
            className="px-3 py-1.5 rounded-2xl bg-[#f0f3f6] text-[#1a1c1e] text-[12px] font-medium hover:bg-[#1a1c1e] hover:text-white transition-colors cursor-pointer"
          >
            New Scan
          </button>
        </div>

        {/* Score Meters */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
            <span className="text-[11px] text-[#737a87] block font-medium">Hydration</span>
            <span className="text-[18px] font-bold text-[#121316]">
              {latestScan ? `${latestScan.hydrationScore}%` : '84%'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
            <span className="text-[11px] text-[#737a87] block font-medium">Barrier</span>
            <span className="text-[18px] font-bold text-[#121316]">
              {latestScan ? `${latestScan.barrierScore}%` : '88%'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
            <span className="text-[11px] text-[#737a87] block font-medium">Clarity</span>
            <span className="text-[18px] font-bold text-[#121316]">
              {latestScan ? `${latestScan.clarityScore}%` : '90%'}
            </span>
          </div>
        </div>

        <p className="text-[12px] text-[#525866] bg-[#f5f7fa] p-3 rounded-2xl border border-[#eef1f5] leading-relaxed">
          {latestScan?.summary || "Skin barrier is well-balanced. Maintain damp skin moisture locking with ceramic serums."}
        </p>
      </motion.div>

      {/* Styled Quick Creation Input Card (Matches Reference Image) */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="w-full bg-[#f2f4f7] border border-[#e2e5eb] rounded-[28px] p-2.5 pl-5 flex items-center justify-between shadow-xs hover:border-[#cbd0db] transition-all"
      >
        <form onSubmit={handleQuickCreate} className="w-full flex items-center justify-between space-x-3">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Japan Trip"
            className="w-full bg-transparent text-[16px] font-medium text-[#121316] placeholder-[#9ca3af] focus:outline-none tracking-tight"
          />
          <button
            type="submit"
            className="bg-[#007aff] hover:bg-[#0062cc] active:scale-95 text-white text-[14px] font-semibold px-4 py-2.5 rounded-[20px] flex items-center space-x-1.5 shrink-0 transition-all shadow-sm cursor-pointer"
          >
            <span>Create</span>
            <span className="text-[15px] font-bold leading-none">→</span>
          </button>
        </form>
      </motion.div>

      {/* Created Items Pill List if any */}
      {notesList.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap gap-2 pt-1"
        >
          {notesList.map((note, idx) => (
            <div
              key={idx}
              className="px-3.5 py-1.5 rounded-2xl bg-white border border-slate-200 text-xs font-medium text-slate-800 flex items-center space-x-2 shadow-2xs"
            >
              <span>{note}</span>
              <button
                type="button"
                onClick={() => setNotesList(prev => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-red-500 font-bold ml-1 text-sm"
              >
                ×
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
};
