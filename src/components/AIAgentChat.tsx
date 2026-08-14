import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, ChatMessage, ChatSession } from '../types';
import { 
  createChatSession, 
  saveChatSessionData, 
  subscribeUserSessions, 
  subscribeChatSession,
  deleteChatSession
} from '../lib/firebase';
import { loadAgentVault, VaultNote, VaultDocument } from '../agent/agentVault';
import { getSessionNotepad } from '../agent/sessionNotepad';
import { ApprovalCard } from './ApprovalCard';
import { ThinkingReasoning, TraceRow } from './ThinkingReasoning';
import { LoadingState } from './LoadingState';
import { WebSearch } from './WebSearch';
import { PlusMenu } from './PlusMenu';

interface AIAgentChatProps {
  userProfile: UserProfile | null;
  onMinimizeNavToggle: (minimize: boolean) => void;
  onTriggerPopup?: (popup: any) => void;
  activeSessionIdProp?: string | null;
  onSessionChange?: (sessionId: string) => void;
}

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  userProfile: UserProfile | null;
  sessionId: string;
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
  ({ msg, userProfile, sessionId, setMessages, onSendMessage }) => {
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

            {/* Markdown Rendering for LLM Assistant Response */}
            <div className="text-[14px] leading-relaxed text-[#1e2229] space-y-2">
              <Markdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-[16px] font-bold text-[#121316] mt-3 mb-1.5 tracking-tight border-b border-slate-200/60 pb-1">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-[14.5px] font-bold text-[#1a1c1e] mt-2.5 mb-1 tracking-tight">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-[13.5px] font-bold text-[#2d3139] mt-2 mb-0.5">
                      {children}
                    </h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-[13.5px] leading-[1.6] text-[#2c3038] mb-1.5 last:mb-0">
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-outside pl-4 space-y-1 my-1.5 text-[13.5px] text-[#2c3038]">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside pl-4 space-y-1 my-1.5 text-[13.5px] text-[#2c3038]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-[1.5] pl-0.5">
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-[#121316]">
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em className="italic text-[#4a5568]">
                      {children}
                    </em>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[#1a1c1e]/30 pl-3 py-1 my-2 text-[13px] text-[#4a5568] bg-[#f8fafc] rounded-r-lg">
                      {children}
                    </blockquote>
                  ),
                  code: ({ children }) => (
                    <code className="text-[12px] font-mono px-1.5 py-0.5 rounded-md bg-[#f1f5f9] text-[#0f172a] border border-[#e2e8f0]">
                      {children}
                    </code>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-800 transition-colors inline-flex items-center space-x-0.5"
                    >
                      <span>{children}</span>
                      <Icon icon="solar:arrow-right-up-linear" className="w-3 h-3 ml-0.5 inline" />
                    </a>
                  )
                }}
              >
                {displayText}
              </Markdown>
            </div>

            {/* Action Proposal Interactive Card */}
            {msg.actionProposal && (
              <div className="mt-3">
                <ApprovalCard
                  proposal={msg.actionProposal}
                  userId={userProfile?.uid || 'guest_user'}
                  onExecuted={(res) => {
                    setMessages((prev) => {
                      const nextMsgs = prev.map((m) => {
                        if (m.id === msg.id && m.actionProposal) {
                          return {
                            ...m,
                            actionProposal: {
                              ...m.actionProposal,
                              executed: true,
                              executedMessage: res.message
                            }
                          };
                        }
                        return m;
                      });
                      if (userProfile?.uid && sessionId) {
                        saveChatSessionData(userProfile.uid, sessionId, { messages: nextMsgs });
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
    prev.sessionId === next.sessionId
);

export const AIAgentChat: React.FC<AIAgentChatProps> = ({
  userProfile,
  onMinimizeNavToggle,
  onTriggerPopup,
  activeSessionIdProp,
  onSessionChange
}) => {
  const userId = userProfile?.uid || 'guest_user';

  // Multi-session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return activeSessionIdProp || `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);
  const [sessionNotepadText, setSessionNotepadText] = useState<string>('');

  // Input & Stream state
  const [inputText, setInputText] = useState('');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'working'>('idle');
  const [liveTraceRows, setLiveTraceRows] = useState<TraceRow[]>([]);
  const requestStartTimeRef = useRef<number>(0);

  // Agent Vault state
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Synchronize session ID with external props if given
  useEffect(() => {
    if (activeSessionIdProp && activeSessionIdProp !== activeSessionId) {
      setActiveSessionId(activeSessionIdProp);
    }
  }, [activeSessionIdProp]);

  // Subscribe to all sessions list
  useEffect(() => {
    const unsubscribe = subscribeUserSessions(userId, (sessionList) => {
      setSessions(sessionList);
      // If we don't have an active session yet and there is at least one session, set it if not initiating new
      if (sessionList.length > 0 && !activeSessionId) {
        setActiveSessionId(sessionList[0].id);
      }
    });

    return () => unsubscribe();
  }, [userId]);

  // Subscribe to the active session document
  useEffect(() => {
    if (!activeSessionId) return;

    const unsubscribe = subscribeChatSession(userId, activeSessionId, (sessionData) => {
      if (sessionData && Array.isArray(sessionData.messages)) {
        setMessages(sessionData.messages);
        setSessionNotepadText(sessionData.sessionNotepad || '');
      } else {
        // If session document does not exist yet (brand new session), start with zero messages
        setMessages([]);
        setSessionNotepadText('');
      }
    });

    return () => unsubscribe();
  }, [userId, activeSessionId]);

  // Listen to open session events (e.g. from facial scan reports or notifications)
  useEffect(() => {
    const handleOpenSession = (e: any) => {
      if (e.detail?.sessionId) {
        setActiveSessionId(e.detail.sessionId);
        if (onSessionChange) onSessionChange(e.detail.sessionId);
      }
    };
    window.addEventListener('sana:open_chat_session', handleOpenSession);
    return () => window.removeEventListener('sana:open_chat_session', handleOpenSession);
  }, [onSessionChange]);

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
      const promptText = `I am uploading a clinical document for my Agent Memory Vault: "${file.name}". Please analyze and ingest this:\n\n${textContent.substring(0, 3000)}`;

      handleSendMessage(promptText);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Handle skin photo uploads for visual diagnosis/notes
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const promptText = `I am attaching a skin photo / product snapshot: "${file.name}". Please analyze the skin condition or formulation details.`;
    handleSendMessage(promptText);
    if (imageInputRef.current) imageInputRef.current.value = '';
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

  // Start a fresh, blank new chat session
  const handleStartNewChat = () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setActiveSessionId(newSessionId);
    setMessages([]);
    setSessionNotepadText('');
    setShowSessionsDrawer(false);
    if (onSessionChange) onSessionChange(newSessionId);
  };

  // Switch to a previous session
  const handleSelectSession = (sessId: string) => {
    setActiveSessionId(sessId);
    setShowSessionsDrawer(false);
    if (onSessionChange) onSessionChange(sessId);
  };

  // Delete a previous session
  const handleDeleteSession = async (sessId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteChatSession(userId, sessId);
    if (activeSessionId === sessId) {
      handleStartNewChat();
    }
  };

  const currentSession = sessions.find(s => s.id === activeSessionId);
  const currentTitle = currentSession?.title || (messages.length > 0 ? (messages[0]?.text?.slice(0, 30) || 'Active Consultation') : 'New Consultation');

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

    // Auto-derive title if this is the first user message in a new session
    const isFirstTurn = messages.length === 0;
    const sessionTitle = isFirstTurn
      ? text.trim().length > 35
        ? `${text.trim().slice(0, 35)}...`
        : text.trim()
      : currentSession?.title || 'Skin Consultation';

    // Persist immediately to Firestore
    if (isFirstTurn) {
      await createChatSession(userId, {
        id: activeSessionId,
        title: sessionTitle,
        sessionType: 'chat',
        initialMessages: updatedMessages
      });
    } else {
      await saveChatSessionData(userId, activeSessionId, {
        messages: updatedMessages,
        title: sessionTitle
      });
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/sana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          message: text.trim(),
          sessionId: activeSessionId,
          history: updatedMessages.map(m => ({ role: m.role, text: m.text }))
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();

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
        sessionId: activeSessionId,
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

      await saveChatSessionData(userId, activeSessionId, {
        messages: finalMessages,
        title: sessionTitle
      });

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
        await saveChatSessionData(userId, activeSessionId, { messages: finalMessages });
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
      await saveChatSessionData(userId, activeSessionId, { messages: finalMessages });
    } finally {
      setProcessingStatus('idle');
    }
  };

  const suggestionChips = [
    "Retinol + Vitamin C safe combination?",
    "How to repair damaged skin barrier?",
    "Evening double-cleansing AM/PM steps",
    "SPF 50 recommendation for sensitive skin",
    "Niacinamide with Salicylic Acid routine",
    "Climate humidity barrier protection"
  ];

  return (
    <div className="w-full h-full flex flex-col justify-between pt-1 pb-24 px-4 overflow-hidden relative">
      {/* Minimal Top Header Bar: Clean Squaricle History & New Chat Actions */}
      <div className="flex items-center justify-between py-2 px-1 border-b border-slate-200/60 shrink-0 mb-1">
        {/* Clean Consultation Sessions Button */}
        <button
          onClick={() => setShowSessionsDrawer(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 transition-all cursor-pointer text-xs font-medium border border-slate-200/50 group"
          title="View past chat sessions and reports"
        >
          <Icon icon="solar:history-bold" className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-900 shrink-0" />
          <span className="font-semibold text-slate-900">Consultations</span>
          {sessions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-[10px] font-bold text-slate-700">
              {sessions.length}
            </span>
          )}
          <Icon icon="solar:alt-arrow-down-linear" className="w-3 h-3 text-slate-400 shrink-0 group-hover:translate-y-0.5 transition-transform" />
        </button>

        {/* Minimal Squaricle Actions: New Chat & Memory Vault */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleStartNewChat}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-[#121316] text-white hover:bg-black transition-all cursor-pointer text-xs font-medium shadow-xs active:scale-95"
            title="Start fresh new chat session"
          >
            <Icon icon="solar:pen-new-square-linear" className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>

          <button
            onClick={() => setShowVaultModal(true)}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer border border-slate-200/50"
            title="Agent Memory Vault & Notepad"
          >
            <Icon icon="solar:vault-bold" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-2 space-y-3.5 px-1">
        {/* Zero messages state: Clean minimalist text slate without icon */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full flex flex-col items-center justify-center text-center px-4 py-8 space-y-2 max-w-md mx-auto"
          >
            <h3 className="text-base font-bold text-slate-900 tracking-tight">How can SANA guide your skin today?</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Start a fresh consultation. Ask about active ingredient safety, clinical routines, or upload a skin document.
            </p>
          </motion.div>
        )}

        {/* Active Messages List */}
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            msg={msg}
            userProfile={userProfile}
            sessionId={activeSessionId}
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

      {/* Quick Suggestion Chips - Minimal Squaricle Options */}
      {messages.length < 3 && (
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1 px-1 shrink-0 opacity-90 hover:opacity-100 transition-opacity">
          {suggestionChips.map((chip, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(chip)}
              className="px-3 py-1.5 rounded-xl bg-slate-100/60 hover:bg-slate-100 text-[11.5px] text-slate-600 hover:text-slate-900 font-medium whitespace-nowrap border border-slate-200/40 transition-colors cursor-pointer shrink-0 shadow-none"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Hidden File Inputs for Document and Image Ingestion */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".txt,.md,.pdf,.json,.csv"
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Chat Input Bar - Squaricle Design */}
      <div className="pt-2 px-1 shrink-0 flex justify-center w-full">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="w-full max-w-[84%] sm:max-w-[380px] flex items-center space-x-1.5 p-1.5 pl-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md transition-all duration-300 focus-within:ring-2 focus-within:ring-[#1a1c1e]/15 focus-within:border-[#1a1c1e]/50 focus-within:shadow-lg"
        >
          <PlusMenu
            onUploadDocument={() => fileInputRef.current?.click()}
            onUploadImage={() => imageInputRef.current?.click()}
            onOpenVault={() => setShowVaultModal(true)}
          />
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
              className="w-8.5 h-8.5 rounded-xl bg-[#1a1c1e] text-white flex items-center justify-center disabled:opacity-30 disabled:scale-95 transition-all duration-200 cursor-pointer shadow-xs shrink-0 hover:bg-black active:scale-95"
            >
              <Icon icon="solar:plain-2-bold" className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAbortRequest}
              title="Terminate response request"
              className="w-8.5 h-8.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-all duration-200 cursor-pointer shadow-xs shrink-0 active:scale-95 animate-pulse"
            >
              <Icon icon="solar:stop-bold" className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Sessions History Drawer / Modal */}
      <AnimatePresence>
        {showSessionsDrawer && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="bg-white rounded-t-[32px] sm:rounded-[32px] max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-slate-900 text-white">
                    <Icon icon="solar:history-bold" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Chat Sessions</h3>
                    <p className="text-xs text-slate-500">{sessions.length} persistent consultations stored</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleStartNewChat}
                    className="px-3 py-1.5 rounded-full bg-[#1a1c1e] text-white text-xs font-semibold flex items-center space-x-1 hover:bg-black cursor-pointer shadow-2xs"
                  >
                    <Icon icon="solar:add-circle-bold" className="w-3.5 h-3.5" />
                    <span>New Chat</span>
                  </button>
                  <button
                    onClick={() => setShowSessionsDrawer(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                  >
                    <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Sessions List */}
              <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                {sessions.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    No past sessions found. Start a new consultation anytime.
                  </div>
                ) : (
                  sessions.map((sess) => {
                    const isSelected = sess.id === activeSessionId;
                    const dateFormatted = sess.updatedAt || sess.createdAt
                      ? new Date(sess.updatedAt || sess.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'Recent';

                    return (
                      <div
                        key={sess.id}
                        onClick={() => handleSelectSession(sess.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                            : 'bg-slate-50 hover:bg-slate-100/90 text-slate-800 border-slate-200/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                              {sess.title || 'Skin Consultation'}
                            </span>
                            {sess.sessionType === 'onboarding_report' && (
                              <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold uppercase ${isSelected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800'}`}>
                                Baseline Scan
                              </span>
                            )}
                            {sess.sessionType === 'scan_report' && (
                              <span className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold uppercase ${isSelected ? 'bg-blue-400 text-slate-900' : 'bg-blue-100 text-blue-800'}`}>
                                Scan Report
                              </span>
                            )}
                          </div>
                          {sess.lastMessage && (
                            <p className={`text-[11.5px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                              {sess.lastMessage}
                            </p>
                          )}
                          <div className={`text-[10px] mt-1.5 flex items-center space-x-2 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                            <span>{dateFormatted}</span>
                            <span>•</span>
                            <span>{sess.messageCount || sess.messages?.length || 0} messages</span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleDeleteSession(sess.id, e)}
                          title="Delete session"
                          className={`p-2 rounded-xl transition-colors opacity-0 group-hover:opacity-100 shrink-0 ${
                            isSelected
                              ? 'text-rose-300 hover:text-rose-100 hover:bg-white/10'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          }`}
                        >
                          <Icon icon="solar:trash-bin-trash-linear" className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vault Inspector Modal */}
      <AnimatePresence>
        {showVaultModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-[28px] max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                    <Icon icon="solar:vault-bold" className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Agent Memory Vault</h3>
                    <p className="text-xs text-slate-500">Namespace: <span className="font-mono text-emerald-700">{userId}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setShowVaultModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-1">
                {/* Session Isolated Notepad Section */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Icon icon="solar:pen-new-square-bold-duotone" className="w-4 h-4 text-purple-600" />
                    <span>Session Notepad (Private to this Chat)</span>
                  </h4>
                  <div className="p-3 rounded-2xl bg-purple-50/50 border border-purple-100 text-xs">
                    {sessionNotepadText ? (
                      <p className="text-slate-700 whitespace-pre-wrap">{sessionNotepadText}</p>
                    ) : (
                      <p className="text-slate-400 italic">Empty. SANA logs working hypotheses and calculated indices here during this consultation.</p>
                    )}
                  </div>
                </div>

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

              <div className="pt-2 border-t border-slate-100 text-center shrink-0">
                <p className="text-[11px] text-slate-400">
                  🔒 Data in this vault is strictly segregated by user ID in Firestore (<code className="bg-slate-100 px-1 py-0.5 rounded">users/{"{userId}"}/agent_sessions</code>).
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
