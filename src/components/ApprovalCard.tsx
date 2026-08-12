import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ActionProposal } from '../agent/types';

export type RecommendationOption = {
  key: string;
  body: React.ReactNode;
  short: string;
  signal: number; // 0..3
  tone: string;   // hex or var e.g. '#10b981', '#f59e0b', '#94a3b8'
  label: string;  // e.g. "High confidence", "Needs review", "Cancel action"
  cta: string;
  ctaStyle?: string;
  action?: 'execute' | 'deny' | 'configure';
};

interface ApprovalCardProps {
  proposal?: ActionProposal;
  options?: RecommendationOption[];
  title?: string;
  userId?: string;
  onExecuted?: (result: { success: boolean; message: string }) => void;
}

export function Meter({ signal, tone }: { signal: number; tone: string }) {
  return (
    <span className="flex items-end gap-0.5 shrink-0">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-1 rounded-full transition-colors duration-300"
          style={{
            height: 10,
            background: bar < signal ? tone : '#e2e8f0'
          }}
        />
      ))}
    </span>
  );
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  proposal,
  options: customOptions,
  title,
  userId = 'guest_user',
  onExecuted
}) => {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'pending' | 'executing' | 'approved' | 'denied'>(
    proposal?.status || (proposal?.executed ? 'approved' : 'pending')
  );
  const [resultMessage, setResultMessage] = useState<string | null>(
    proposal?.executedMessage || (proposal?.executed ? 'Action executed successfully.' : null)
  );

  // Generate options if not explicitly provided
  const options: RecommendationOption[] = customOptions || (proposal ? [
    {
      key: proposal.actionId || 'primary',
      short: proposal.title,
      body: (
        <>
          <span className="font-semibold text-slate-900 block mb-1">{proposal.title}</span>
          <p className="text-slate-600 text-[12.5px] leading-relaxed">{proposal.description}</p>
          {proposal.payload && typeof proposal.payload === 'object' && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-0.5">
                Action Parameters
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(proposal.payload).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-lg bg-white border border-slate-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                    </span>
                    <div className="mt-1">
                      {typeof val === 'boolean' ? (
                        val ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                            Pending Execution
                          </span>
                        )
                      ) : (
                        <span className="text-[12px] font-semibold text-slate-800 break-words">
                          {typeof val === 'object' ? JSON.stringify(val) : String(val || 'N/A')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ),
      signal: proposal.riskLevel === 'low' ? 3 : 2,
      tone: proposal.riskLevel === 'low' ? '#10b981' : '#f59e0b',
      label: proposal.riskLevel === 'low' ? 'High confidence' : 'Needs review',
      cta: 'Allow & Execute',
      ctaStyle: 'bg-[#1a1c1e] text-white hover:bg-black',
      action: 'execute'
    },
    {
      key: 'deny',
      short: 'Decline & cancel action',
      body: 'Decline this action proposal. The agent will cancel the scheduled operation and record your response.',
      signal: 0,
      tone: '#94a3b8',
      label: 'Decline action',
      cta: 'Deny Proposal',
      ctaStyle: 'bg-rose-600 text-white hover:bg-rose-700',
      action: 'deny'
    },
    {
      key: 'configure',
      short: 'Review payload parameters',
      body: 'Request parameter adjustments or manual review before proceeding with this routine.',
      signal: 1,
      tone: '#f59e0b',
      label: 'Manual review',
      cta: 'Configure',
      ctaStyle: 'bg-slate-800 text-white hover:bg-slate-900',
      action: 'configure'
    }
  ] : [
    {
      key: 'default',
      short: 'Standard Recommendation',
      body: 'Execute recommended skin health action.',
      signal: 3,
      tone: '#10b981',
      label: 'High confidence',
      cta: 'Accept',
      ctaStyle: 'bg-[#1a1c1e] text-white',
      action: 'execute'
    }
  ]);

  const active = options[selected] || options[0];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  const handleAction = async (opt: RecommendationOption) => {
    if (opt.action === 'deny' || opt.key === 'deny') {
      setStatus('denied');
      setResultMessage('Action proposal was declined by user.');
      if (onExecuted) onExecuted({ success: false, message: 'User denied proposal.' });
      return;
    }

    if (opt.action === 'configure') {
      setStatus('denied');
      setResultMessage('User requested payload parameter configuration.');
      if (onExecuted) onExecuted({ success: false, message: 'User requested configuration.' });
      return;
    }

    // Execute via API if proposal exists
    if (proposal) {
      if (proposal.actionType === 'TRIGGER_FACIAL_SCAN' || proposal.actionTarget === 'scan') {
        window.dispatchEvent(new CustomEvent('sana:open_facial_scan'));
        setStatus('approved');
        setResultMessage('Facial scan camera launched successfully!');
        if (onExecuted) onExecuted({ success: true, message: 'Facial scan camera launched.' });
        return;
      }

      setStatus('executing');
      try {
        const res = await fetch('/api/sana/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, proposal })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setStatus('approved');
          setResultMessage(data.message || 'Action executed successfully and recorded in audit log.');
          if (onExecuted) onExecuted({ success: true, message: data.message });
        } else {
          setStatus('pending');
          alert(data.error || 'Execution failed. Please try again.');
        }
      } catch (err) {
        console.error('Approval execute error:', err);
        setStatus('pending');
        alert('Network error executing proposal.');
      }
    } else {
      setStatus('approved');
      setResultMessage('Recommendation accepted.');
      if (onExecuted) onExecuted({ success: true, message: 'Recommendation accepted.' });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-[400px] my-3 overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all text-[#1a1c1e]"
    >
      {/* Top Header & Main Body */}
      <div className="p-4 pb-3">
        <span className="text-[13px] font-semibold text-slate-900 block">
          {title || (proposal ? 'Want me to execute this action?' : 'Agent Recommendation')}
        </span>
        <div
          key={active.key}
          className="mt-2 min-h-12 text-[12.5px] leading-relaxed text-slate-600"
          style={{ animation: 'fade-in 180ms ease-out both' }}
        >
          {active.body}
        </div>
      </div>

      {/* Alternatives Drawer — Expandable Section */}
      {others.length > 0 && (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            opacity: open ? 1 : 0,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 space-y-1">
              <p className="px-1 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Other options
              </p>
              {others.map(({ o, i }) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    setStatus('pending');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 hover:bg-slate-200/60 active:scale-[0.98] cursor-pointer"
                >
                  <Meter signal={o.signal} tone={o.tone} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">
                    {o.short}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-slate-400">
                    {o.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Footer Bar */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12px] font-medium text-slate-700">{active.label}</span>
        </span>

        <AnimatePresence mode="wait">
          {status === 'executing' ? (
            <div className="flex items-center space-x-1.5 text-xs font-medium text-blue-600 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Executing...</span>
            </div>
          ) : status === 'approved' ? (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Accepted</span>
            </div>
          ) : status === 'denied' ? (
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Declined</span>
            </div>
          ) : (
            <span className="flex items-center gap-2">
              {others.length > 0 && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpen((current) => !current)}
                  className={`h-7 rounded-xl px-2.5 text-[12px] font-medium shadow-xs transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                    open
                      ? 'bg-slate-200 text-slate-900'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  Alternatives
                </button>
              )}
              <button
                type="button"
                onClick={() => handleAction(active)}
                className={`h-7 rounded-xl px-3 text-[12px] font-medium shadow-xs transition-all duration-150 active:scale-[0.96] cursor-pointer ${
                  active.ctaStyle || 'bg-[#1a1c1e] text-white hover:bg-black'
                }`}
              >
                {active.cta}
              </button>
            </span>
          )}
        </AnimatePresence>
      </div>

      {resultMessage && status !== 'pending' && (
        <div className="px-3.5 pb-2.5 pt-0 text-[11px] text-slate-500 font-medium">
          {resultMessage}
        </div>
      )}
    </motion.div>
  );
};

export const RecommendationCard = ApprovalCard;
export default ApprovalCard;

