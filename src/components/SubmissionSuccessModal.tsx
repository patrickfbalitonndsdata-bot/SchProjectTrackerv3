import React, { useEffect, useState } from 'react';
import { CheckCircle2, X, FileSpreadsheet, ArrowRight, Clock, Hash } from 'lucide-react';
import { AppendResult } from '../types';

interface SubmissionSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string | null;
  result?: AppendResult | null;
  projectNumbers?: string[];
  durationMs?: number; // default 3000ms
}

export const SubmissionSuccessModal: React.FC<SubmissionSuccessModalProps> = ({
  isOpen,
  onClose,
  message,
  result,
  projectNumbers = [],
  durationMs = 3000,
}) => {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(durationMs);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeftMs(durationMs);
      return;
    }

    setTimeLeftMs(durationMs);
    const startTime = Date.now();
    const intervalTime = 50;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [isOpen, durationMs, onClose]);

  if (!isOpen) return null;

  const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / durationMs) * 100));
  const secondsLeft = Math.ceil(timeLeftMs / 1000);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 ease-out duration-300">
        {/* Top decorative gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 text-center">
          {/* Animated Success Icon */}
          <div className="relative mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 mb-4">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/30 animate-ping" />
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-in zoom-in-50 duration-300" />
            </div>
          </div>

          {/* Heading */}
          <h3 className="text-lg font-black uppercase tracking-wider text-slate-900 font-display">
            Submission Successful!
          </h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {message || 'Your PSU scheduling entry has been successfully logged to Google Sheets.'}
          </p>

          {/* Summary Pills */}
          <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/90 space-y-2 text-left text-xs">
            {result?.sheetName && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                  Target Sheet:
                </span>
                <span className="font-mono font-bold text-slate-900 truncate max-w-[200px]">
                  {result.sheetName}
                </span>
              </div>
            )}

            {result?.updatedRange && (
              <div className="flex items-center justify-between text-slate-700">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                  Appended Range:
                </span>
                <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-900 font-semibold truncate max-w-[200px]">
                  {result.updatedRange}
                </span>
              </div>
            )}

            {projectNumbers && projectNumbers.length > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-blue-200/60">
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-blue-600" />
                  Project{projectNumbers.length > 1 ? 's' : ''}:
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {projectNumbers.map((pNum, idx) => (
                    <span
                      key={idx}
                      className="font-mono font-bold text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-xs"
                    >
                      #{pNum}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action / Dismiss */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Closing in {secondsLeft}s...</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md text-xs font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
            >
              OK, Dismiss
            </button>
          </div>
        </div>

        {/* 3-Second Countdown Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-75 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
