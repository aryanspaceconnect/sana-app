import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, syncUserProfile, subscribeFacialScans } from './lib/firebase';
import { NavigationTab, UserProfile, UserSettings, FacialScanResult, DailyBriefing, PopUpNotification } from './types';

// Components
import { MobileContainer } from './components/MobileContainer';
import { Header } from './components/Header';
import { PillNavigation } from './components/PillNavigation';
import { ExtendedMenuDrawer } from './components/ExtendedMenuDrawer';
import { PopUpNotificationCard } from './components/PopUpNotificationCard';
import { HomeDashboard } from './components/HomeDashboard';
import { AIAgentChat } from './components/AIAgentChat';
import { CalendarModal } from './components/CalendarModal';
import { FacialScanModal } from './components/FacialScanModal';
import { SettingsModal } from './components/SettingsModal';
import { ReportsModal } from './components/ReportsModal';
import { SanaVaultModal } from './components/SanaVaultModal';
import { AuthScreen } from './components/AuthScreen';
import { SanaLogoIcon } from './components/SanaLogoIcon';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isNavMinimized, setIsNavMinimized] = useState(false);
  const [isExtendedMenuOpen, setIsExtendedMenuOpen] = useState(false);

  // Modals
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);

  // Facial Scan & Daily Data
  const [latestScan, setLatestScan] = useState<FacialScanResult | null>(null);
  const [dailyBrief, setDailyBrief] = useState<DailyBriefing>({
    greeting: 'Morning, sunshine',
    temperature: '23°C',
    weatherCondition: 'Partly Sunny',
    uvIndex: 6,
    uvLevel: 'Moderate High',
    humidity: '58%',
    waterTargetLiters: '2.4L',
    primaryReminders: [
      'Broad spectrum sunscreen application',
      'Hydration target: 2.4L',
      'Evening facial barrier check at 9:00 PM'
    ]
  });

  // Pop-up Notification State (starts null so no hardcoded popups appear)
  const [notification, setNotification] = useState<PopUpNotification | null>(null);

  // Listen to Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        const profile: UserProfile = {
          uid: user.uid,
          displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'SANA User'),
          email: user.email || 'guest@sana.app',
          photoURL: user.photoURL || undefined,
          isAnonymous: user.isAnonymous,
          settings: {
            temperatureUnit: 'C',
            scanNotificationTime: '00:00',
            scanReminderEnabled: true,
            theme: 'light'
          }
        };
        setUserProfile(profile);
        await syncUserProfile(user);
      } else {
        // User logged out or not authenticated
        setUserProfile(null);
      }
      setAuthInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch Daily Brief from Server Endpoint
  useEffect(() => {
    const fetchDailyBrief = async () => {
      try {
        const res = await fetch('/api/daily-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temperatureUnit: userProfile?.settings?.temperatureUnit || 'C',
            latitude: userProfile?.settings?.latitude ?? 21.12,
            longitude: userProfile?.settings?.longitude ?? 73.11,
            locationName: userProfile?.settings?.locationName || 'Bardoli, IN'
          })
        });
        if (res.ok) {
          const data = await res.json();
          setDailyBrief(data);
        }
      } catch (err) {
        console.warn("Daily brief fetch error:", err);
      }
    };

    fetchDailyBrief();
  }, [
    userProfile?.settings?.temperatureUnit,
    userProfile?.settings?.latitude,
    userProfile?.settings?.longitude,
    userProfile?.settings?.locationName
  ]);

  // Subscribe to Facial Scans in Firestore
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeFacialScans(userProfile.uid, (scans) => {
      if (scans.length > 0) {
        setLatestScan(scans[0] as FacialScanResult);
      }
    });
    return () => unsub();
  }, [userProfile?.uid]);

  // Check Daily Facial Scan Pop-Up Trigger Logic
  useEffect(() => {
    if (!userProfile) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const settings: UserSettings = userProfile.settings || {
      temperatureUnit: 'C',
      scanNotificationTime: '00:00',
      scanReminderEnabled: true,
      theme: 'light'
    };
    const reminderEnabled = settings.scanReminderEnabled !== false;
    const lastCompleted = settings.lastCompletedScanDate;

    if (lastCompleted === todayStr) {
      return;
    }

    const sessionDismissed = sessionStorage.getItem(`sana_popup_dismissed_${todayStr}`);
    if (sessionDismissed === 'true') {
      return;
    }

    if (reminderEnabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetTimeStr = settings.scanNotificationTime || '00:00';
      const [targetH, targetM] = targetTimeStr.split(':').map(Number);
      const targetMinutes = (targetH || 0) * 60 + (targetM || 0);

      if (currentMinutes >= targetMinutes) {
        setNotification({
          id: `daily_scan_${todayStr}`,
          type: 'facial_scan',
          title: 'Daily Facial Scan Due',
          subtitle: 'Perform your daily AI facial analysis to sync skin barrier & hydration metrics.',
          timeAgo: targetTimeStr === '00:00' ? '12:00 AM' : `${targetTimeStr} Check`,
          actionText: 'Start Daily Scan',
          iconType: 'scan',
          badgeText: 'DAILY FACIAL SCAN',
          actionTarget: 'scan',
          autoTriggered: true
        });
      }
    }
  }, [userProfile?.settings?.scanReminderEnabled, userProfile?.settings?.scanNotificationTime, userProfile?.settings?.lastCompletedScanDate, userProfile?.uid]);

  const handleUpdateSettings = (newSettings: UserSettings) => {
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        settings: newSettings
      });
      if (newSettings.temperatureUnit === 'F') {
        setDailyBrief(prev => ({ ...prev, temperature: '73°F' }));
      } else {
        setDailyBrief(prev => ({ ...prev, temperature: '23°C' }));
      }
    }
  };

  if (authInitializing) {
    return (
      <div className="w-full h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#121316] flex items-center justify-center text-white mb-3 shadow-md animate-pulse">
          <SanaLogoIcon size={24} color="#ffffff" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[#121316] lowercase">sana</h2>
        <p className="text-xs text-slate-400 mt-1">Initializing skin & health intelligence...</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <AuthScreen
        onAuthSuccess={(profile) => setUserProfile(profile)}
      />
    );
  }

  return (
    <MobileContainer activeTab={activeTab} onTabChange={setActiveTab}>
      {/* Header Bar */}
      <Header
        userProfile={userProfile}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScan={() => setIsScanOpen(true)}
      />

      {/* Main Screen Views */}
      <div className="w-full h-[calc(100%-60px)] overflow-hidden relative">
        {activeTab === 'home' && (
          <HomeDashboard
            userProfile={userProfile}
            latestScan={latestScan}
            dailyBrief={dailyBrief}
            onOpenScan={() => setIsScanOpen(true)}
            onOpenAgent={() => setActiveTab('agent')}
            onOpenCalendar={() => setActiveTab('calendar')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeTab === 'agent' && (
          <AIAgentChat
            userProfile={userProfile}
            onMinimizeNavToggle={setIsNavMinimized}
            onTriggerPopup={(popup) => setNotification(popup)}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarModal
            userProfile={userProfile}
            onOpenScan={() => setIsScanOpen(true)}
          />
        )}
      </div>

      {/* Floating Pill Navigation Bar */}
      <PillNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'home') setIsNavMinimized(false);
        }}
        onSwipeUpExpand={() => setIsExtendedMenuOpen(true)}
        isMinimized={isNavMinimized}
        onRestorePill={() => setIsNavMinimized(false)}
      />

      {/* Extended Choice Menu Drawer */}
      <ExtendedMenuDrawer
        isOpen={isExtendedMenuOpen}
        onClose={() => setIsExtendedMenuOpen(false)}
        userProfile={userProfile}
        onOpenScan={() => setIsScanOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReports={() => setIsReportsOpen(true)}
        onOpenRoutine={() => setActiveTab('home')}
        onOpenVault={() => setIsVaultOpen(true)}
      />

      {/* PopUp Notification Card (Daily Check-in) */}
      <PopUpNotificationCard
        notification={notification}
        onDismiss={() => {
          const todayStr = new Date().toISOString().split('T')[0];
          sessionStorage.setItem(`sana_popup_dismissed_${todayStr}`, 'true');
          setNotification(null);
        }}
        onAction={(notif) => {
          setNotification(null);
          if (notif.actionTarget === 'calendar') {
            setActiveTab('calendar');
          } else if (notif.actionTarget === 'reports') {
            setIsReportsOpen(true);
          } else if (notif.actionTarget === 'vault') {
            setIsVaultOpen(true);
          } else if (notif.actionTarget === 'agent') {
            setActiveTab('agent');
          } else {
            setIsScanOpen(true);
          }
        }}
      />

      {/* Facial Skin Scanner Modal */}
      <FacialScanModal
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        userProfile={userProfile}
        onScanComplete={(result) => {
          setLatestScan(result);
          setNotification(null);
          const todayStr = new Date().toISOString().split('T')[0];
          const updatedSettings = {
            ...(userProfile?.settings || {
              temperatureUnit: 'C',
              scanNotificationTime: '00:00',
              scanReminderEnabled: true,
              theme: 'light'
            }),
            lastCompletedScanDate: todayStr
          };
          handleUpdateSettings(updatedSettings);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userProfile={userProfile}
        onUpdateSettings={handleUpdateSettings}
        onTestTriggerPopup={(popup) => setNotification(popup)}
      />

      {/* Reports Modal */}
      <ReportsModal
        isOpen={isReportsOpen}
        onClose={() => setIsReportsOpen(false)}
        userProfile={userProfile}
      />

      {/* Sana Agent Vault Modal */}
      <SanaVaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        userId={userProfile?.uid || 'guest_user'}
      />
    </MobileContainer>
  );
}
