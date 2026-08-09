import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, ChatMessage, ThinkingMeta } from '../types';
import { saveChatMessage, subscribeUserChat } from '../lib/firebase';
import { Orb } from './Orb';

interface AIAgentChatProps {
  userProfile: UserProfile | null;
  onMinimizeNavToggle: (minimize: boolean) => void;
}

export const AIAgentChat: React.FC<AIAgentChatProps> = ({
  userProfile,
  onMinimizeNavToggle
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<string>('Analyzing intent...');
  const [expandedThoughtId, setExpandedThoughtId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatId = userProfile ? `chat_${userProfile.uid}` : 'chat_default';

  // Load chat history from Firestore
  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsubscribe = subscribeUserChat(chatId, (data) => {
      if (data && data.messages && Array.isArray(data.messages)) {
        setMessages(data.messages);
      } else if (messages.length === 0) {
        // Welcome message if fresh chat
        const initialMsg: ChatMessage = {
          id: 'welcome',
          role: 'model',
          text: `Welcome, ${userProfile?.displayName ? userProfile.displayName.split(' ')[0] : 'friend'}. I am SANA, your skin health and personal wellness thinking agent. Ask me about your routine, active ingredients, or skin barrier!`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          thinkingMeta: {
            intent: 'WELCOME_INIT',
            thinkingMode: 'easy',
            complexityScore: 1,
            appliedRules: ['Fast-path greetings & initialization rule'],
            reasoningSteps: ['Phase 1: Session initialized with default welcome strategy.']
          }
        };
        setMessages([initialMsg]);
      }
    });

    return () => unsubscribe();
  }, [userProfile?.uid, chatId]);

  // Minimize pill navigation when typing / reading chat
  useEffect(() => {
    onMinimizeNavToggle(true);
    return () => {
      onMinimizeNavToggle(false);
    };
  }, [onMinimizeNavToggle]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, thinkingPhase]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    // Animated thinking phases with Orb
    setThinkingPhase('Analyzing intent & reference query...');
    const timer1 = setTimeout(() => {
      setThinkingPhase('Evaluating swift rules & complexity...');
    }, 700);
    const timer2 = setTimeout(() => {
      setThinkingPhase('Determining hard vs easy thinking strategy...');
    }, 1400);

    if (userProfile?.uid) {
      saveChatMessage(userProfile.uid, chatId, updatedMessages);
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text })),
          userProfile
        })
      });

      const data = await response.json();
      
      const modelMsg: ChatMessage = {
        id: `mod_${Date.now()}`,
        role: 'model',
        text: data.text || "I'm analyzing your request to refine your skin routine.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        thinkingMeta: data.thinkingMeta
      };

      const finalMessages = [...updatedMessages, modelMsg];
      setMessages(finalMessages);

      if (userProfile?.uid) {
        saveChatMessage(userProfile.uid, chatId, finalMessages);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: "I experienced a brief connection pause. Please try asking again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoading(false);
    }
  };

  const suggestionChips = [
    "Retinol + Vitamin C safe combination?",
    "How to repair damaged skin barrier?",
    "Evening double-cleansing AM/PM steps",
    "SPF 50 recommendation for sensitive skin"
  ];

  return (
    <div className="w-full h-full flex flex-col justify-between pt-1 pb-24 px-4 overflow-hidden relative">
      {/* Agent Header Banner with Dynamic Thinking Strategy Indicator */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-[#eaedf1] shrink-0 bg-white/60 backdrop-blur-md rounded-2xl mb-1">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-2xl bg-[#1a1c1e] text-white flex items-center justify-center shadow-xs">
            <Icon icon="solar:atom-bold-duotone" className="w-5 h-5 text-[#38bdf8]" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="text-[14.5px] font-semibold text-[#121316] tracking-tight">SANA Thinking Agent</h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                Autonomous Mode
              </span>
            </div>
            <p className="text-[10.5px] text-[#6b7280]">Intent Analysis & Dynamic Thinking Classifier Active</p>
          </div>
        </div>

        {/* Live Orb Indicator */}
        <div className="shrink-0">
          <Orb variant="B4" size={18} pill label={loading ? "Thinking..." : "Ready"} />
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-3 space-y-3.5 px-1">
        {messages.map((msg) => {
          const isModel = msg.role === 'model';
          const meta = msg.thinkingMeta;
          const isExpanded = expandedThoughtId === msg.id;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Optional Thinking Process Toggle Bar for Model Messages */}
              {isModel && meta && (
                <div className="mb-1.5 ml-1">
                  <button
                    onClick={() => setExpandedThoughtId(isExpanded ? null : msg.id)}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100/80 hover:bg-slate-200/80 text-[11px] font-medium text-slate-700 transition-all cursor-pointer border border-slate-200/60"
                  >
                    <Orb variant="B4" size={14} />
                    <span>
                      Agent Strategy: <strong className={meta.thinkingMode === 'hard' ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>{meta.thinkingMode === 'hard' ? 'Hard Thinking (Deep)' : 'Easy Going (Fast)'}</strong>
                    </span>
                    <span className="text-[10px] text-slate-400">({meta.complexityScore}/10)</span>
                    <Icon icon={isExpanded ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} className="w-3 h-3 text-slate-500 ml-1" />
                  </button>

                  {/* Expanded Thought Breakdown Box */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm max-w-[90%] space-y-2 text-xs text-slate-700 overflow-hidden"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <span className="font-bold text-slate-900 flex items-center space-x-1">
                            <Icon icon="solar:cpu-bold" className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Intent & Thinking Breakdown</span>
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            meta.thinkingMode === 'hard' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {meta.intent}
                          </span>
                        </div>

                        <div>
                          <p className="font-semibold text-slate-800 mb-0.5 text-[11px]">Applied Agent Rules:</p>
                          <ul className="list-disc list-inside text-[11px] space-y-0.5 text-slate-600">
                            {meta.appliedRules.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="font-semibold text-slate-800 mb-0.5 text-[11px]">Reasoning Execution Logs:</p>
                          <div className="space-y-1 bg-slate-50 p-2 rounded-xl text-[10.5px] font-mono text-slate-600 border border-slate-100">
                            {meta.reasoningSteps.map((step, i) => (
                              <div key={i} className="flex items-start space-x-1.5">
                                <span className="text-indigo-500 font-bold">›</span>
                                <span>{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div
                className={`max-w-[88%] p-4 rounded-[22px] text-[13.5px] leading-relaxed shadow-xs ${
                  msg.role === 'user'
                    ? 'bg-[#1a1c1e] text-white rounded-br-xs'
                    : 'bg-white border border-[#eaedf1] text-[#1e2229] rounded-bl-xs'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                <span
                  className={`text-[10px] mt-1.5 block text-right font-medium ${
                    msg.role === 'user' ? 'text-white/60' : 'text-[#8e95a2]'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Live Orb Thinking Animation Indicator */}
        {loading && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="p-3.5 rounded-[22px] bg-white border border-[#eaedf1] rounded-bl-xs flex items-center space-x-3 shadow-xs">
              <Orb variant="B4" size={22} />
              <div className="flex flex-col">
                <span className="text-[12px] font-semibold text-[#121316] flex items-center space-x-1">
                  <span>SANA AI Thinking</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping inline-block" />
                </span>
                <span className="text-[11px] text-[#6b7280] font-medium">{thinkingPhase}</span>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick Suggestion Chips */}
      {messages.length < 5 && (
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1.5 px-1 shrink-0">
          {suggestionChips.map((chip, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(chip)}
              className="px-3 py-1.5 rounded-full bg-white border border-[#e2e8f0] text-[11.5px] text-[#475569] font-medium whitespace-nowrap hover:bg-[#1a1c1e] hover:text-white transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="pt-2 px-1 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2 p-2 rounded-[24px] bg-white border border-[#eaedf1] shadow-md"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask SANA (auto-selects hard/easy thinking mode)..."
            className="flex-1 px-3 text-[13.5px] text-[#121316] bg-transparent focus:outline-none placeholder-[#94a3b8]"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="w-10 h-10 rounded-2xl bg-[#1a1c1e] text-white flex items-center justify-center disabled:opacity-40 transition-opacity cursor-pointer shadow-xs"
          >
            <Icon icon="solar:plain-2-bold" className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

