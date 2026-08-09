import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NavigationTab } from '../types';

interface MobileContainerProps {
  children: React.ReactNode;
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const MobileContainer: React.FC<MobileContainerProps> = ({
  children,
  activeTab,
  onTabChange
}) => {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX;

    // Horizontal swipe gesture detection
    if (diffX < -60) {
      // Swiped left -> move to next tab
      if (activeTab === 'home') onTabChange('agent');
      else if (activeTab === 'agent') onTabChange('calendar');
    } else if (diffX > 60) {
      // Swiped right -> move to prev tab
      if (activeTab === 'calendar') onTabChange('agent');
      else if (activeTab === 'agent') onTabChange('home');
    }

    setTouchStartX(null);
  };

  return (
    <div className="w-full h-screen min-h-screen bg-[#f8f9fb] flex items-center justify-center overflow-hidden font-sans select-none">
      {/* Clean Web Container (Native Web Application without synthetic phone bezel frames) */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full max-w-lg mx-auto bg-[#f8f9fb] relative overflow-hidden flex flex-col justify-between"
      >
        {/* Screen Content Wrapper */}
        <div className="flex-1 w-full h-full overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: activeTab === 'home' ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: activeTab === 'home' ? 20 : -20 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

