import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, UserSettings, PopUpNotification } from '../types';
import { signInWithGoogle, logoutUser, syncUserProfile } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onTestTriggerPopup?: (popup: PopUpNotification) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUpdateSettings,
  onTestTriggerPopup
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const currentSettings: UserSettings = userProfile?.settings || {
    temperatureUnit: 'C',
    scanNotificationTime: '00:00',
    scanReminderEnabled: true,
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

  const handleToggleReminderEnabled = () => {
    const updated = {
      ...currentSettings,
      scanReminderEnabled: currentSettings.scanReminderEnabled === false ? true : false
    };
    onUpdateSettings(updated);
    if (userProfile?.uid && !userProfile.isAnonymous) {
      syncUserProfile({ uid: userProfile.uid } as any, updated);
    }
  };

  const handleResetScanStatus = () => {
    const updated = {
      ...currentSettings,
      lastCompletedScanDate: ''
    };
    onUpdateSettings(updated);
    if (userProfile?.uid && !userProfile.isAnonymous) {
      syncUserProfile({ uid: userProfile.uid } as any, updated);
    }
    alert("Daily scan completion status reset for testing. Re-open app or test trigger pop-up!");
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

            {/* Notification Time & Daily Scan Setting */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#121316]">Daily Scan Reminder</p>
                  <p className="text-[11px] text-[#787f8d]">Pop-up check-in after set time</p>
                </div>

                <button
                  onClick={handleToggleReminderEnabled}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    currentSettings.scanReminderEnabled !== false ? 'bg-[#121316]' : 'bg-[#cbd5e1]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      currentSettings.scanReminderEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#eaedf1]">
                <span className="text-[12px] font-medium text-[#475569]">Check-in Time</span>
                <select
                  value={currentSettings.scanNotificationTime}
                  onChange={(e) => handleScanTimeChange(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-[#d0d5dd] text-[12px] font-semibold text-[#121316] focus:outline-none"
                >
                  <option value="00:00">12:00 AM (Midnight Daily)</option>
                  <option value="06:00">6:00 AM (Morning)</option>
                  <option value="09:00">9:00 AM (Routine Time)</option>
                  <option value="12:00">12:00 PM (Noon Check)</option>
                  <option value="18:00">6:00 PM (Evening)</option>
                </select>
              </div>
            </div>

            {/* Backdoor / Developer Test Triggers */}
            <div className="space-y-2 pt-2 border-t border-[#eaedf1]">
              <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
                Pop-Up Card Backdoor & Testing
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (onTestTriggerPopup) {
                      onTestTriggerPopup({
                        id: `scan_popup_${Date.now()}`,
                        type: 'facial_scan',
                        title: 'Daily Facial Scan Due',
                        subtitle: 'Complete your morning AI skin feature analysis.',
                        timeAgo: '12:00 AM',
                        actionText: 'Start Daily Scan',
                        iconType: 'scan',
                        badgeText: 'DAILY FACIAL SCAN'
                      });
                      onClose();
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-[#f0f4f8] border border-[#d0dbe5] text-[11.5px] font-semibold text-[#121316] hover:bg-[#121316] hover:text-white transition-colors cursor-pointer text-left flex flex-col justify-between space-y-1"
                >
                  <div className="flex items-center space-x-1.5">
                    <Icon icon="solar:scanner-bold" className="w-4 h-4 text-emerald-600" />
                    <span>Test Facial Scan</span>
                  </div>
                  <span className="text-[10px] opacity-75">Dockable pop-up</span>
                </button>

                <button
                  onClick={() => {
                    if (onTestTriggerPopup) {
                      onTestTriggerPopup({
                        id: `agent_popup_${Date.now()}`,
                        type: 'custom_action',
                        title: 'Skin Barrier Alert',
                        subtitle: 'Low humidity detected. Apply ceramide barrier cream.',
                        timeAgo: 'Just now',
                        actionText: 'Apply Routine',
                        iconType: 'shield',
                        badgeText: 'SANA AGENT ALERT'
                      });
                      onClose();
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-[#f0f4f8] border border-[#d0dbe5] text-[11.5px] font-semibold text-[#121316] hover:bg-[#121316] hover:text-white transition-colors cursor-pointer text-left flex flex-col justify-between space-y-1"
                >
                  <div className="flex items-center space-x-1.5">
                    <Icon icon="solar:shield-warning-bold-duotone" className="w-4 h-4 text-sky-600" />
                    <span>Test Agent Alert</span>
                  </div>
                  <span className="text-[10px] opacity-75">10-30 char title</span>
                </button>
              </div>

              <button
                onClick={handleResetScanStatus}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#475569] text-[11px] font-medium transition-colors cursor-pointer"
              >
                Reset Daily Scan Completion Status
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
