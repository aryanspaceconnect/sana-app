import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, UserSettings } from '../types';
import { signInWithGoogle, signInGuest, logoutUser, syncUserProfile } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUpdateSettings
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const currentSettings: UserSettings = userProfile?.settings || {
    temperatureUnit: 'C',
    scanNotificationTime: '06:00',
    theme: 'light'
  };

  const handleToggleTemp = (unit: 'C' | 'F') => {
    const updated = { ...currentSettings, temperatureUnit: unit };
    onUpdateSettings(updated);
    if (userProfile?.uid && !userProfile.isAnonymous) {
      syncUserProfile({ uid: userProfile.uid } as any, updated);
    }
  };

  const handleScanTimeChange = (time: string) => {
    const updated = { ...currentSettings, scanNotificationTime: time };
    onUpdateSettings(updated);
    if (userProfile?.uid && !userProfile.isAnonymous) {
      syncUserProfile({ uid: userProfile.uid } as any, updated);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google Auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAuth = async () => {
    setLoading(true);
    try {
      await signInGuest();
    } catch (err) {
      console.error("Guest Auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-sm rounded-[32px] bg-white border border-white/80 overflow-hidden shadow-2xl p-6 relative flex flex-col space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-[#1a1c1e] text-white">
                <Icon icon="solar:settings-bold" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#121316]">Account & Settings</h3>
                <p className="text-[11px] text-[#787f8d]">SANA Personalization</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-[#787f8d] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Card */}
          <div className="p-4 rounded-[22px] bg-[#f8f9fb] border border-[#eaedf1] flex items-center space-x-3.5">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#1a1c1e] text-white flex items-center justify-center font-bold text-base">
                {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'G'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-[#121316] truncate">
                {userProfile?.displayName || 'Guest User'}
              </h4>
              <p className="text-[11.5px] text-[#787f8d] truncate">
                {userProfile?.email || 'Anonymous session'}
              </p>
            </div>
          </div>

          {/* Authentication Actions */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Identity & Sync
            </span>

            {userProfile?.isAnonymous || !userProfile ? (
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-white border border-[#d0d5dd] text-[#121316] text-[13.5px] font-semibold hover:bg-[#f8f9fa] transition-colors cursor-pointer shadow-2xs flex items-center justify-center space-x-2.5"
              >
                <Icon icon="flat-color-icons:google" className="w-5 h-5" />
                <span>Sign in with Google</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[13px] font-semibold hover:bg-[#fee2e2] transition-colors cursor-pointer flex items-center justify-center space-x-2"
              >
                <Icon icon="solar:logout-3-linear" className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>

          {/* Temperature & Unit Settings */}
          <div className="space-y-3 pt-1">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Preferences
            </span>

            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#121316]">Temperature Unit</p>
                <p className="text-[11px] text-[#787f8d]">Weather forecast display</p>
              </div>

              <div className="flex items-center p-1 rounded-xl bg-[#e2e8f0]">
                <button
                  onClick={() => handleToggleTemp('C')}
                  className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                    currentSettings.temperatureUnit === 'C' ? 'bg-white text-[#121316] shadow-2xs' : 'text-[#64748b]'
                  }`}
                >
                  °C
                </button>
                <button
                  onClick={() => handleToggleTemp('F')}
                  className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                    currentSettings.temperatureUnit === 'F' ? 'bg-white text-[#121316] shadow-2xs' : 'text-[#64748b]'
                  }`}
                >
                  °F
                </button>
              </div>
            </div>

            {/* Notification Time Setting */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#121316]">Scan Reminder</p>
                <p className="text-[11px] text-[#787f8d]">Daily check-in pop-up</p>
              </div>

              <select
                value={currentSettings.scanNotificationTime}
                onChange={(e) => handleScanTimeChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#d0d5dd] text-[12px] font-semibold text-[#121316] focus:outline-none"
              >
                <option value="02:00">2:00 AM</option>
                <option value="03:00">3:00 AM</option>
                <option value="06:00">6:00 AM</option>
                <option value="08:00">8:00 AM</option>
              </select>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
