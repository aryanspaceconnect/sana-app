import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { PopUpNotification } from '../types';

interface PopUpNotificationCardProps {
  notification: PopUpNotification | null;
  onDismiss: () => void;
  onAction: () => void;
}

export const PopUpNotificationCard: React.FC<PopUpNotificationCardProps> = ({
  notification,
  onDismiss,
  onAction
}) => {
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  if (!notification) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const diffY = e.changedTouches[0].clientY - touchStartY;

    if (diffY > 40) {
      onDismiss(); // Swipe down to dismiss
    } else if (diffY < -30) {
      onAction(); // Swipe up to act
    }
    setTouchStartY(null);
  };

  return (
    <AnimatePresence>
      <div className="fixed bottom-24 left-0 right-0 z-30 flex justify-center px-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="pointer-events-auto w-full max-w-sm squircle-card p-4 flex items-center justify-between border border-white/90 shadow-lg bg-white/95 backdrop-blur-xl"
        >
          <div className="flex items-center space-x-3.5" onClick={onAction}>
            {/* Visual Symbol Icon (No Emojis) */}
            <div className="w-10 h-10 rounded-2xl bg-[#1a1c1e] text-white flex items-center justify-center shrink-0">
              {notification.iconType === 'scan' && (
                <Icon icon="solar:scanner-bold" className="w-5 h-5 text-white" />
              )}
              {notification.iconType === 'sun' && (
                <Icon icon="solar:sun-bold" className="w-5 h-5 text-white" />
              )}
              {notification.iconType === 'sparkle' && (
                <Icon icon="solar:atom-bold" className="w-5 h-5 text-white" />
              )}
            </div>

            <div className="text-left cursor-pointer">
              <div className="flex items-center space-x-2">
                <span className="text-[13px] font-semibold text-[#1a1c1e] tracking-tight">
                  {notification.title}
                </span>
                <span className="text-[10px] uppercase font-medium text-[#787f8d] tracking-wider px-1.5 py-0.5 rounded-full bg-[#f0f3f6]">
                  {notification.timeAgo}
                </span>
              </div>
              <p className="text-[12px] text-[#5e6573] line-clamp-1 mt-0.5">
                {notification.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0 pl-2">
            <button
              onClick={onAction}
              className="px-3 py-1.5 rounded-xl bg-[#f0f4f8] text-[#1a1c1e] text-[12px] font-medium hover:bg-[#1a1c1e] hover:text-white transition-colors cursor-pointer"
            >
              {notification.actionText || 'Open'}
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-full text-[#8e95a2] hover:text-[#1a1c1e] hover:bg-[#f0f2f5] transition-colors cursor-pointer"
              title="Dismiss"
            >
              <Icon icon="solar:close-circle-linear" className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
