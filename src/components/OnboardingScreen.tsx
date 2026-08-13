import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, OnboardingProfile } from '../types';
import { syncUserProfile } from '../lib/firebase';
import { SanaLogoIcon } from './SanaLogoIcon';

interface OnboardingScreenProps {
  userProfile: UserProfile;
  onCompleteOnboarding: (updatedProfile: UserProfile) => void;
  onOpenScan?: () => void;
}

const SKIN_TYPES = [
  {
    id: 'combination',
    title: 'Combination',
    desc: 'Oily T-zone (forehead, nose) with normal or dry cheeks',
    icon: 'solar:waterdrops-bold-duotone',
    color: 'from-blue-500/10 to-indigo-500/10 text-indigo-600 border-indigo-200'
  },
  {
    id: 'oily',
    title: 'Oily',
    desc: 'Excess sebum, visible pores, prone to shine & congestion',
    icon: 'solar:droplet-bold-duotone',
    color: 'from-emerald-500/10 to-teal-500/10 text-teal-600 border-teal-200'
  },
  {
    id: 'dry',
    title: 'Dry / Flaky',
    desc: 'Tight feeling, rough texture, vulnerable skin barrier',
    icon: 'solar:sun-fog-bold-duotone',
    color: 'from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200'
  },
  {
    id: 'sensitive',
    title: 'Sensitive / Reactive',
    desc: 'Easily flushed, reacts to active ingredients, prone to stinging',
    icon: 'solar:shield-warning-bold-duotone',
    color: 'from-rose-500/10 to-pink-500/10 text-rose-600 border-rose-200'
  },
  {
    id: 'normal',
    title: 'Balanced / Normal',
    desc: 'Well-hydrated, smooth barrier with minimal sensitivity',
    icon: 'solar:sparkles-bold-duotone',
    color: 'from-sky-500/10 to-cyan-500/10 text-sky-600 border-sky-200'
  }
];

const SKIN_CONCERNS = [
  { id: 'barrier', label: 'Barrier Damage & Redness', icon: 'solar:shield-cross-bold-duotone' },
  { id: 'acne', label: 'Acne & Blemish Control', icon: 'solar:medical-mask-bold-duotone' },
  { id: 'hydration', label: 'Deep Dehydration', icon: 'solar:droplet-line-duotone' },
  { id: 'pigmentation', label: 'Dark Spots & Hyperpigmentation', icon: 'solar:sun-bold-duotone' },
  { id: 'aging', label: 'Fine Lines & Firmness', icon: 'solar:clock-circle-bold-duotone' },
  { id: 'pores', label: 'Enlarged Pores & Texture', icon: 'solar:tuning-square-2-bold-duotone' }
];

const CLIMATES = [
  { id: 'hot_humid', label: 'Hot & Humid', icon: 'solar:cloud-water-drop-bold-duotone' },
  { id: 'cold_dry', label: 'Cold & Dry', icon: 'solar:snowflake-bold-duotone' },
  { id: 'sunny_uv', label: 'High UV & Sunny', icon: 'solar:sun-2-bold-duotone' },
  { id: 'temperate', label: 'Moderate / Balanced', icon: 'solar:cloud-sun-bold-duotone' }
];

