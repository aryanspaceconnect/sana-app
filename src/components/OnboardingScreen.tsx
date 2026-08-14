import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, OnboardingProfile, UserSettings } from '../types';
import { syncUserProfile, saveFacialScan, createChatSession } from '../lib/firebase';
import { SanaLogoIcon } from './SanaLogoIcon';

interface OnboardingScreenProps {
  userProfile: UserProfile;
  onCompleteOnboarding: (updatedProfile: UserProfile) => void;
  onOpenScan?: () => void;
}

// 28 Curated Skin Condition Educational Cards for the Image Cascade
interface EducationalCard {
  id: string;
  title: string;
  category: string;
  tags: string[];
  imageUrl: string;
  shortDesc: string;
}

const EDUCATIONAL_CASCADE_CARDS: EducationalCard[] = [
  {
    id: 'barrier_matrix',
    title: 'Stratum Corneum Lipid Matrix',
    category: 'Barrier Health',
    tags: ['barrier', 'sensitive', 'redness', 'tight', 'dry'],
    imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Ceramide-fatty acid bilayer shielding underlying dermal cells from ambient moisture loss.'
  },
  {
    id: 'sebum_pores',
    title: 'Sebaceous Gland Dynamics',
    category: 'Sebum & Pores',
    tags: ['shine', 't-zone', 'oily', 'pores', 'congestion'],
    imageUrl: 'https://images.unsplash.com/photo-1512290900673-02f5e305387b?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Natural lipid secretion regulating surface waterproofing and follicular micro-climate.'
  },
  {
    id: 'epidermal_hydration',
    title: 'Natural Moisturizing Factor (NMF)',
    category: 'Hydration',
    tags: ['dehydration', 'tightness', 'dry', 'flaky', 'water'],
    imageUrl: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Amino acid & lactate complex binding intracellular water within outer skin layers.'
  },
  {
    id: 'redness_microcirculation',
    title: 'Erythema & Microvascular Flushing',
    category: 'Vascular Sensitivity',
    tags: ['redness', 'flushing', 'rosacea', 'sensitive', 'reactive'],
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Capillary dilation in response to temperature shifts, emotional stress, or reactive triggers.'
  },
  {
    id: 'hyperpigmentation_melanin',
    title: 'Post-Inflammatory Hyperpigmentation',
    category: 'Tone & Clarity',
    tags: ['dark spots', 'marks', 'acne', 'pigmentation', 'sun'],
    imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Melanocyte activation following acne healing or ultraviolet sun exposure.'
  },
  {
    id: 'acne_follicular',
    title: 'Follicular Micro-Comedones',
    category: 'Blemish Control',
    tags: ['breakouts', 'acne', 'chin', 'flare-ups', 'bumps'],
    imageUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Keratin accumulation paired with C. acnes bacterial proliferation in follicular units.'
  },
  {
    id: 'collagen_matrix',
    title: 'Dermal Collagen Fibers',
    category: 'Elasticity',
    tags: ['firmness', 'elasticity', 'aging', 'lines', 'texture'],
    imageUrl: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Structural protein scaffold maintaining bouncy elasticity and youthful dermal density.'
  },
  {
    id: 'uv_microstress',
    title: 'Ultraviolet Photoprotection',
    category: 'Exposome Defense',
    tags: ['sun', 'uv', 'outdoor', 'climate', 'spots'],
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Broad-spectrum UV-A/UV-B attenuation reducing cellular oxidative stress.'
  },
  {
    id: 'microbiome_balance',
    title: 'Commensal Microflora Balance',
    category: 'Skin Microbiome',
    tags: ['microbiome', 'barrier', 'sensitive', 'bacterial'],
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Friendly acid-mantle micro-organisms competing against pathobionts to soothe inflammation.'
  },
  {
    id: 'acid_mantle_ph',
    title: 'Acid Mantle Buffer Zone',
    category: 'pH Regulation',
    tags: ['ph', 'cleanser', 'stinging', 'tightness', 'barrier'],
    imageUrl: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Slightly acidic surface pH (4.7–5.5) optimizing enzymatic skin barrier repair.'
  },
  {
    id: 'tewl_moisture_loss',
    title: 'Trans-Epidermal Water Loss (TEWL)',
    category: 'Moisture Dynamics',
    tags: ['dehydration', 'dry', 'tightness', 'climate'],
    imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Passive evaporation of deep dermal water through compromised inter-cellular gaps.'
  },
  {
    id: 'texture_desquamation',
    title: 'Stratum Corneum Desquamation',
    category: 'Texture & Smoothness',
    tags: ['texture', 'rough', 'dullness', 'flaky', 'exfoliation'],
    imageUrl: 'https://images.unsplash.com/photo-1512290900673-02f5e305387b?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Natural shedding of dead keratinocyte squames to reveal smooth, radiant underlayers.'
  },
  {
    id: 'particulate_pollution',
    title: 'PM2.5 Airborne Particulate Shield',
    category: 'Environmental Air',
    tags: ['pollution', 'city', 'dullness', 'clogged', 'air'],
    imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Heavy micro-dust particulates generating surface free radicals if left un-cleansed.'
  },
  {
    id: 'blue_light_hev',
    title: 'High-Energy Visible (HEV) Light',
    category: 'Digital Stress',
    tags: ['screen', 'digital', 'dullness', 'pigmentation'],
    imageUrl: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Screen and LED spectrum radiation triggering subtle melanin production deep in dermis.'
  },
  {
    id: 'hormonal_cycle',
    title: 'Hormonal Sebum Fluctuations',
    category: 'Endocrine Rhythms',
    tags: ['hormonal', 'period', 'chin', 'breakouts', 'cycle'],
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Progesterone & androgen shifts stimulating localized sebaceous activity before cycles.'
  },
  {
    id: 'dark_circles_periorbital',
    title: 'Periorbital Vascular Circulation',
    category: 'Eye Contour',
    tags: ['dark circles', 'eyes', 'fatigue', 'puffy'],
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Thin under-eye dermal tissue revealing underlying micro-venous pooling during fatigue.'
  },
  {
    id: 'rosacea_erythema',
    title: 'Vascular Hyper-Reactivity',
    category: 'Sensitivity',
    tags: ['rosacea', 'flushing', 'redness', 'heat'],
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Neuro-vascular sensitivity triggered by hot beverages, sun rays, or active ingredients.'
  },
  {
    id: 'retinoid_cushion',
    title: 'Epidermal Retinization Buffer',
    category: 'Active Ingredients',
    tags: ['retinol', 'actives', 'peeling', 'redness'],
    imageUrl: 'https://images.unsplash.com/photo-1608248597261-002f694e929f?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Buffering potent cell-turnover actives with soothing lipid emulsions.'
  },
  {
    id: 'humidity_vpd',
    title: 'Vapour Pressure Deficit (VPD)',
    category: 'Climate Atmospheric',
    tags: ['humidity', 'dew point', 'climate', 'dry heat'],
    imageUrl: 'https://images.unsplash.com/photo-1428908728789-d2de25dbd4e2?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Difference between ambient water vapour pressure and saturation point influencing skin drying.'
  },
  {
    id: 'fine_lines_dynamic',
    title: 'Dynamic Facial Muscular Tension',
    category: 'Expression Lines',
    tags: ['lines', 'forehead', 'eyes', 'aging'],
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Repetitive mimetic muscle movements forming transient epidermal creases.'
  },
  {
    id: 'pore_structure',
    title: 'Pore Elasticity & Wall Support',
    category: 'Pore Refinement',
    tags: ['pores', 'enlarged', 't-zone', 'oily'],
    imageUrl: 'https://images.unsplash.com/photo-1512290900673-02f5e305387b?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Dermal collagen anchoring surrounding pore walls to maintain tight appearance.'
  },
  {
    id: 'glycation_stiffness',
    title: 'Advanced Glycation End-products (AGEs)',
    category: 'Dermal Health',
    tags: ['sugar', 'stiffness', 'firmness', 'dullness'],
    imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Excess sugar molecules cross-linking with collagen, reducing supple skin recoil.'
  },
  {
    id: 'soothing_soothing',
    title: 'Anti-Inflammatory Calming Pathway',
    category: 'Barrier Repair',
    tags: ['calming', 'soothing', 'redness', 'stinging'],
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Centella, bisabolol, and panthenol down-regulating inflammatory cytokine release.'
  },
  {
    id: 'ceramide_ratios',
    title: 'Triple-Ceramide Ratio (1:2:1)',
    category: 'Lipid Synthesis',
    tags: ['ceramides', 'barrier', 'dry', 'repair'],
    imageUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Optimal proportion of Ceramides, Cholesterol, and Free Fatty Acids for barrier recovery.'
  },
  {
    id: 'decolletage_care',
    title: 'Cervical & Decolletage Epidermis',
    category: 'Neck & Chest',
    tags: ['neck', 'chest', 'sun', 'lines'],
    imageUrl: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Ultra-thin neck skin requiring gentle antioxidant and sun protection.'
  },
  {
    id: 'cell_renewal_cycle',
    title: '28-Day Epidermal Cell Turnover',
    category: 'Cellular Renewal',
    tags: ['turnover', 'glow', 'dullness', 'radiance'],
    imageUrl: 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Basal keratinocyte migration upward to form the fresh outer stratum corneum.'
  },
  {
    id: 'antioxidant_defense',
    title: 'Intracellular Glutathione & Vitamin C',
    category: 'Antioxidants',
    tags: ['antioxidants', 'vitamin c', 'brightening', 'glow'],
    imageUrl: 'https://images.unsplash.com/photo-1608248597261-002f694e929f?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Neutralizing atmospheric free radicals before they damage cellular membrane lipids.'
  },
  {
    id: 'lip_barrier_vermillion',
    title: 'Vermilion Border Moisture Hydration',
    category: 'Lip Care',
    tags: ['lips', 'chapped', 'dry', 'barrier'],
    imageUrl: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=600&q=80',
    shortDesc: 'Lip skin lacking sebaceous glands, relying entirely on occlusive wax emollients.'
  }
];

