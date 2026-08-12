import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, ChatMessage } from '../types';
import { saveChatMessage, subscribeUserChat } from '../lib/firebase';
import { loadAgentVault, VaultNote, VaultDocument } from '../agent/agentVault';
import { AgentMemoryService } from '../services/AgentMemoryService';
import { ApprovalCard } from './ApprovalCard';
import { ThinkingReasoning, TraceRow } from './ThinkingReasoning';
import { LoadingState } from './LoadingState';
import { WebSearch } from './WebSearch';

interface AIAgentChatProps {
  userProfile: UserProfile | null;
  onMinimizeNavToggle: (minimize: boolean) => void;
  onTriggerPopup?: (popup: any) => void;
}

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  userProfile: UserProfile | null;
  chatId: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onSendMessage?: (text: string) => void;
}

const extractTraceRows = (msg: ChatMessage): { rows: TraceRow[]; elapsed?: number } => {
  const rows: TraceRow[] = [];

  if (msg.passOnTrace && Array.isArray(msg.passOnTrace)) {
    msg.passOnTrace.forEach((p: any) => {
      if (p.thought) {
        rows.push({
          primary: p.thought,
          type: 'Reasoning'
        });
      }
      if (p.nextTools && Array.isArray(p.nextTools)) {
        p.nextTools.forEach((tc: any) => {
          rows.push({
            primary: `Tool: ${tc.name}`,
            secondary: tc.arguments ? JSON.stringify(tc.arguments).slice(0, 45) : undefined,
            mono: true,
            type: 'Tool'
          });
        });
      }
    });
  }

  if (msg.thinkingMeta?.modelThoughts && Array.isArray(msg.thinkingMeta.modelThoughts)) {
    msg.thinkingMeta.modelThoughts.forEach((th: string) => {
      if (th && !rows.some(r => r.primary === th)) {
        rows.push({ primary: th, type: 'Reasoning' });
      }
    });
  }

  return {
    rows,
    elapsed: msg.thinkingMeta?.elapsedSeconds
  };
};