export function OnboardingScreen({ userProfile, onCompleteOnboarding, onOpenScan }: OnboardingScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [skinType, setSkinType] = useState<OnboardingProfile['skinType']>('combination');
  const [concerns, setConcerns] = useState<string[]>(['barrier', 'hydration']);
  const [climate, setClimate] = useState<string>('temperate');
  const [ageGroup, setAgeGroup] = useState<string>('25-34');
  const [waterTarget, setWaterTarget] = useState<string>('2.5L');
  const [routineHabits, setRoutineHabits] = useState<string>('Cleanser + Moisturizer + Sunscreen');

  // AI Welcome Message State
  const [aiGreeting, setAiGreeting] = useState<string>('');
  const [aiConsultationSummary, setAiConsultationSummary] = useState<string>('');
  const [aiGenerating, setAiGenerating] = useState(false);

  const toggleConcern = (id: string) => {
    setConcerns(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // Generate Personalized Welcome from SANA AI
  const handleGenerateAiConsultation = async () => {
    setStep(4);
    setAiGenerating(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              text: `I am a new user completing onboarding. My name is ${userProfile.displayName}. My skin type is ${skinType}, key concerns are ${concerns.join(', ')}, climate is ${climate}, age group is ${ageGroup}, water target is ${waterTarget}, current routine is "${routineHabits}". 
Please introduce yourself warm and professionally as SANA, provide a brief 3-sentence personalized skin baseline assessment, and recommend an immediate priority focal point for my daily skin care.`
            }
          ],
          userProfile
        })
      });

      if (res.ok) {
        const data = await res.json();
        const responseText = data.text || data.response || "Welcome to SANA Intelligence! Your baseline skin profile has been created.";
        setAiConsultationSummary(responseText);
      } else {
        setAiConsultationSummary(`Welcome to SANA, ${userProfile.displayName}! We've registered your ${skinType} skin profile and primary focus areas (${concerns.slice(0, 2).join(', ')}). Your AI Skin Companion is ready.`);
      }
    } catch (err) {
      console.warn("Error generating AI onboarding summary:", err);
      setAiConsultationSummary(`Welcome to SANA, ${userProfile.displayName}! Your personalized skin health engine is initialized for ${skinType} skin.`);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setLoading(true);
    try {
      const onboardingData: OnboardingProfile = {
        skinType,
        concerns,
        climate,
        ageGroup,
        waterTarget,
        routineHabits
      };

      const updatedSettings = {
        ...userProfile.settings,
        onboardingCompleted: true,
        onboardingProfile: onboardingData
      };

      const updatedProfile: UserProfile = {
        ...userProfile,
        settings: updatedSettings
      };

      // Sync to Firestore database
      await syncUserProfile({ uid: userProfile.uid }, updatedSettings);

      // Trigger completion callback to transition to Main Dashboard
      onCompleteOnboarding(updatedProfile);
    } catch (err) {
      console.error("Error finalizing onboarding:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-[#f8f9fb] flex flex-col justify-between p-4 sm:p-6 overflow-y-auto select-none">
      {/* Top Header */}
      <div className="w-full max-w-lg mx-auto pt-2 pb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#121316] flex items-center justify-center text-white shadow-xs">
            <SanaLogoIcon size={18} color="#ffffff" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-[#121316] lowercase">sana</span>
            <span className="text-xs text-slate-400 ml-1.5 font-medium">New Member Setup</span>
          </div>
        </div>

        {/* Progress Step Pills */}
        <div className="flex items-center space-x-1.5">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step
                  ? 'w-6 bg-[#121316]'
                  : s < step
                  ? 'w-2 bg-emerald-500'
                  : 'w-2 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-lg mx-auto bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50 my-auto">
        <AnimatePresence mode="wait">
          {/* STEP 1: SKIN TYPE */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#121316] text-[10px] font-semibold tracking-wider uppercase">
                  Step 1 of 4 • Skin Biology
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  What is your primary skin type?
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Select the condition that best describes your bare skin after cleansing.
                </p>
              </div>

              <div className="space-y-2.5">
                {SKIN_TYPES.map((st) => {
                  const isSelected = skinType === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSkinType(st.id as any)}
                      className={`w-full p-3.5 rounded-2xl border text-left flex items-start space-x-3.5 transition-all duration-200 ${
                        isSelected
                          ? 'border-[#121316] bg-slate-900 text-white shadow-md'
                          : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/80 text-[#121316]'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/10 text-white' : 'bg-white text-slate-700 border border-slate-200'
                      }`}>
                        <Icon icon={st.icon} className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold">{st.title}</h4>
                          {isSelected && (
                            <Icon icon="solar:check-circle-bold" className="w-4 h-4 text-emerald-400" />
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 leading-snug ${
                          isSelected ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          {st.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Age Group */}
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 ml-0.5">
                  Age Range
                </label>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  {['Under 20', '20-30', '31-45', '46+'].map(age => (
                    <button
                      key={age}
                      type="button"
                      onClick={() => setAgeGroup(age)}
                      className={`py-2 px-1 rounded-xl border text-center text-[11px] font-medium transition-all ${
                        ageGroup === age
                          ? 'border-[#121316] bg-[#121316] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {age}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3 px-4 rounded-2xl bg-[#121316] hover:bg-[#22252c] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]"
              >
                <span>Continue to Skin Goals</span>
                <Icon icon="solar:arrow-right-linear" className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: SKIN CONCERNS */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#121316] text-[10px] font-semibold tracking-wider uppercase">
                  Step 2 of 4 • Primary Priorities
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  What are your top skin concerns?
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Select all target areas you would like SANA AI to monitor and optimize.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SKIN_CONCERNS.map((c) => {
                  const active = concerns.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleConcern(c.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center space-x-3 transition-all ${
                        active
                          ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-semibold shadow-xs'
                          : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        active ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'
                      }`}>
                        <Icon icon={c.icon} className="w-4 h-4" />
                      </div>
                      <span className="text-xs flex-1 leading-tight">{c.label}</span>
                      {active && (
                        <Icon icon="solar:check-circle-bold" className="w-4 h-4 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-[#121316] hover:bg-[#22252c] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98]"
                >
                  <span>Continue to Environment</span>
                  <Icon icon="solar:arrow-right-linear" className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: LIFESTYLE & CLIMATE */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#121316] text-[10px] font-semibold tracking-wider uppercase">
                  Step 3 of 4 • Environment & Routine
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  Your local climate & routine
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  SANA tailors recommendations to your environment and daily hydration.
                </p>
              </div>

              {/* Climate Selection */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-2 ml-0.5">
                  Primary Climate
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CLIMATES.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setClimate(c.id)}
                      className={`p-3 rounded-2xl border text-left flex items-center space-x-2.5 transition-all ${
                        climate === c.id
                          ? 'border-[#121316] bg-[#121316] text-white'
                          : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon icon={c.icon} className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-medium">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Water Goal */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-2 ml-0.5">
                  Daily Water Target
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['1.8L', '2.2L', '2.5L', '3.0L'].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWaterTarget(w)}
                      className={`py-2 px-1 rounded-xl border text-center text-xs font-semibold transition-all ${
                        waterTarget === w
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Routine */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 ml-0.5">
                  Current Daily Skincare Steps
                </label>
                <input
                  type="text"
                  value={routineHabits}
                  onChange={(e) => setRoutineHabits(e.target.value)}
                  placeholder="e.g. Gentle cleanser, Niacinamide serum, SPF 50"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAiConsultation}
                  className="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98]"
                >
                  <Icon icon="solar:sparkles-bold-duotone" className="w-4 h-4 text-amber-300" />
                  <span>Generate AI Skin Baseline</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: AI WELCOME & BASELINE ASSESSMENT */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-5 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#121316] text-white flex items-center justify-center mx-auto shadow-lg shadow-slate-900/10">
                <SanaLogoIcon size={30} color="#ffffff" />
              </div>

              <div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold tracking-wider uppercase border border-emerald-200/60">
                  AI Consultation Complete
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  Welcome aboard, {userProfile.displayName}!
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Your personalized SANA skin barrier intelligence profile is active.
                </p>
              </div>

              {/* AI Generated Assessment Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left relative overflow-hidden">
                {aiGenerating ? (
                  <div className="flex flex-col items-center justify-center py-6 space-y-3">
                    <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-xs text-slate-500 font-medium">
                      SANA is analyzing your skin profile & baseline parameters...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2 border-b border-slate-200 pb-2">
                      <Icon icon="solar:stars-minimalistic-bold-duotone" className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-[#121316]">SANA Baseline Insights</span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-normal">
                      {aiConsultationSummary}
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px]">Registered Skin Type</span>
                        <span className="font-bold text-[#121316] capitalize">{skinType}</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                        <span className="text-slate-400 block text-[10px]">Daily Water Target</span>
                        <span className="font-bold text-indigo-600">{waterTarget}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {onOpenScan && (
                  <button
                    type="button"
                    onClick={() => {
                      handleFinishOnboarding();
                      onOpenScan();
                    }}
                    disabled={loading || aiGenerating}
                    className="w-full py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-60"
                  >
                    <Icon icon="solar:scanner-bold-duotone" className="w-4 h-4 text-emerald-300" />
                    <span>Start First Baseline Facial Scan</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleFinishOnboarding}
                  disabled={loading || aiGenerating}
                  className="w-full py-3 px-4 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Enter Main Dashboard</span>
                      <Icon icon="solar:arrow-right-linear" className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="w-full max-w-lg mx-auto py-2 text-center text-[10px] text-slate-400 flex items-center justify-center space-x-2">
        <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5 text-emerald-600" />
        <span>End-to-End Encrypted Skin Barrier Profile</span>
      </div>
    </div>
  );
}
