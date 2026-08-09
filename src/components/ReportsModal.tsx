import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, FacialScanResult } from '../types';
import { subscribeFacialScans } from '../lib/firebase';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  userProfile
}) => {
  const [scanHistory, setScanHistory] = useState<FacialScanResult[]>([]);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeFacialScans(userProfile.uid, (data) => {
      setScanHistory(data);
    });
    return () => unsub();
  }, [userProfile?.uid]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-sm rounded-[32px] bg-white border border-white/80 overflow-hidden shadow-2xl p-6 relative flex flex-col space-y-4 max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-[#1a1c1e] text-white">
                <Icon icon="solar:chart-square-bold" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#121316]">Skin Analytics</h3>
                <p className="text-[11px] text-[#787f8d]">Facial Scan Progress Log</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-[#787f8d] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
            </button>
          </div>

          {/* Overview Metrics Bar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Avg Hydration</span>
              <p className="text-[18px] font-bold text-[#1e293b]">86%</p>
            </div>
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Barrier Health</span>
              <p className="text-[18px] font-bold text-[#1e293b]">89%</p>
            </div>
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Total Scans</span>
              <p className="text-[18px] font-bold text-[#1e293b]">{scanHistory.length > 0 ? scanHistory.length : 1}</p>
            </div>
          </div>

          {/* Scan History Items */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pt-1">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Recent Analysis Logs
            </span>

            {scanHistory.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
                <p className="text-[12.5px] text-[#787f8d]">No past scans saved yet. Run your first facial scan to begin tracking!</p>
              </div>
            ) : (
              scanHistory.map((scan, idx) => (
                <div key={scan.id || idx} className="p-4 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#121316]">
                      Scan #{scanHistory.length - idx}
                    </span>
                    <span className="text-[11px] text-[#64748b]">
                      Hydration {scan.hydrationScore}%
                    </span>
                  </div>
                  <p className="text-[12px] text-[#475569]">{scan.summary}</p>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
