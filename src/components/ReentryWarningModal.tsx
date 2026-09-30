import React from 'react';
import { AlertTriangle, X, Ban, Hash, History, GitBranch, FileEdit, CheckCircle2 } from 'lucide-react';

export type ReentryAction = 'new_version' | 'for_correction';
export type ReentryDecision = 'cancel' | 'new_version' | 'for_correction';

export interface ExistingProjectReentryInfo {
  id?: string;
  projectNumber: string;
  existingCount: number;
  suggestedVersion: string;
  currentVersion?: string;
  targetJobType?: string;
  correctionJobType?: string;
  sheetName?: string;
  study?: string;
  sourceFile?: string;
  source?: 'form_input' | 'file_parse';
}

interface ReentryWarningModalProps {
  isOpen: boolean;
  projects: ExistingProjectReentryInfo[];
  sheetName?: string;
  onCancel: () => void;
  onConfirmNewVersion?: () => void;
  onConfirmForCorrection?: () => void;
  onContinue?: (action: ReentryAction) => void;
}

export const ReentryWarningModal: React.FC<ReentryWarningModalProps> = ({
  isOpen,
  projects,
  sheetName = 'Project Tracker',
  onCancel,
  onConfirmNewVersion,
  onConfirmForCorrection,
  onContinue,
}) => {
  if (!isOpen || projects.length === 0) return null;

  const isMultiple = projects.length > 1;
  const primary = projects[0];

  const handleForCorrection = () => {
    if (onConfirmForCorrection) {
      onConfirmForCorrection();
    } else if (onContinue) {
      onContinue('for_correction');
    }
  };

  const handleNewVersion = () => {
    if (onConfirmNewVersion) {
      onConfirmNewVersion();
    } else if (onContinue) {
      onContinue('new_version');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reentry-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-amber-300 w-full max-w-xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
        {/* Warning Header */}
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/15 border-b border-amber-200 px-6 py-4 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-50 stroke-[2.5]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 mb-1">
              <span>Existing Record Detected</span>
            </div>
            <h2 id="reentry-modal-title" className="text-base font-bold text-slate-900 leading-tight">
              {isMultiple
                ? `${projects.length} Existing Project Numbers Found in Tracker`
                : `Project ${primary.projectNumber} Already Exists in Sheets`}
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Choose whether to advance to a <strong className="text-amber-800">New Version</strong> or log as <strong className="text-blue-800">For Correction</strong> (retains current version):
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
            title="Cancel"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Project Cards */}
        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {projects.map((proj, idx) => {
            const currentVer = proj.currentVersion || 'Initial';
            const nextVer = proj.suggestedVersion;
            return (
              <div
                key={proj.id || idx}
                className="bg-slate-50/90 rounded-xl border border-slate-200 p-4 space-y-3"
              >
                {/* Top line: Project Number & Record Count */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center border border-amber-300 shrink-0">
                      <Hash className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-mono text-sm font-extrabold text-slate-900 tracking-wide">
                      {proj.projectNumber}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                    <History className="w-3 h-3 text-amber-700" />
                    <span>
                      {proj.existingCount} existing {proj.existingCount === 1 ? 'record' : 'records'} in {proj.sheetName || sheetName}
                    </span>
                  </span>
                </div>

                {/* Optional Study / Source note */}
                {(proj.study || proj.sourceFile) && (
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
                    {proj.study && (
                      <span>
                        Study: <strong className="text-slate-700">{proj.study}</strong>
                      </span>
                    )}
                    {proj.sourceFile && (
                      <span className="truncate max-w-xs" title={proj.sourceFile}>
                        • File: <span className="text-slate-700">{proj.sourceFile}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Option Cards Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Option 1: New Version */}
                  <div
                    onClick={handleNewVersion}
                    className="group bg-white hover:bg-amber-50/70 border border-amber-200 hover:border-amber-400 rounded-xl p-3 flex flex-col justify-between transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                    title={`Advance to new version ${nextVer}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                          <GitBranch className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                          <span>Advance Version</span>
                        </span>
                        <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded border border-amber-200">
                          Option 1
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">New Version:</span>
                          <span className="font-mono text-xs font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                            {nextVer}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">Job Type:</span>
                          <span className="font-bold text-slate-800 text-xs">
                            Re-PSU (Revised)
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-700/80 mt-2 italic border-t border-amber-100 pt-1">
                      Increments version sequence for new schedule revisions.
                    </p>
                  </div>

                  {/* Option 2: For Correction */}
                  <div
                    onClick={handleForCorrection}
                    className="group bg-white hover:bg-blue-50/70 border border-blue-200 hover:border-blue-400 rounded-xl p-3 flex flex-col justify-between transition-all cursor-pointer shadow-2xs hover:shadow-xs"
                    title={`Log as For Correction with version ${currentVer}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                          <FileEdit className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
                          <span>For Correction</span>
                        </span>
                        <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded border border-blue-200">
                          Option 2
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">Retain Version:</span>
                          <span className="font-mono text-xs font-extrabold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                            {currentVer}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500 font-medium">Job Type:</span>
                          <span className="font-bold text-blue-700 text-xs">
                            For Correction
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-blue-700/80 mt-2 italic border-t border-blue-100 pt-1">
                      Retains current/recent version ({currentVer}) as a correction.
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-xl border border-slate-300 shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer order-last sm:order-first"
          >
            <Ban className="w-3.5 h-3.5 text-slate-500" />
            <span>Cancel</span>
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={handleForCorrection}
              className="px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <FileEdit className="w-3.5 h-3.5 text-white" />
              <span>
                {isMultiple
                  ? `For Correction (Retain Current Ver)`
                  : `For Correction (${primary.currentVersion || 'Initial'})`}
              </span>
            </button>

            <button
              type="button"
              onClick={handleNewVersion}
              className="px-4 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              <GitBranch className="w-3.5 h-3.5 text-white" />
              <span>
                {isMultiple
                  ? `New Version (${projects.length} Revisions)`
                  : `New Version (${primary.suggestedVersion})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