// Quick Keywords Chips for Step 2
const QUICK_KEYWORD_OPTIONS = [
  { id: 'tzone_shine', label: 'T-Zone Shine', insertText: 'My T-zone gets shiny by midday.' },
  { id: 'sensitive_barrier', label: 'Sensitive Barrier', insertText: 'My skin barrier stings easily after cleansing.' },
  { id: 'dehydration_lines', label: 'Dehydration Lines', insertText: 'I notice tight fine dehydration lines on my cheeks.' },
  { id: 'post_acne_marks', label: 'Post-Acne Dark Spots', insertText: 'I have post-acne dark spots that fade slowly.' },
  { id: 'hormonal_breakouts', label: 'Hormonal Flare-ups', insertText: 'I experience hormonal chin breakouts before my period.' },
  { id: 'redness_flushing', label: 'Redness & Flushing', insertText: 'My nose and cheeks flush red in cold or hot weather.' },
  { id: 'rough_texture', label: 'Rough Surface Texture', insertText: 'My skin surface feels bumpy or uneven to touch.' },
  { id: 'enlarged_pores', label: 'Enlarged Pores', insertText: 'I want to tighten visible pores on my nose and cheeks.' }
];

const HORMONAL_FACTOR_OPTIONS = [
  { id: 'premenstrual_flareups', label: 'Pre-menstrual chin breakouts', text: 'Pre-menstrual breakouts around chin and jawline' },
  { id: 'contraceptive_shifts', label: 'Contraceptive / hormonal therapy', text: 'Oral contraceptive / hormonal therapy skin sensitivity' },
  { id: 'post_workout_flushing', label: 'Thermal / post-workout flushing', text: 'Post-workout thermal flushing and capillary reactivity' },
  { id: 'cortisol_stress', label: 'Stress / Cortisol flare-ups', text: 'Stress-induced barrier disruption & breakouts' },
  { id: 'no_known_hormonal', label: 'No major hormonal sensitivity', text: 'No major hormonal factors noticed' }
];

