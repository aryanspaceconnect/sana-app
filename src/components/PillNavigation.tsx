import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { NavigationTab } from '../types';
import { SanaAgentLogoIcon } from './SanaAgentLogoIcon';

const DynamicCalendarIcon: React.FC<{ isActive?: boolean }> = ({ isActive = false }) => {
  const dateNumber = new Date().getDate(); // Current date 1-31
  const color = isActive ? "#ffffff" : "#616874";

  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="transition-transform duration-300 shrink-0"
    >
      {/* Calendar Card Outer Border */}
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="4.5"
        stroke={color}
        strokeWidth="1.8"
      />
      {/* Top Divider Header Line */}
      <line
        x1="3"
        y1="8.5"
        x2="21"
        y2="8.5"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Binder Loops */}
      <line
        x1="7.5"
        y1="2"
        x2="7.5"
        y2="4.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="16.5"
        y1="2"
        x2="16.5"
        y2="4.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Dynamic Date Text - Bold, centered & legible */}
      <text
        x="12"
        y="15.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={dateNumber > 9 ? "9.5" : "10.5"}
        fontWeight="800"
        fill={color}
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
        letterSpacing="-0.02em"
      >
        {dateNumber}
      </text>
    </svg>
  );
};

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
          /* Minimized subtle indicator bar — iOS style drag pill with psychological micro-interaction */
          <motion.button
            key="minimized-bar"
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 0.75, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.85 }}
            whileHover={{ opacity: 1, scale: 1.1, width: '4rem' }}
            whileTap={{ scale: 0.95 }}
            onClick={onRestorePill}
            className="pointer-events-auto h-1.5 w-12 rounded-full bg-[#1a1c1e]/35 backdrop-blur-md shadow-xs transition-all duration-300 hover:bg-[#1a1c1e]/75 flex items-center justify-center cursor-pointer mb-2.5 group relative"
            title="Tap to restore menu"
          >
            {/* Subtle psychological indicator dot on hover */}
            <span className="absolute -top-6 text-[10px] font-medium text-slate-500 bg-white/90 px-2 py-0.5 rounded-full shadow-2xs border border-slate-200/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              Menu
            </span>
          </motion.button>
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
              <DynamicCalendarIcon isActive={activeTab === 'calendar'} />
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
