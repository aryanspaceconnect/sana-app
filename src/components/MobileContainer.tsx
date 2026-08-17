import React from 'react';
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
  return (
    <div className="fixed inset-0 w-full h-full min-h-[100dvh] bg-[#f8f9fb] flex items-center justify-center overflow-hidden font-sans select-none">
      {/* Fixed application container explicitly bounded below browser native UI header */}
      <div 
        className="w-full h-full max-w-lg mx-auto bg-[#f8f9fb] relative overflow-hidden flex flex-col justify-between pt-[max(env(safe-area-inset-top),48px)]"
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