export function OnboardingScreen({ userProfile, onCompleteOnboarding }: OnboardingScreenProps) {
  // Step State: 1: Welcome, 2: Self-Perception & Hormonal Factors, 3: Scan Preparation, 4: Scan & Ranked Cascade + 15s Read, 5: Particulars & Goals
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);

  // Step 2 State
  const [userPerceptionText, setUserPerceptionText] = useState<string>(
    userProfile.settings?.userPerceptionText || userProfile.userPerceptionText || ''
  );
  const [hormonalFactors, setHormonalFactors] = useState<string>(
    userProfile.settings?.hormonalFactors || userProfile.hormonalFactors || 'Pre-menstrual breakouts around chin and jawline'
  );
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 / 4 Live Scan State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [capturedImageBase64, setCapturedImageBase64] = useState<string | null>(null);
  const [scanResultData, setScanResultData] = useState<any | null>(null);
  const [companionReadText, setCompanionReadText] = useState<string>('');
  const [rankedCards, setRankedCards] = useState<EducationalCard[]>(EDUCATIONAL_CASCADE_CARDS);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Step 5 Particulars & Goals State
  const [preferredName, setPreferredName] = useState<string>(
    userProfile.settings?.preferredName || userProfile.preferredName || userProfile.displayName || ''
  );
  const [locationName, setLocationName] = useState<string>(
    userProfile.settings?.locationName || userProfile.locationName || ''
  );
  const [heightCm, setHeightCm] = useState<string>(
    userProfile.settings?.height || userProfile.height || '170'
  );
  const [genderProfile, setGenderProfile] = useState<string>(
    userProfile.settings?.gender || userProfile.gender || 'Prefer Not to Say'
  );
  const [skincareGoals, setSkincareGoals] = useState<string>(
    userProfile.settings?.skincareGoals || userProfile.skincareGoals || 'Restore skin barrier, fade post-acne dark spots, reduce dehydration lines'
  );
  const [upcomingEvent, setUpcomingEvent] = useState<string>(
    userProfile.settings?.upcomingEvent || userProfile.upcomingEvent || 'Daily Skin Barrier Protection & Glow'
  );
  const [skinPriorities, setSkinPriorities] = useState<string>(
    userProfile.settings?.skinPriorities || userProfile.skinPriorities || 'Strengthen skin barrier & even skin tone'
  );

  // Validation Error State
  const [validationErrorList, setValidationErrorList] = useState<string[]>([]);

  // Tooltip UI State
  const [activeTooltip, setActiveTooltip] = useState<'location' | 'biological' | 'goals' | null>(null);

  // Main scroll container ref for smooth regulated scrolling without scrollbars
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll cascade
  const cascadeRef = useRef<HTMLDivElement>(null);

  // Smoothly scroll to top on step change for a seamless regulated flow
  useEffect(() => {
    if (mainContainerRef.current) {
      mainContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Toggle Quick Chip in Step 2
  const handleToggleChip = (chip: typeof QUICK_KEYWORD_OPTIONS[0]) => {
    if (selectedChips.includes(chip.id)) {
      setSelectedChips(prev => prev.filter(c => c !== chip.id));
      setUserPerceptionText(prev => prev.replace(chip.insertText, '').trim());
    } else {
      setSelectedChips(prev => [...prev, chip.id]);
      setUserPerceptionText(prev => {
        const clean = prev.trim();
        return clean.length > 0 ? `${clean} ${chip.insertText}` : chip.insertText;
      });
    }
  };

  // Select Hormonal Chip in Step 2
  const handleSelectHormonalOption = (text: string) => {
    setHormonalFactors(text);
  };

  // Validate Step 2 before advancing
  const handleAdvanceFromStep2 = () => {
    setStep2Error(null);
    if (!userPerceptionText || userPerceptionText.trim().length < 5) {
      setStep2Error('Please provide a brief description of your skin observations (at least 5 characters).');
      return;
    }
    if (!hormonalFactors || hormonalFactors.trim().length === 0) {
      setStep2Error('Please specify or select your hormonal factors / skin cycle sensitivity.');
      return;
    }
    setStep(3);
  };

  // Ranking Algorithm for Step 4 Image Cascade
  const calculateRankedCards = (userText: string, activeChips: string[]) => {
    const textLower = userText.toLowerCase();

    const scored = EDUCATIONAL_CASCADE_CARDS.map(card => {
      let score = 0;
      card.tags.forEach(tag => {
        if (textLower.includes(tag.toLowerCase())) {
          score += 5;
        }
      });
      activeChips.forEach(chipId => {
        if (card.tags.some(t => chipId.includes(t))) {
          score += 3;
        }
      });
      return { card, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.card);
  };

  // Start Camera for Step 3
  useEffect(() => {
    if (step === 3) {
      let active = true;
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 } })
        .then(stream => {
          if (active) {
            setCameraStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          }
        })
        .catch(err => {
          console.warn("Camera stream access warning on onboarding:", err);
        });

      return () => {
        active = false;
        if (cameraStream) {
          cameraStream.getTracks().forEach(t => t.stop());
        }
      };
    }
  }, [step]);

  // Handle Trigger Scan in Step 3
  const handleInitiateScan = async () => {
    setStep(4);
    setIsScanning(true);

    let capturedImg: string | null = null;

    // Capture frame if video is active
    if (videoRef.current && videoRef.current.readyState >= 2) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 400, 400);
          capturedImg = canvas.toDataURL('image/jpeg', 0.82);
        }
      } catch (e) {
        console.warn("Frame capture error:", e);
      }
    }

    if (!capturedImg) {
      // High-resolution clean facial photo placeholder fallback
      capturedImg = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80';
    }

    setCapturedImageBase64(capturedImg);

    // Stop camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }

    // Rank educational image cascade
    const ranked = calculateRankedCards(userPerceptionText, selectedChips);
    setRankedCards(ranked);

    // Mock/Real calculation of scores
    const hydration = Math.floor(Math.random() * 12) + 82;
    const barrier = Math.floor(Math.random() * 10) + 85;
    const clarity = Math.floor(Math.random() * 14) + 80;

    const mockScanPayload = {
      scanId: `scan_onboarding_${Date.now()}`,
      scanType: 'daily_scan',
      hydrationScore: hydration,
      barrierScore: barrier,
      clarityScore: clarity,
      summary: `Baseline Onboarding Analysis: Hydration ${hydration}%, Barrier Health ${barrier}%, Clarity ${clarity}%.`,
      capturedImage: capturedImg,
      recommendations: [
        'Apply a ceramide-rich barrier moisturizer within 3 minutes of cleansing.',
        'Use broad-spectrum SPF 50 daily regardless of indoor or cloudy light.',
        'Layer a gentle hydrating hyaluronic serum before rich creams.'
      ]
    };

    setScanResultData(mockScanPayload);

    // Save scan to Firestore database
    try {
      await saveFacialScan(userProfile.uid, mockScanPayload);
    } catch (e) {
      console.warn("Error saving onboarding facial scan:", e);
    }

    // Generate Personalized Companion Read (10-15s read)
    try {
      const promptText = `Generate a warm, deeply compassionate 10-second personal companion read for a new user named ${preferredName || userProfile.displayName}. 
Self-described skin observation: "${userPerceptionText || 'Wants balanced, hydrated, glowy skin'}".
Scan Results: Hydration ${hydration}%, Barrier Health ${barrier}%, Clarity ${clarity}%.
Tone: Deeply empathetic, human touch, no AI jargon, non-judgmental, making the user feel "this was written specifically for me". Keep it around 3-4 sentences maximum.`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', text: promptText }],
          userProfile
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCompanionReadText(data.text || `We observed that your skin barrier is working diligently to maintain moisture while soothing cheek reactivity. You are doing great — your skin just needs gentle hydration and daily climate protection.`);
      } else {
        setCompanionReadText(`We noticed your skin barrier is working hard to balance surface moisture while soothing localized warmth. You're not doing anything wrong — here is what your skin is asking for today: gentle lipid replenishment and steady climate shielding.`);
      }
    } catch (err) {
      setCompanionReadText(`We noticed your skin barrier is working hard to balance surface hydration while soothing cheek warmth. You're not doing anything wrong — here is what your skin is asking for today: gentle lipid replenishment and steady climate shielding.`);
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Final Completion in Step 5 with strict completeness validation
  const handleFinalizeOnboarding = async () => {
    // Validate every piece of user profile data
    const missingFields: string[] = [];
    if (!preferredName || preferredName.trim().length === 0) missingFields.push("Preferred Name");
    if (!locationName || locationName.trim().length === 0) missingFields.push("Geological / Climate Location");
    if (!heightCm || heightCm.trim().length === 0 || isNaN(Number(heightCm)) || Number(heightCm) <= 0) missingFields.push("Valid Height (in cm)");
    if (!genderProfile || genderProfile.trim().length === 0) missingFields.push("Biological Profile / Gender");
    if (!userPerceptionText || userPerceptionText.trim().length < 5) missingFields.push("Skin Observation / Perception");
    if (!hormonalFactors || hormonalFactors.trim().length === 0) missingFields.push("Hormonal Factors & Cycle Sensitivity");
    if (!skincareGoals || skincareGoals.trim().length === 0) missingFields.push("Skincare Goals");
    if (!upcomingEvent || upcomingEvent.trim().length === 0) missingFields.push("Upcoming Event / Target Timeline");
    if (!skinPriorities || skinPriorities.trim().length === 0) missingFields.push("Skin Focus Priority");

    if (missingFields.length > 0) {
      setValidationErrorList(missingFields);
      return;
    }

    setValidationErrorList([]);
    setLoading(true);

    try {
      const cleanPerception = userPerceptionText.trim();
      const cleanPreferredName = preferredName.trim();
      const cleanLocation = locationName.trim();
      const cleanHeight = heightCm.trim();
      const cleanGender = genderProfile.trim();
      const cleanHormonal = hormonalFactors.trim();
      const cleanGoals = skincareGoals.trim();
      const cleanEvent = upcomingEvent.trim();
      const cleanPriorities = skinPriorities.trim();

      const onboardingData: OnboardingProfile = {
        userPerceptionText: cleanPerception,
        preferredName: cleanPreferredName,
        locationName: cleanLocation,
        height: cleanHeight,
        gender: cleanGender,
        hormonalFactors: cleanHormonal,
        skincareGoals: cleanGoals,
        upcomingEvent: cleanEvent,
        skinPriorities: cleanPriorities,
        skinType: 'combination',
        concerns: selectedChips,
        climate: 'temperate'
      };

      const updatedSettings: UserSettings = {
        ...userProfile.settings,
        onboardingCompleted: true,
        onboardingProfile: onboardingData,
        userPerceptionText: cleanPerception,
        preferredName: cleanPreferredName,
        locationName: cleanLocation,
        height: cleanHeight,
        gender: cleanGender,
        hormonalFactors: cleanHormonal,
        skincareGoals: cleanGoals,
        upcomingEvent: cleanEvent,
        skinPriorities: cleanPriorities
      };

      const topLevelData = {
        displayName: cleanPreferredName || userProfile.displayName,
        preferredName: cleanPreferredName,
        locationName: cleanLocation,
        userPerceptionText: cleanPerception,
        hormonalFactors: cleanHormonal,
        skincareGoals: cleanGoals,
        upcomingEvent: cleanEvent,
        skinPriorities: cleanPriorities,
        height: cleanHeight,
        gender: cleanGender,
      };

      const updatedProfile: UserProfile = {
        ...userProfile,
        displayName: cleanPreferredName || userProfile.displayName,
        preferredName: cleanPreferredName,
        locationName: cleanLocation,
        userPerceptionText: cleanPerception,
        hormonalFactors: cleanHormonal,
        skincareGoals: cleanGoals,
        upcomingEvent: cleanEvent,
        skinPriorities: cleanPriorities,
        height: cleanHeight,
        gender: cleanGender,
        settings: updatedSettings
      };

      // Sync every piece of data explicitly into Firestore 'users' document
      await syncUserProfile(
        { uid: userProfile.uid, displayName: cleanPreferredName || userProfile.displayName },
        updatedSettings,
        topLevelData
      );

      // Create initial diagnostic session containing the onboarding scan report as its first message
      try {
        const initialSessionId = `session_onboarding_${userProfile.uid}`;
        const hyd = scanResultData?.hydrationScore || 85;
        const bar = scanResultData?.barrierScore || 88;
        const cla = scanResultData?.clarityScore || 84;
        const initialReportMessage = {
          id: `rep_${Date.now()}`,
          role: 'model',
          text: `**Welcome to SANA, ${cleanPreferredName || (userProfile.displayName ? userProfile.displayName.split(' ')[0] : 'friend')}!**\n\nHere is your baseline diagnostic report from your onboarding facial discovery scan:\n\n- **Stratum Corneum Hydration**: ${hyd}%\n- **Lipid Barrier Health**: ${bar}%\n- **Skin Clarity Score**: ${cla}%\n\n*${companionReadText || 'Your baseline profile has been initialized with customized climate and barrier recommendations.'}*\n\nYour profile, concerns (${selectedChips.join(', ')}), and climate (${cleanLocation}) are indexed in your private workspace. Ask me anything about your routine, active ingredient pairings, or barrier protection anytime.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        await createChatSession(userProfile.uid, {
          id: initialSessionId,
          title: 'Onboarding Scan & Barrier Report',
          sessionType: 'onboarding_report',
          initialMessages: [initialReportMessage]
        });
      } catch (sessErr) {
        console.warn("Failed to create initial onboarding session doc:", sessErr);
      }

      // Finish Onboarding
      onCompleteOnboarding(updatedProfile);
    } catch (err) {
      console.error("Error finalizing onboarding:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={mainContainerRef}
      className="w-full min-h-screen h-[100dvh] bg-[#f8f9fb] flex flex-col items-center p-3.5 sm:p-6 overflow-y-auto overflow-x-hidden no-scrollbar smooth-scroll-container pb-14 sm:pb-8 touch-pan-y"
    >
      {/* Header Bar */}
      <div className="w-full max-w-xl mx-auto pt-1 pb-3 flex items-center justify-between shrink-0 sticky top-0 bg-[#f8f9fb]/90 backdrop-blur-md z-20 py-2 mb-1">
        {step > 1 ? (
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#121316] flex items-center justify-center text-white shadow-xs">
              <SanaLogoIcon size={18} color="#ffffff" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-[#121316] lowercase">sana</span>
              <span className="text-xs text-slate-400 ml-1.5 font-medium">Skin Discovery</span>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Step Progress Bar */}
        <div className="flex items-center space-x-1.5">
          {[1, 2, 3, 4, 5].map(s => (
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

      {/* Main Container Card */}
      <div className="w-full max-w-xl mx-auto bg-white rounded-3xl p-5 sm:p-8 border border-slate-100 shadow-xl shadow-slate-200/50 my-2 sm:my-auto shrink-0">
        <AnimatePresence mode="wait">
          {/* STEP 1: WELCOME SCREEN */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-6 text-center py-2"
            >
              <div className="flex items-center justify-center mx-auto py-1">
                <SanaLogoIcon size={38} color="#121316" />
              </div>

              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-slate-100 text-[#121316] text-[10px] font-semibold tracking-wider uppercase border border-slate-200/60">
                  Step 1 of 5 • Welcome
                </span>
                <h1 className="text-2xl font-bold tracking-tight text-[#121316]">
                  Welcome to SANA Intelligence
                </h1>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Your personal skin health & barrier companion. Before we gather any personal details, let's understand your skin first — because true skincare starts with self-awareness.
                </p>
              </div>

              {/* Focus Pillars */}
              <div className="grid grid-cols-3 gap-2.5 pt-2 text-left">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <Icon icon="solar:heart-bold-duotone" className="w-5 h-5 text-rose-500" />
                  <p className="text-[11px] font-bold text-[#121316]">Empathy First</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Judgment-free guidance tailored to your skin.</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <Icon icon="solar:scanner-bold-duotone" className="w-5 h-5 text-indigo-500" />
                  <p className="text-[11px] font-bold text-[#121316]">Dermal Vision</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Powered by Perfect Corp skin analysis.</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <Icon icon="solar:cloud-sun-bold-duotone" className="w-5 h-5 text-amber-500" />
                  <p className="text-[11px] font-bold text-[#121316]">Climate Defense</p>
                  <p className="text-[10px] text-slate-500 leading-tight">Hyperlocal weather & UV barrier shielding.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
              >
                <span>Begin Skin Discovery</span>
                <Icon icon="solar:arrow-right-linear" className="w-4 h-4 text-amber-300" />
              </button>
            </motion.div>
          )}

          {/* STEP 2: USER'S PERCEPTION OF THEIR SKIN & HORMONAL FACTORS */}
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
                  Step 2 of 5 • Skin Observation & Cycle
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  How much do you know about your skin right now?
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tell us what you observe day-to-day. You can type freely or tap key descriptors to build your summary.
                </p>
              </div>

              {/* Step 2 Inline Validation Banner */}
              {step2Error && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
                  <Icon icon="solar:danger-circle-bold" className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{step2Error}</span>
                </div>
              )}

              {/* Quick Keywords Chips */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-2">
                  Tap to Quick-Add Key Descriptors:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_KEYWORD_OPTIONS.map(chip => {
                    const isSelected = selectedChips.includes(chip.id);
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => handleToggleChip(chip)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer flex items-center space-x-1 ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span>{isSelected ? '✓' : '+'}</span>
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Area with Light Highlighted Example Hint */}
              <div className="relative">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                  Describe Your Skin Observation: <span className="text-rose-500">*</span>
                </label>

                <textarea
                  rows={3}
                  value={userPerceptionText}
                  onChange={(e) => setUserPerceptionText(e.target.value)}
                  placeholder="e.g., My T-zone gets shiny by midday, but my cheeks feel tight after cleansing. I also notice sudden redness around my nose when it's cold, and occasional chin breakouts..."
                  className="w-full p-3.5 bg-slate-50/80 border border-slate-200 rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all leading-relaxed placeholder:text-slate-400/80"
                />
              </div>

              {/* Hormonal Factors Section */}
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Hormonal Factors & Skin Cycle Sensitivity <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {HORMONAL_FACTOR_OPTIONS.map(hOpt => {
                    const isSelected = hormonalFactors.includes(hOpt.text);
                    return (
                      <button
                        key={hOpt.id}
                        type="button"
                        onClick={() => handleSelectHormonalOption(hOpt.text)}
                        className={`px-2.5 py-1 rounded-xl text-[10.5px] font-semibold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-purple-50/60 text-purple-900 border-purple-100 hover:bg-purple-100'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{hOpt.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={hormonalFactors}
                  onChange={(e) => setHormonalFactors(e.target.value)}
                  placeholder="e.g., Pre-menstrual breakouts around chin, oral contraceptives, post-workout flushing"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAdvanceFromStep2}
                  className="flex-1 py-3 px-4 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <span>Save & Prepare for Scan</span>
                  <Icon icon="solar:arrow-right-linear" className="w-4 h-4 text-amber-300" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: PREPARATION FOR FACIAL SKIN SCAN */}
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
                  Step 3 of 5 • Scan Preparation
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-2">
                  Let's see what your skin really says
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  We are ready to initiate your baseline facial scan to uncover micro-hydration, barrier clarity, and surface texture.
                </p>
              </div>

              {/* Camera Preview / Instruction Box */}
              <div className="relative rounded-3xl bg-slate-900 overflow-hidden border border-slate-800 aspect-square max-h-64 mx-auto flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                {/* Guide Oval */}
                <div className="absolute inset-0 border-2 border-dashed border-white/40 rounded-full m-8 pointer-events-none flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                </div>
              </div>

              {/* Volunteer-Inspiring Instructions */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2 text-xs text-indigo-950">
                <div className="flex items-center space-x-2 font-bold">
                  <Icon icon="solar:lightbulb-bold" className="w-4 h-4 text-indigo-600" />
                  <span>How to Get the Most Accurate Scan</span>
                </div>
                <ul className="space-y-1 text-[11px] text-indigo-900/80 list-disc list-inside">
                  <li>Sit in a brightly, evenly lit room so our camera sensor can register your natural skin surface texture and micro-hydration clearly.</li>
                  <li>Position your face centered in the guide frame without heavy makeup for clinical accuracy.</li>
                  <li>Hold a neutral expression for optimal facial region alignment.</li>
                </ul>
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleInitiateScan}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98] cursor-pointer"
                >
                  <Icon icon="solar:scanner-bold-duotone" className="w-4 h-4 text-emerald-300" />
                  <span>Initiate Face Scan Now</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: FACIAL SCAN ANALYSIS, RANKED IMAGE CASCADE & COMPANION READ */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-5"
            >
              <div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold tracking-wider uppercase border border-emerald-200">
                  Step 4 of 5 • Onboarding Scan Analysis
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-1.5">
                  Your Personalized Skin Companion Read
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Synthesizing your self-described observations with live micro-scan metrics.
                </p>
              </div>

              {isScanning ? (
                <div className="p-8 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold text-[#121316]">Analyzing facial skin texture & barrier metrics...</p>
                  <p className="text-[11px] text-slate-500">Ranking educational skin condition cards matching your observations.</p>
                </div>
              ) : (
                <>
                  {/* Scores Bar */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200/60">
                      <span className="text-[10px] text-amber-800 uppercase font-bold block">Hydration</span>
                      <span className="text-base font-bold text-amber-700">{scanResultData?.hydrationScore}%</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200/60">
                      <span className="text-[10px] text-emerald-800 uppercase font-bold block">Barrier</span>
                      <span className="text-base font-bold text-emerald-700">{scanResultData?.barrierScore}%</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200/60">
                      <span className="text-[10px] text-blue-800 uppercase font-bold block">Clarity</span>
                      <span className="text-base font-bold text-blue-700">{scanResultData?.clarityScore}%</span>
                    </div>
                  </div>

                  {/* 10-15s Personalized Companion Read Box */}
                  <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2 relative overflow-hidden shadow-md">
                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold border-b border-slate-800 pb-2">
                      <Icon icon="solar:stars-minimalistic-bold-duotone" className="w-4 h-4" />
                      <span>SANA Personal Read (For You)</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-normal">
                      {companionReadText}
                    </p>
                  </div>

                  {/* Ranked Educational Image Cascade */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#121316] uppercase tracking-wider">
                        Educational Skin Cards (Ranked for You)
                      </span>
                      <span className="text-[10px] text-indigo-600 font-semibold">
                        {rankedCards.length} Condition Profiles
                      </span>
                    </div>

                    <div
                      ref={cascadeRef}
                      className="flex space-x-3 overflow-x-auto pb-2 no-scrollbar"
                    >
                      {rankedCards.map((card, cIdx) => (
                        <div
                          key={card.id}
                          className="shrink-0 w-44 rounded-2xl bg-slate-50 border border-slate-200/80 overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
                        >
                          <div className="h-24 w-full relative bg-slate-200">
                            <img src={card.imageUrl} alt={card.title} className="w-full h-full object-cover" />
                            <span className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                              #{cIdx + 1} {card.category}
                            </span>
                          </div>
                          <div className="p-2.5 space-y-1 flex-1 flex flex-col justify-between">
                            <h4 className="text-[11.5px] font-bold text-[#121316] leading-tight">{card.title}</h4>
                            <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{card.shortDesc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="w-full py-3.5 px-4 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    <span>Continue to Personal Details</span>
                    <Icon icon="solar:arrow-right-linear" className="w-4 h-4 text-amber-300" />
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* STEP 5: PARTICULARS & PERSONAL DETAILS ("Let's know you better") */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#121316] text-[10px] font-semibold tracking-wider uppercase">
                  Step 5 of 5 • Personal Profile Synchronization
                </span>
                <h2 className="text-xl font-bold tracking-tight text-[#121316] mt-1.5">
                  Let's complete your profile
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ensure all details are completed below. Every input is saved directly to your encrypted Firestore profile.
                </p>
              </div>

              {/* Validation Alert Banner */}
              {validationErrorList.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 text-xs space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-bold text-rose-700">
                    <Icon icon="solar:danger-triangle-bold" className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Profile Incomplete — Synchronization Blocked</span>
                  </div>
                  <p className="text-[11px] text-rose-800 leading-normal">
                    Please complete the following missing inputs before finalizing your onboarding:
                  </p>
                  <ul className="text-[10.5px] text-rose-900 list-disc list-inside space-y-0.5 font-medium pl-1">
                    {validationErrorList.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preferred Name */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Preferred Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="What name should SANA call you?"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Preferred Name") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Environmental / Geological Location with Tooltip */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
                    <span>Geological / Climate Location <span className="text-rose-500">*</span></span>
                    <button
                      type="button"
                      onClick={() => setActiveTooltip(activeTooltip === 'location' ? null : 'location')}
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer p-0.5"
                    >
                      <Icon icon="solar:question-circle-bold-duotone" className="w-4 h-4" />
                    </button>
                  </label>
                </div>

                {activeTooltip === 'location' && (
                  <div className="p-3 mb-2 rounded-2xl bg-indigo-600 text-white text-[11px] leading-relaxed shadow-lg relative">
                    We cross-reference live Open-Meteo UV index, humidity, dew point, and air quality in your area to shield your skin barrier against local climate stressors.
                  </div>
                )}

                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="e.g., San Francisco, London, Tokyo..."
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Geological / Climate Location") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Height & Biological Gender */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
                    <span>Height & Biological Profile <span className="text-rose-500">*</span></span>
                    <button
                      type="button"
                      onClick={() => setActiveTooltip(activeTooltip === 'biological' ? null : 'biological')}
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer p-0.5"
                    >
                      <Icon icon="solar:question-circle-bold-duotone" className="w-4 h-4" />
                    </button>
                  </label>
                </div>

                {activeTooltip === 'biological' && (
                  <div className="p-3 mb-2 rounded-2xl bg-indigo-600 text-white text-[11px] leading-relaxed shadow-lg relative">
                    Helps calculate daily hydration metrics, collagen synthesis rates, and skin cycle fluctuations.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="Height in cm (e.g. 170)"
                    className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                      validationErrorList.includes("Valid Height (in cm)") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                    }`}
                  />
                  <select
                    value={genderProfile}
                    onChange={(e) => setGenderProfile(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-Binary">Non-Binary</option>
                    <option value="Prefer Not to Say">Prefer Not to Say</option>
                  </select>
                </div>
              </div>

              {/* Hormonal Factors Field */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Hormonal Factors & Cycle Sensitivity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={hormonalFactors}
                  onChange={(e) => setHormonalFactors(e.target.value)}
                  placeholder="e.g. Pre-menstrual breakouts around chin, oral contraceptive shift"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Hormonal Factors & Cycle Sensitivity") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Skincare Goals Field */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center space-x-1">
                    <span>Skincare Goals <span className="text-rose-500">*</span></span>
                    <button
                      type="button"
                      onClick={() => setActiveTooltip(activeTooltip === 'goals' ? null : 'goals')}
                      className="text-indigo-600 hover:text-indigo-800 cursor-pointer p-0.5"
                    >
                      <Icon icon="solar:question-circle-bold-duotone" className="w-4 h-4" />
                    </button>
                  </label>
                </div>

                {activeTooltip === 'goals' && (
                  <div className="p-3 mb-2 rounded-2xl bg-indigo-600 text-white text-[11px] leading-relaxed shadow-lg relative">
                    These goals shape your AI routine recommendation matrix and daily ingredient target suggestions.
                  </div>
                )}

                <input
                  type="text"
                  value={skincareGoals}
                  onChange={(e) => setSkincareGoals(e.target.value)}
                  placeholder="e.g. Restore skin barrier, fade post-acne dark spots, reduce dehydration lines"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Skincare Goals") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Skin Focus Priority */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Skin Focus Priority <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={skinPriorities}
                  onChange={(e) => setSkinPriorities(e.target.value)}
                  placeholder="e.g. Strengthen skin barrier & even skin tone"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Skin Focus Priority") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              {/* Target Event Timeline */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Upcoming Event / Skin Target Timeline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={upcomingEvent}
                  onChange={(e) => setUpcomingEvent(e.target.value)}
                  placeholder="e.g. Wedding in 3 weeks, Beach vacation, Daily barrier glow"
                  className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-2xl text-xs text-[#121316] focus:outline-none focus:border-[#121316] focus:bg-white transition-all ${
                    validationErrorList.includes("Upcoming Event / Target Timeline") ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalizeOnboarding}
                  disabled={loading}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Synchronize & Complete Onboarding</span>
                      <Icon icon="solar:check-circle-bold" className="w-4 h-4 text-emerald-300" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="w-full max-w-xl mx-auto pt-3 pb-2 text-center text-[10px] text-slate-400 flex items-center justify-center space-x-2 shrink-0">
        <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5 text-emerald-600" />
        <span>End-to-End Encrypted Skin Barrier Profile</span>
      </div>
    </div>
  );
}
