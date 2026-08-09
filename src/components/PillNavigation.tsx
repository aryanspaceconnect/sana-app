import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { NavigationTab } from '../types';

interface PillNavigationProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onSwipeUpExpand: () => void;
  isMinimized?: boolean;
  onRestorePill?: () => void;
}

export const PillNavigation: React.FC<PillNavigationProps> = ({
  activeTab,
  onTabChange,
  onSwipeUpExpand,
  isMinimized = false,
  onRestorePill
}) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchStartY - touchEndY;

    // Swipe up detected (50px displacement)
    if (diffY > 45) {
      onSwipeUpExpand();
    }
    setTouchStartY(null);
  };

  return (
    <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center items-center pointer-events-none">
      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* Minimized subtle indicator bar */
          <motion.button
            key="minimized-bar"
            initial={{ opacity: 0, y: 15, scale: 0.8 }}
            animate={{ opacity: 0.85, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.8 }}
            whileHover={{ opacity: 1, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRestorePill}
            className="pointer-events-auto h-2 w-28 rounded-full bg-[#1a1c1e]/40 backdrop-blur-md shadow-xs transition-all hover:bg-[#1a1c1e]/70 flex items-center justify-center cursor-pointer"
            title="Expand Navigation"
          />
        ) : (
          /* Main Squarical Floating Pill Navigation */
          <motion.div
            key="expanded-pill"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="pointer-events-auto squircle-pill px-3 py-2 flex items-center space-x-1.5 shadow-xl border border-white/80 bg-white/90 backdrop-blur-2xl"
          >
            {/* Option 1: Home */}
            <button
              onClick={() => onTabChange('home')}
              className={`relative px-4 py-2.5 rounded-[16px] flex items-center space-x-2 transition-all duration-300 cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-[#1a1c1e] text-white shadow-sm'
                  : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
              }`}
            >
              <Icon 
                icon={activeTab === 'home' ? "solar:home-smile-bold" : "solar:home-smile-angle-linear"} 
                className="w-5 h-5 transition-transform duration-300" 
              />
              {activeTab === 'home' && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-[13px] font-medium tracking-tight whitespace-nowrap overflow-hidden"
                >
                  Home
                </motion.span>
              )}
            </button>

            {/* Option 2: AI Agent (SANA Custom Agent Emblem) */}
            <button
              onClick={() => onTabChange('agent')}
              className={`relative px-4 py-2.5 rounded-[16px] flex items-center space-x-2 transition-all duration-300 cursor-pointer ${
                activeTab === 'agent'
                  ? 'bg-[#1a1c1e] text-white shadow-sm'
                  : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
              }`}
            >
              {/* Custom SVG Agent Emblem */}
              <div className="relative w-5 h-5 flex items-center justify-center">
                <Icon 
                  icon={activeTab === 'agent' ? "solar:atom-bold-duotone" : "solar:atom-linear"} 
                  className={`w-5 h-5 transition-transform duration-300 ${activeTab === 'agent' ? 'text-white' : 'text-[#616874]'}`} 
                />
              </div>
              {activeTab === 'agent' && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-[13px] font-medium tracking-tight whitespace-nowrap overflow-hidden"
                >
                  SANA Agent
                </motion.span>
              )}
            </button>

            {/* Option 3: Calendar */}
            <button
              onClick={() => onTabChange('calendar')}
              className={`relative px-4 py-2.5 rounded-[16px] flex items-center space-x-2 transition-all duration-300 cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-[#1a1c1e] text-white shadow-sm'
                  : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
              }`}
            >
              <Icon 
                icon={activeTab === 'calendar' ? "solar:calendar-bold" : "solar:calendar-minimalistic-linear"} 
                className="w-5 h-5 transition-transform duration-300" 
              />
              {activeTab === 'calendar' && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="text-[13px] font-medium tracking-tight whitespace-nowrap overflow-hidden"
                >
                  Calendar
                </motion.span>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
