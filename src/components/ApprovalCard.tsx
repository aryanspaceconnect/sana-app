import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { ActionProposal } from '../agent/types';

interface ApprovalCardProps {
  proposal: ActionProposal;
  userId?: string;
  onExecuted?: (result: { success: boolean; message: string }) => void;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({ proposal, userId = 'guest_user', onExecuted }) => {
  const [status, setStatus] = useState<'pending' | 'executing' | 'approved' | 'denied'>(
    proposal.status || (proposal.executed ? 'approved' : 'pending')
  );
  const [resultMessage, setResultMessage] = useState<string | null>(
    proposal.executedMessage || (proposal.executed ? 'Action executed successfully and recorded in audit log.' : null)
  );

  const handleApprove = async () => {
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
  };

  const handleDeny = () => {
    setStatus('denied');
    setResultMessage('Action proposal was declined by user.');
    if (onExecuted) onExecuted({ success: false, message: 'User denied proposal.' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="my-3 p-4 rounded-2xl bg-white border border-[#e5e7eb] shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#f3f4f6]">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#2563eb]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#4b5563]">
            Action Proposal Required
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            proposal.riskLevel === 'medium'
              ? 'bg-[#fef3c7] text-[#92400e]'
              : 'bg-[#dbeafe] text-[#1e40af]'
          }`}
        >
          {proposal.riskLevel} Risk
        </span>
      </div>

      <div className="space-y-1 mb-3">
        <h4 className="text-sm font-bold text-[#111827]">{proposal.title}</h4>
        <p className="text-xs text-[#4b5563] leading-relaxed">{proposal.description}</p>
      </div>

      {proposal.payload && (
        <div className="p-2.5 rounded-xl bg-[#f9fafb] border border-[#f3f4f6] text-[11px] font-mono text-[#374151] mb-3 overflow-x-auto">
          <pre>{JSON.stringify(proposal.payload, null, 2)}</pre>
        </div>
      )}

      <AnimatePresence mode="wait">
        {status === 'pending' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center space-x-2 pt-1"
          >
            <button
              onClick={handleApprove}
              className="flex-1 py-2 px-3 rounded-xl bg-[#111827] hover:bg-[#1f2937] text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-sm active:scale-[0.98]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
              <span>Allow & Execute</span>
            </button>

            <button
              onClick={handleDeny}
              className="py-2 px-3 rounded-xl bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] text-xs font-medium flex items-center justify-center space-x-1 transition-colors active:scale-[0.98]"
            >
              <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />
              <span>Deny</span>
            </button>
          </motion.div>
        )}

        {status === 'executing' && (
          <motion.div
            key="executing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center space-x-2 py-2 text-xs font-medium text-[#2563eb]"
          >
            <Loader2 className="w-4 h-4 animate-spin text-[#2563eb]" />
            <span>Executing Action & Writing Audit Log...</span>
          </motion.div>
        )}

        {status === 'approved' && (
          <motion.div
            key="approved"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-2.5 rounded-xl bg-[#ecfdf5] border border-[#a7f3d0] flex items-start space-x-2 text-xs text-[#065f46]"
          >
            <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Approved & Recorded</p>
              <p className="text-[11px] text-[#047857] mt-0.5">{resultMessage}</p>
            </div>
          </motion.div>
        )}

        {status === 'denied' && (
          <motion.div
            key="denied"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-2.5 rounded-xl bg-[#fef2f2] border border-[#fecaca] flex items-start space-x-2 text-xs text-[#991b1b]"
          >
            <XCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Action Proposal Declined</p>
              <p className="text-[11px] text-[#b91c1c] mt-0.5">{resultMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
