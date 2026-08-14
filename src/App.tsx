import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, syncUserProfile, subscribeFacialScans, getUserProfileFromFirestore } from './lib/firebase';
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
import { OnboardingScreen } from './components/OnboardingScreen';
import { SanaLogoIcon } from './components/SanaLogoIcon';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isNavMinimized, setIsNavMinimized] = useState(false);
  const [isExtendedMenuOpen, setIsExtendedMenuOpen] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState<boolean>(false);

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

  // Listen for custom trigger events from agent / approval cards
  useEffect(() => {
    const handleOpenScan = () => setIsScanOpen(true);
    const handleOpenChatSession = () => setActiveTab('agent');

    window.addEventListener('sana:open_facial_scan', handleOpenScan);
    window.addEventListener('sana:open_chat_session', handleOpenChatSession);

    return () => {
      window.removeEventListener('sana:open_facial_scan', handleOpenScan);
      window.removeEventListener('sana:open_chat_session', handleOpenChatSession);
    };
  }, []);

  // Listen to Firebase Auth - Load Persisted User Profile & Settings from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        // Fetch persisted settings directly from Firestore database
        const dbUserData = await getUserProfileFromFirestore(user.uid);
        const dbSettings = dbUserData?.settings || {};

        const profile: UserProfile = {
          uid: user.uid,
          displayName: dbUserData?.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'SANA User'),
          email: dbUserData?.email || user.email || 'guest@sana.app',
          photoURL: dbUserData?.photoURL || user.photoURL || undefined,
          isAnonymous: user.isAnonymous,
          settings: {
            temperatureUnit: 'C',
            scanNotificationTime: '00:00',
            scanReminderEnabled: true,
            theme: 'light',
            ...dbSettings
          }
        };
        setUserProfile(profile);

        // If onboarding has not been completed, trigger onboarding
        const hasCompletedOnboarding = dbSettings.onboardingCompleted === true;
        if (!hasCompletedOnboarding) {
          setForceOnboarding(true);
        } else {
          setForceOnboarding(false);
        }

        await syncUserProfile(user, profile.settings);
      } else {
        setUserProfile(null);
        setForceOnboarding(false);
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
            latitude: userProfile?.settings?.latitude,
            longitude: userProfile?.settings?.longitude,
            locationName: userProfile?.settings?.locationName || ''
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

  // Subscribe to Facial Scans in Firestore & Auto-Check Today's Scan Completion
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeFacialScans(userProfile.uid, (scans) => {
      if (scans.length > 0) {
        setLatestScan(scans[0] as FacialScanResult);

        // Check if any scan in Firestore database was completed TODAY
        const todayStr = new Date().toISOString().split('T')[0];
        const hasScanToday = scans.some((s: any) => {
          if (s.scanDate === todayStr) return true;
          if (s.timestamp) {
            let scanDateStr = '';
            if (typeof s.timestamp === 'string') {
              scanDateStr = s.timestamp.split('T')[0];
            } else if (s.timestamp.toDate && typeof s.timestamp.toDate === 'function') {
              scanDateStr = s.timestamp.toDate().toISOString().split('T')[0];
            } else if (s.timestamp.seconds) {
              scanDateStr = new Date(s.timestamp.seconds * 1000).toISOString().split('T')[0];
            }
            if (scanDateStr === todayStr) return true;
          }
          return false;
        });

        if (hasScanToday) {
          // Today's scan is verified in Firestore database! Mark scan completed for today.
          setUserProfile(prev => {
            if (!prev) return null;
            if (prev.settings?.lastCompletedScanDate === todayStr) return prev;
            return {
              ...prev,
              settings: {
                ...prev.settings,
                lastCompletedScanDate: todayStr
              }
            };
          });
          // Immediately dismiss any active daily scan notification
          setNotification(prev => (prev?.type === 'facial_scan' ? null : prev));
        }
      }
    });
    return () => unsub();
  }, [userProfile?.uid]);

  // Check Daily Facial Scan Pop-Up Trigger Logic against Firestore Cached State
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

    // 1. If today's scan is already cached as completed in database, NEVER show reminder popup
    if (lastCompleted === todayStr) {
      setNotification(prev => (prev?.type === 'facial_scan' ? null : prev));
      return;
    }

    // 2. Check if latestScan in state is from today
    if (latestScan) {
      let scanDateStr = '';
      if (typeof latestScan.timestamp === 'string') {
        scanDateStr = latestScan.timestamp.split('T')[0];
      } else if ((latestScan as any).timestamp?.toDate) {
        scanDateStr = (latestScan as any).timestamp.toDate().toISOString().split('T')[0];
      } else if ((latestScan as any).timestamp?.seconds) {
        scanDateStr = new Date((latestScan as any).timestamp.seconds * 1000).toISOString().split('T')[0];
      }
      if (scanDateStr === todayStr) {
        setNotification(prev => (prev?.type === 'facial_scan' ? null : prev));
        return;
      }
    }

    // 3. Check session dismissal
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
  }, [
    userProfile?.settings?.scanReminderEnabled,
    userProfile?.settings?.scanNotificationTime,
    userProfile?.settings?.lastCompletedScanDate,
    userProfile?.uid,
    latestScan
  ]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    if (userProfile) {
      const updatedProfile = {
        ...userProfile,
        settings: newSettings
      };
      setUserProfile(updatedProfile);
      if (newSettings.temperatureUnit === 'F') {
        setDailyBrief(prev => ({ ...prev, temperature: '73°F' }));
      } else {
        setDailyBrief(prev => ({ ...prev, temperature: '23°C' }));
      }
      // Save directly to Firestore database so refresh preserves this state
      await syncUserProfile({ uid: userProfile.uid }, newSettings);
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
        onAuthSuccess={(profile, isNewUser) => {
          setUserProfile(profile);
          if (isNewUser) {
            setForceOnboarding(true);
          } else {
            setForceOnboarding(false);
            setActiveTab('home');
          }
        }}
      />
    );
  }

  if (forceOnboarding || userProfile.settings?.onboardingCompleted !== true) {
    return (
      <OnboardingScreen
        userProfile={userProfile}
        onCompleteOnboarding={(updatedProfile) => {
          setUserProfile(updatedProfile);
          setForceOnboarding(false);
          setActiveTab('home');
        }}
        onOpenScan={() => setIsScanOpen(true)}
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
        isMinimized={isNavMinimized}
        onRestorePill={() => setIsNavMinimized(false)}
        userProfile={userProfile}
        onOpenScan={() => setIsScanOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReports={() => setIsReportsOpen(true)}
        onOpenVault={() => setIsVaultOpen(true)}
        theme={userProfile?.settings?.theme || 'light'}
        onThemeChange={(newTheme) => {
          if (userProfile) {
            handleUpdateSettings({
              ...userProfile.settings,
              theme: newTheme
            });
          }
        }}
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
        onRerunOnboarding={() => {
          setIsSettingsOpen(false);
          setForceOnboarding(true);
        }}
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
