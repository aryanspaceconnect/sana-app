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

      {/* Weather Card */}
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
      </motion.div>
    </div>
  );
};
