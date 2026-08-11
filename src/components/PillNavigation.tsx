import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { NavigationTab } from '../types';
import { SanaAgentLogoIcon } from './SanaAgentLogoIcon';

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
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX - touchEndX; // positive = swiped left
    const diffY = touchStartY - touchEndY; // positive = swiped up

    // Determine if horizontal or vertical swipe dominates
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
      if (diffX > 35) {
        // Swiped Left -> Advance tab
        if (activeTab === 'home') onTabChange('agent');
        else if (activeTab === 'agent') onTabChange('calendar');
      } else if (diffX < -35) {
        // Swiped Right -> Previous tab
        if (activeTab === 'calendar') onTabChange('agent');
        else if (activeTab === 'agent') onTabChange('home');
      }
    } else if (diffY > 40) {
      // Swiped Up -> Expand Menu
      onSwipeUpExpand();
    }

    setTouchStartX(null);
    setTouchStartY(null);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center items-end pb-5 pt-3 pointer-events-none">
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
            className="pointer-events-auto h-2.5 w-28 rounded-full bg-[#1a1c1e]/40 backdrop-blur-md shadow-xs transition-all hover:bg-[#1a1c1e]/70 flex items-center justify-center cursor-pointer mb-2"
            title="Expand Navigation"
          />
        ) : (
          /* Gesture Region & Squarical Floating Pill Navigation */
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="pointer-events-auto px-4 pt-2 pb-1 flex justify-center items-center rounded-3xl touch-pan-x touch-pan-y"
          >
            <motion.div
              key="expanded-pill"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="squircle-pill px-3 py-2 flex items-center space-x-1.5 shadow-xl border border-white/80 bg-white/90 backdrop-blur-2xl"
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
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                <SanaAgentLogoIcon size={18} color={activeTab === 'agent' ? '#ffffff' : '#616874'} />
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
        </div>
        )}
      </AnimatePresence>
    </div>
  );
};