const ChatMessageBubble = React.memo<ChatMessageBubbleProps>(
  ({ msg, userProfile, chatId, setMessages, onSendMessage }) => {
    const isUser = msg.role === 'user';

    // Extract search query if present in msg.searchQuery or embedded text
    let searchQuery = msg.searchQuery;
    let searchSites = msg.searchSites;

    if (!searchQuery && !isUser && msg.text) {
      const match = msg.text.match(/\[SEARCH:\s*["']?([^"']+)["']?\]/i) || msg.text.match(/Searching\s+["']([^"']+)["']/i);
      if (match) {
        searchQuery = match[1];
      }
    }

    // Clean text by removing raw [SEARCH: "..."] tags if any
    const displayText = (msg.text || '').replace(/\[SEARCH:\s*["']?([^"']+)["']?\]/gi, '').trim();
    const { rows: traceRows, elapsed: traceElapsed } = extractTraceRows(msg);

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} my-1 w-full`}
      >
        {isUser ? (
          <div className="max-w-[85%] px-4 py-3 rounded-[20px] rounded-br-xs bg-[#1a1c1e] text-white text-[13.5px] leading-relaxed shadow-xs">
            <p className="whitespace-pre-wrap">{msg.text}</p>
            <span className="text-[10px] mt-1 block text-right font-medium text-white/60">
              {msg.timestamp}
            </span>
          </div>
        ) : (
          <div className="w-full max-w-[96%] py-1 px-1 text-[#1e2229]">
            {/* Real Thinking Trace Dropdown - Rendered ONLY if real thoughts/tools exist */}
            {traceRows.length > 0 && (
              <div className="mb-2">
                <ThinkingReasoning isWorking={false} rows={traceRows} elapsedSeconds={traceElapsed} />
              </div>
            )}

            {/* Web Search Reasoning Stream UI */}
            {searchQuery && (
              <div className="my-2">
                <WebSearch query={searchQuery} sites={searchSites} />
              </div>
            )}

            {/* Proper Markdown Rendering Engine for LLM Assistant Response */}
            <div className="text-[14px] leading-relaxed text-[#1e2229] space-y-2">
              <Markdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-[16px] font-bold text-[#121316] mt-3 mb-1.5 tracking-tight border-b border-slate-200/60 pb-1">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-[15px] font-bold text-[#121316] mt-2.5 mb-1 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[14px] font-bold text-[#121316] mt-2 mb-1 tracking-tight">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-[13.5px] font-bold text-[#121316] mt-1.5 mb-1">
                      {children}
                    </h4>
                  ),
                  p: ({ children }) => (
                    <p className="mb-2.5 last:mb-0 leading-relaxed text-[#1e2229] text-[14px]">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside ml-4 space-y-1.5 my-2 text-[14px] text-[#1e2229]">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside ml-4 space-y-1.5 my-2 text-[14px] text-[#1e2229]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed pl-1">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-bold text-[#121316]">{children}</strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-[#2c3038]">{children}</em>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-emerald-500/80 pl-3 my-2 italic text-slate-600 bg-slate-50/50 py-1 rounded-r-md">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="bg-slate-100 text-[#121316] text-[12.5px] px-1.5 py-0.5 rounded-md font-mono border border-slate-200/80">
                      {children}
                    </code>
                  ),
                  hr: () => <hr className="border-t border-slate-200/80 my-3" />
                }}
              >
                {displayText}
              </Markdown>
            </div>

            {/* Render Approval Card if message carries an Action Proposal */}
            {msg.actionProposal && (
              <div className="mt-3">
                <ApprovalCard
                  proposal={msg.actionProposal}
                  userId={userProfile?.uid || 'guest_user'}
                  onAnswersSubmitted={(answersText) => {
                    if (onSendMessage) {
                      onSendMessage(answersText);
                    }
                  }}
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

            <span className="text-[10px] mt-1.5 block text-left font-medium text-[#8e95a2]">
              {msg.timestamp}
            </span>
          </div>
        )}
      </motion.div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.text === next.msg.text &&
    prev.msg.actionProposal === next.msg.actionProposal &&
    prev.msg.searchQuery === next.msg.searchQuery &&
    prev.userProfile?.uid === next.userProfile?.uid &&
    prev.chatId === next.chatId
);

export const AIAgentChat: React.FC<AIAgentChatProps> = ({
  userProfile,
  onMinimizeNavToggle,
  onTriggerPopup
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'working'>('idle');
  const [liveTraceRows, setLiveTraceRows] = useState<TraceRow[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const requestStartTimeRef = useRef<number>(0);

  // Agent Vault state
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  }, [messages.length, processingStatus]);

  const handleAbortRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProcessingStatus('idle');
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || processingStatus !== 'idle') return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText('');
    
    // Start initial loading state ("Funneling request")
    setProcessingStatus('loading');
    setLiveTraceRows([]);
    requestStartTimeRef.current = Date.now();

    if (userProfile?.uid) {
      saveChatMessage(userProfile.uid, chatId, updatedMessages);
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/sana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
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

      // Transition to working state as soon as LLM response payload arrives
      setProcessingStatus('working');

      // Extract real tool results & detected queries
      let detectedSearchQuery: string | undefined = undefined;
      let detectedSearchSites: any[] | undefined = undefined;
      const realTraceRows: TraceRow[] = [];

      if (data.toolResults && Array.isArray(data.toolResults)) {
        for (const tr of data.toolResults) {
          if (['web_search', 'web_fetch', 'exa_search', 'exa_answer'].includes(tr.toolName) && tr.data) {
            detectedSearchQuery = tr.data.query || tr.data.searchQuery;
            detectedSearchSites = tr.data.sites || tr.data.searchSites;
          }
          realTraceRows.push({
            primary: `Executed: ${tr.toolName}`,
            secondary: tr.error ? 'failed' : 'ok',
            type: 'Tool'
          });
        }
      }

      if (data.passOnTrace && Array.isArray(data.passOnTrace)) {
        for (const passOn of data.passOnTrace) {
          if (passOn.thought) {
            realTraceRows.push({
              primary: passOn.thought,
              type: 'Reasoning'
            });
          }
          if (passOn.nextTools) {
            for (const toolCall of passOn.nextTools) {
              if (toolCall.name === 'trigger_popup_card' && onTriggerPopup) {
                const args = toolCall.arguments || {};
                onTriggerPopup({
                  id: `popup_${Date.now()}`,
                  type: 'custom_action',
                  title: args.title || 'SANA Action Alert',
                  subtitle: args.subtitle || 'Routine action requested',
                  timeAgo: 'Just now',
                  actionText: args.actionText || 'Start Routine',
                  iconType: args.iconType || 'sparkle',
                  badgeText: args.badgeText || 'SANA AGENT POP-UP',
                  actionTarget: args.actionTarget || 'scan'
                });
              }
              if (['web_search', 'web_fetch', 'exa_search', 'exa_answer'].includes(toolCall.name) && !detectedSearchQuery) {
                const args = toolCall.arguments || {};
                if (args.query) {
                  detectedSearchQuery = args.query;
                }
              }
              realTraceRows.push({
                primary: `Tool Call: ${toolCall.name}`,
                secondary: toolCall.arguments ? JSON.stringify(toolCall.arguments).slice(0, 40) : undefined,
                mono: true,
                type: 'Tool'
              });
            }
          }
        }
      }

      setLiveTraceRows(realTraceRows);
      const elapsedSeconds = (Date.now() - requestStartTimeRef.current) / 1000;

      const modelMsg: ChatMessage = {
        id: `mod_${Date.now()}`,
        role: 'model',
        text: data.text || "I am processing your skincare query with SanaAgent.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionProposal: data.actionProposal,
        passOnTrace: data.passOnTrace,
        sessionId: data.sessionId,
        searchQuery: detectedSearchQuery,
        searchSites: detectedSearchSites,
        thinkingMeta: {
          intent: data.passOnTrace?.[0]?.intent || 'AGENT_LOOP',
          thinkingMode: (data.iterations && data.iterations > 1) ? 'hard' : 'easy',
          complexityScore: data.iterations ? Math.min(10, data.iterations * 3) : 3,
          appliedRules: ['SanaAgent PassOn Protocol'],
          reasoningSteps: [],
          elapsedSeconds
        }
      };

      const finalMessages = [...updatedMessages, modelMsg];
      setMessages(finalMessages);

      if (userProfile?.uid) {
        saveChatMessage(userProfile.uid, chatId, finalMessages);
        AgentMemoryService.saveChatSession(userProfile.uid, chatId, finalMessages);
      }
      refreshVault();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('SanaAgent request aborted by user.');
        const cancelMsg: ChatMessage = {
          id: `aborted_${Date.now()}`,
          role: 'model',
          text: "Response generation was terminated by user.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const finalMessages = [...updatedMessages, cancelMsg];
        setMessages(finalMessages);
        if (userProfile?.uid) {
          saveChatMessage(userProfile.uid, chatId, finalMessages);
        }
        return;
      }
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
      setProcessingStatus('idle');
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
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            msg={msg}
            userProfile={userProfile}
            chatId={chatId}
            setMessages={setMessages}
            onSendMessage={handleSendMessage}
          />
        ))}

        {/* Initial Loading Indicator (Before LLM output begins) */}
        {processingStatus === 'loading' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-1 w-full">
            <LoadingState label="Funneling request" variant="Drive" />
          </motion.div>
        )}

        {/* Working State Indicator (While LLM is processing/generating) */}
        {processingStatus === 'working' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start my-1 w-full">
            <ThinkingReasoning isWorking={true} rows={liveTraceRows} />
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

      {/* Chat Input Bar with File Upload — Ergonomically reduced length with psychological UX affordance */}
      <div className="pt-2 px-1 shrink-0 flex justify-center w-full">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="w-full max-w-[82%] sm:max-w-[360px] flex items-center space-x-1.5 p-1.5 pl-2.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg transition-all duration-300 focus-within:ring-2 focus-within:ring-[#1a1c1e]/15 focus-within:border-[#1a1c1e]/50 focus-within:shadow-xl"
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Document to Agent Memory Vault"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100/80 transition-all duration-200 cursor-pointer shrink-0 flex items-center justify-center active:scale-95"
          >
            <Icon icon="solar:add-circle-linear" className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask SANA or log a skin memory..."
            className="flex-1 px-1.5 text-[13px] text-[#121316] font-medium bg-transparent focus:outline-none placeholder-[#94a3b8] min-w-0"
          />
          {processingStatus === 'idle' ? (
            <button
              type="submit"
              disabled={!inputText.trim()}
              title="Send message"
              className="w-8.5 h-8.5 rounded-[12px] bg-[#1a1c1e] text-white flex items-center justify-center disabled:opacity-30 disabled:scale-95 transition-all duration-200 cursor-pointer shadow-xs shrink-0 hover:bg-black active:scale-95"
            >
              <Icon icon="solar:plain-2-bold" className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAbortRequest}
              title="Terminate response request"
              className="w-8.5 h-8.5 rounded-[12px] bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-xs shrink-0 active:scale-95 animate-pulse"
            >
              <Icon icon="solar:stop-bold" className="w-3.5 h-3.5" />
            </button>
          )}
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

export default AIAgentChat;
