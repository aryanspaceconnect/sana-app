import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, ChatMessage } from '../types';
import { saveChatMessage, subscribeUserChat } from '../lib/firebase';
import { loadAgentVault, VaultNote, VaultDocument } from '../agent/agentVault';
import { AgentMemoryService } from '../services/AgentMemoryService';
import { Orb } from './Orb';
import { ApprovalCard } from './ApprovalCard';

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
  const [thinkingPhase, setThinkingPhase] = useState<string>('SANA is analyzing...');
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  // Agent Vault state
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const userId = userProfile?.uid || 'guest_user';
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
          text: `Welcome, ${userProfile?.displayName ? userProfile.displayName.split(' ')[0] : 'friend'}. I am SANA, your multi-step skin health & wellness agent equipped with an **Isolated Agent Memory Vault**. Ask me to analyze ingredients, schedule routines, store skin memories, or index uploaded documents.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          thinkingMeta: {
            intent: 'WELCOME_INIT',
            thinkingMode: 'easy',
            complexityScore: 1,
            appliedRules: ['SanaAgent Multi-step PassOn initialization', 'Isolated Agent Vault Active'],
            reasoningSteps: ['Session initialized with SanaAgent runtime harness and user-isolated vault.']
          }
        };
        setMessages([initialMsg]);
      }
    });

    return () => unsubscribe();
  }, [userProfile?.uid, chatId]);

  // Load user's Agent Vault data
  const refreshVault = async () => {
    const vault = await loadAgentVault(userId);
    setVaultNotes(vault.notes || []);
    setVaultDocs(vault.documents || []);
  };

  useEffect(() => {
    refreshVault();
  }, [userId]);

  // Handle file uploads into Agent Vault
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const textContent = event.target?.result as string || '';
      const promptText = `I am uploading a document for my Agent Memory Vault: "${file.name}". Please ingest this into my vault:\n\n${textContent.substring(0, 3000)}`;

      handleSendMessage(promptText);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

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

    // Animated thinking phases for multi-step loop
    setThinkingPhase('Planner Step: Generating PassOn Protocol...');
    const timer1 = setTimeout(() => {
      setThinkingPhase('Context Step: Loading requested workspace memory layers...');
    }, 800);
    const timer2 = setTimeout(() => {
      setThinkingPhase('Execution Step: Running tool calls & evaluating guardrails...');
    }, 1600);

    if (userProfile?.uid) {
      saveChatMessage(userProfile.uid, chatId, updatedMessages);
    }

    try {
      const response = await fetch('/api/sana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userProfile?.uid || 'guest_user',
          message: text.trim(),
          sessionId,
          history: updatedMessages.map(m => ({ role: m.role, text: m.text }))
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const lastPassOn = data.passOnTrace && data.passOnTrace.length > 0
        ? data.passOnTrace[data.passOnTrace.length - 1]
        : null;

      const modelMsg: ChatMessage = {
        id: `mod_${Date.now()}`,
        role: 'model',
        text: data.text || "I am processing your skincare query with SanaAgent.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionProposal: data.actionProposal,
        passOnTrace: data.passOnTrace,
        sessionId: data.sessionId,
        thinkingMeta: {
          intent: lastPassOn?.intent || 'AGENT_LOOP',
          thinkingMode: (data.iterations && data.iterations > 1) ? 'hard' : 'easy',
          complexityScore: data.iterations ? Math.min(10, data.iterations * 3) : 3,
          appliedRules: ['SanaAgent PassOn Protocol', 'Grok Build Runtime Harness'],
          reasoningSteps: data.passOnTrace
            ? data.passOnTrace.map((p: any, idx: number) => `Iteration ${idx + 1} [${p.intent}]: ${p.thought}`)
            : ['Executed SanaAgent PassOn loop']
        }
      };

      const finalMessages = [...updatedMessages, modelMsg];
      setMessages(finalMessages);

      if (userProfile?.uid) {
        saveChatMessage(userProfile.uid, chatId, finalMessages);
        AgentMemoryService.saveChatSession(userProfile.uid, chatId, finalMessages);
      }
    } catch (err) {
      console.error('SanaAgent Chat error:', err);

      const fallbackText = "I encountered a transient network connection error. For your skin safety, always maintain hydrated skin barrier repair and apply SPF 50 daily.";
      const errorMsg: ChatMessage = {
        id: `fallback_${Date.now()}`,
        role: 'model',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);

      if (userProfile?.uid) {
        saveChatMessage(userProfile.uid, chatId, finalMessages);
        AgentMemoryService.saveChatSession(userProfile.uid, chatId, finalMessages);
      }
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
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-2 space-y-3.5 px-1">
        {messages.map((msg) => {
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] p-4 rounded-[22px] text-[13.5px] leading-relaxed shadow-xs ${
                  msg.role === 'user'
                    ? 'bg-[#1a1c1e] text-white rounded-br-xs'
                    : 'bg-white border border-[#eaedf1] text-[#1e2229] rounded-bl-xs'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <div className="text-[13.5px] leading-relaxed">
                    <Markdown
                      components={{
                        p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="leading-normal">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 text-[#111827]">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-2.5 text-[#111827]">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-bold mb-1 mt-2 text-[#111827]">{children}</h3>,
                        strong: ({ children }) => <strong className="font-semibold text-[#111827]">{children}</strong>,
                        em: ({ children }) => <em className="italic opacity-90">{children}</em>,
                      }}
                    >
                      {msg.text}
                    </Markdown>
                  </div>
                )}

                {/* Render Approval Card if message carries an Action Proposal */}
                {msg.actionProposal && (
                  <div className="mt-3">
                    <ApprovalCard
                      proposal={msg.actionProposal}
                      userId={userProfile?.uid || 'guest_user'}
                      onExecuted={(res) => {
                        setMessages((prevMsgs) => {
                          const nextMsgs = prevMsgs.map((m) => {
                            if (m.id === msg.id && m.actionProposal) {
                              return {
                                ...m,
                                actionProposal: {
                                  ...m.actionProposal,
                                  status: res.success ? 'approved' : 'denied',
                                  executed: res.success,
                                  executedMessage: res.message
                                }
                              };
                            }
                            return m;
                          });
                          if (userProfile?.uid) {
                            saveChatMessage(userProfile.uid, chatId, nextMsgs);
                            AgentMemoryService.saveChatSession(userProfile.uid, chatId, nextMsgs);
                          }
                          return nextMsgs;
                        });
                      }}
                    />
                  </div>
                )}

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

      {/* Hidden File Input for Vault Attachment Ingestion */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.json,.csv"
        className="hidden"
      />

      {/* Chat Input Bar with File Upload */}
      <div className="pt-2 px-1 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2 p-2 rounded-[24px] bg-white border border-[#eaedf1] shadow-md"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Document to Agent Memory Vault"
            className="p-2.5 rounded-2xl text-[#64748b] hover:text-[#1a1c1e] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
          >
            <Icon icon="solar:paperclip-bold-duotone" className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask SANA or log a skin memory..."
            className="flex-1 px-2 text-[13.5px] text-[#121316] bg-transparent focus:outline-none placeholder-[#94a3b8]"
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

      {/* Vault Inspector Modal */}
      <AnimatePresence>
        {showVaultModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                    <Icon icon="solar:vault-bold" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Agent Memory Vault</h3>
                    <p className="text-xs text-slate-500">Isolated namespace: <span className="font-mono text-emerald-700">{userId}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVaultModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                {/* Notes Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:notes-bold-duotone" className="w-4 h-4 text-emerald-600" />
                    <span>Memory Notes ({vaultNotes.length})</span>
                  </h4>
                  {vaultNotes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No skin memories stored in vault yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {vaultNotes.map((note) => (
                        <div key={note.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900">{note.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(note.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600">{note.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Documents Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:document-text-bold-duotone" className="w-4 h-4 text-blue-600" />
                    <span>Indexed Documents ({vaultDocs.length})</span>
                  </h4>
                  {vaultDocs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No uploaded documents in vault yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {vaultDocs.map((docItem) => (
                        <div key={docItem.id} className="p-3 rounded-2xl bg-blue-50/50 border border-blue-100 text-xs space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-900">{docItem.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(docItem.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-600 line-clamp-2">{docItem.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-400">
                  🔒 Data in this vault is strictly segregated by user ID in Firestore (<code className="bg-slate-100 px-1 py-0.5 rounded">agent_vaults/{"{userId}"}</code>).
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

