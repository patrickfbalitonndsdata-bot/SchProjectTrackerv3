/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Zap,
  Copy,
  Check,
  FileSpreadsheet,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { HeroBanner } from './components/HeroBanner';
import { FileUploader } from './components/FileUploader';
import { PsuForm } from './components/PsuForm';
import { RecentEntries, DEFAULT_INITIAL_ENTRIES } from './components/RecentEntries';
import { SheetMirrorViewer } from './components/SheetMirrorViewer';
import { SheetSettingsModal } from './components/SheetSettingsModal';
import { AppsScriptSetupModal } from './components/AppsScriptSetupModal';
import { PasswordPromptModal } from './components/PasswordPromptModal';
import { ReentryWarningModal, ExistingProjectReentryInfo, ReentryDecision } from './components/ReentryWarningModal';
import { PsuFormData, ParseResult, SheetConfig } from './types';
import { getManilaNow, formatTimeToAmPm } from './lib/dateUtils';
import { isRevisedVersion } from './lib/roster';
import {
  FIXED_SHEET_CONFIG,
  FIXED_SPREADSHEET_URL,
  FIXED_APPS_SCRIPT_URL,
  FIXED_SHEET_NAME,
  FIXED_SPREADSHEET_ID,
  STORAGE_KEY_APPS_SCRIPT_URL,
  APPS_SCRIPT_TEMPLATE_CODE,
  calculateProjectVersion,
  getCurrentProjectVersion,
} from './lib/sheetsApi';

const STORAGE_KEY_SHEET_CONFIG = 'psu_logger_sheet_config';
const STORAGE_KEY_USER_EMAIL = 'psu_user_logger_email';

export default function App() {
  // Logger email state (No Google login required)
  const [userEmail, setUserEmail] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER_EMAIL);
      if (saved) return saved;
    } catch {}
    return 'ptrckzy@gmail.com';
  });

  // Google Sheet & Apps Script configuration with locked defaults to prevent accidental removal
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHEET_CONFIG);
      const savedAppsScript = localStorage.getItem(STORAGE_KEY_APPS_SCRIPT_URL);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...FIXED_SHEET_CONFIG,
          ...parsed,
          appsScriptUrl: (savedAppsScript || parsed.appsScriptUrl || FIXED_APPS_SCRIPT_URL).trim() || FIXED_APPS_SCRIPT_URL,
          sheetName: FIXED_SHEET_NAME,
          spreadsheetId: FIXED_SPREADSHEET_ID,
          spreadsheetUrl: FIXED_SPREADSHEET_URL,
        };
      }
      if (savedAppsScript) {
        return {
          ...FIXED_SHEET_CONFIG,
          appsScriptUrl: savedAppsScript.trim() || FIXED_APPS_SCRIPT_URL,
        };
      }
    } catch {}
    return FIXED_SHEET_CONFIG;
  });

  const [isSheetSettingsOpen, setIsSheetSettingsOpen] = useState<boolean>(false);
  const [isAppsScriptModalOpen, setIsAppsScriptModalOpen] = useState<boolean>(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState<boolean>(false);
  const [pendingProtectedAction, setPendingProtectedAction] = useState<'appsScript' | 'sheetSettings' | null>(null);
  const [codeCopiedBanner, setCodeCopiedBanner] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'entry' | 'mirror'>('entry');

  // Reentry Warning Modal State
  const [reentryModalState, setReentryModalState] = useState<{
    isOpen: boolean;
    projects: ExistingProjectReentryInfo[];
    resolver?: (decision: ReentryDecision) => void;
  } | null>(null);

  // Set of confirmed reentry project numbers for this session
  const confirmedProjectsRef = React.useRef<Set<string>>(new Set());

  const requestReentryConfirm = (
    projects: ExistingProjectReentryInfo[]
  ): Promise<ReentryDecision> => {
    return new Promise<ReentryDecision>((resolve) => {
      setReentryModalState({
        isOpen: true,
        projects,
        resolver: resolve,
      });
    });
  };

  const handleReentryNewVersion = () => {
    if (reentryModalState?.resolver) {
      reentryModalState.resolver('new_version');
    }
    setReentryModalState(null);
  };

  const handleReentryForCorrection = () => {
    if (reentryModalState?.resolver) {
      reentryModalState.resolver('for_correction');
    }
    setReentryModalState(null);
  };

  const handleReentryCancel = () => {
    if (reentryModalState?.resolver) {
      reentryModalState.resolver('cancel');
    }
    setReentryModalState(null);
  };

  const handleRequestAppsScriptSetup = () => {
    setPendingProtectedAction('appsScript');
    setIsPasswordModalOpen(true);
  };

  const handleRequestSheetSettings = () => {
    setPendingProtectedAction('sheetSettings');
    setIsPasswordModalOpen(true);
  };

  const handlePasswordSuccess = () => {
    const action = pendingProtectedAction;
    setIsPasswordModalOpen(false);
    setPendingProtectedAction(null);
    if (action === 'appsScript') {
      setIsAppsScriptModalOpen(true);
    } else if (action === 'sheetSettings') {
      setIsSheetSettingsOpen(true);
    }
  };

  // Current parsed email / PDF metadata
  const [currentResult, setCurrentResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);

  // Form Data State
  const initialManila = getManilaNow();
  const [formData, setFormData] = useState<PsuFormData>({
    emailAddress: '',
    scheduler: '',
    region: '',
    psuReceivedDate: initialManila.dateStr,
    psuReceivedTime: initialManila.timeStr,
    projectNumber: '',
    study: '',
    jobType: 'New Installs',
    version: '',
    projects: [
      {
        id: 'proj-1',
        projectNumber: '',
        study: '',
        version: 'Initial',
        jobType: 'New Installs',
      },
    ],
    category: '',
    reason: '',
    remarks: '',
  });

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string } | null>(null);

  const handleUserEmailChange = (newEmail: string) => {
    setUserEmail(newEmail);
    try {
      localStorage.setItem(STORAGE_KEY_USER_EMAIL, newEmail);
    } catch {}
    // Note: formData.emailAddress is strictly auto-assigned and locked by the selected Scheduler Name
  };

  const handleSaveAppsScriptUrl = (url: string) => {
    const updated = {
      ...sheetConfig,
      appsScriptUrl: url,
    };
    setSheetConfig(updated);
    try {
      localStorage.setItem(STORAGE_KEY_APPS_SCRIPT_URL, url);
      localStorage.setItem(STORAGE_KEY_SHEET_CONFIG, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save apps script config:', err);
    }
    setRefreshTrigger((prev) => prev + 1);
    setToastMessage({
      title: 'Apps Script API Connected',
      desc: 'Your Google Apps Script Web App API is configured to append rows to your private sheet.',
    });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleSaveSheetConfig = (newConfig: SheetConfig) => {
    setSheetConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY_SHEET_CONFIG, JSON.stringify(newConfig));
    } catch (err) {
      console.warn('Failed to save sheet config to localStorage:', err);
    }
    setRefreshTrigger((prev) => prev + 1);
    setToastMessage({
      title: 'Target Sheet Settings Updated',
      desc: `Connected to "${newConfig.spreadsheetTitle || newConfig.sheetName}".`,
    });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // When a file is parsed, populate the form and determine the version from the sheet
  const handleParsed = async (result: ParseResult) => {
    setCurrentResult(result);

    const ext = result.extractedData;
    const targetRegion = ext.region !== undefined && ext.region !== '' ? ext.region : formData.region;
    const defaultInitialVersion = 'Initial';

    // Prepare projects list from ext.projects or fallback
    let rawProjects = Array.isArray(ext.projects) && ext.projects.length > 0
      ? ext.projects.map((p, idx) => ({
          id: p.id || `proj-${idx + 1}`,
          projectNumber: p.projectNumber || '',
          study: p.study || ext.study || '',
          version: p.version ? (p.version.trim().toLowerCase() === 'initial' ? 'Initial' : p.version) : defaultInitialVersion,
          jobType: p.jobType || 'New Installs',
          sourceFile: p.sourceFile || '',
        }))
      : ext.projectNumber
      ? [
          {
            id: 'proj-1',
            projectNumber: ext.projectNumber,
            study: ext.study || '',
            version: ext.version || defaultInitialVersion,
            jobType: ext.jobType || 'New Installs',
          },
        ]
      : [
          {
            id: 'proj-1',
            projectNumber: '',
            study: '',
            version: defaultInitialVersion,
            jobType: 'New Installs',
          },
        ];

    // Determine versions for all projects against Google Sheets
    let resolvedProjects = await Promise.all(
      rawProjects.map(async (proj) => {
        let pVersion = proj.version || defaultInitialVersion;
        let existingCount = 0;
        let curVersion = defaultInitialVersion;
        if (proj.projectNumber && proj.projectNumber.trim()) {
          try {
            const { version, existingCount: count, currentVersion } = await calculateProjectVersion(
              sheetConfig.spreadsheetId,
              sheetConfig.sheetName,
              proj.projectNumber.trim(),
              null,
              sheetConfig.appsScriptUrl,
              DEFAULT_INITIAL_ENTRIES,
              targetRegion
            );
            pVersion = version;
            existingCount = count;
            curVersion = currentVersion;
          } catch (err) {
            console.warn('Could not auto-calculate version on parse for', proj.projectNumber, err);
          }
        }
        if (proj.jobType === 'For Correction') {
          return {
            ...proj,
            version: curVersion,
            jobType: 'For Correction',
            existingCount,
          };
        }
        const pIsRev = isRevisedVersion(pVersion);
        return {
          ...proj,
          version: pVersion,
          jobType: pIsRev ? 'Re-PSU (Revised)' : 'New Installs',
          existingCount,
        };
      })
    );

    // Check for any duplicate / existing project numbers
    const existingDuplicates = resolvedProjects.filter(
      (p) => (p.existingCount || 0) > 0 && p.projectNumber && p.projectNumber.trim().length > 0
    );

    if (existingDuplicates.length > 0) {
      const duplicateInfos: ExistingProjectReentryInfo[] = existingDuplicates.map((p) => ({
        id: p.id,
        projectNumber: p.projectNumber,
        existingCount: p.existingCount || 1,
        suggestedVersion: p.version,
        currentVersion: getCurrentProjectVersion(p.existingCount || 1, targetRegion),
        targetJobType: 'Re-PSU (Revised)',
        correctionJobType: 'For Correction',
        sheetName: sheetConfig.sheetName,
        study: p.study,
        sourceFile: p.sourceFile,
        source: 'file_parse',
      }));

      const decision = await requestReentryConfirm(duplicateInfos);
      if (!decision || decision === 'cancel') {
        // Option "Cancel" which will not go through
        setCurrentResult(null);
        const dupNumbers = existingDuplicates.map((p) => p.projectNumber).join(', ');
        setToastMessage({
          title: 'Reentry Cancelled',
          desc: `Project ${dupNumbers} already exists in "${sheetConfig.sheetName}". Reentry was cancelled and form was not populated.`,
        });
        setTimeout(() => setToastMessage(null), 5000);
        return;
      }

      if (decision === 'for_correction') {
        // Option "For Correction": retain current/recent version and set Job Type to "For Correction"
        resolvedProjects = resolvedProjects.map((p) => {
          if ((p.existingCount || 0) > 0) {
            const currentVer = getCurrentProjectVersion(p.existingCount || 1, targetRegion);
            return {
              ...p,
              version: currentVer,
              jobType: 'For Correction',
            };
          }
          return p;
        });

        setToastMessage({
          title: 'Logged as For Correction',
          desc: `Retained current version for existing project(s) and set Job Type to "For Correction".`,
        });
        setTimeout(() => setToastMessage(null), 5000);
      } else {
        // Option "New Version": advance to next revision version
        setToastMessage({
          title: 'Advance to New Version',
          desc: `Existing project(s) advanced to new revision version (Job Type: Re-PSU (Revised)).`,
        });
        setTimeout(() => setToastMessage(null), 5000);
      }

      existingDuplicates.forEach((p) =>
        confirmedProjectsRef.current.add(p.projectNumber.trim().toLowerCase())
      );
    }

    const primaryProject = resolvedProjects[0];
    const primaryNumber = primaryProject?.projectNumber || ext.projectNumber || '';
    const primaryStudy = primaryProject?.study || ext.study || '';
    const primaryVersion = primaryProject?.version || defaultInitialVersion;
    const primaryJobType = primaryProject?.jobType || (isRevisedVersion(primaryVersion) ? 'Re-PSU (Revised)' : 'New Installs');

    setFormData((prev) => ({
      ...prev,
      emailAddress: '', // Auto-assigned and locked when Scheduler Name is selected
      scheduler: '', // Left blank for user's input as instructed
      region: '', // Region strictly follows selected scheduler
      psuReceivedDate: ext.psuReceivedDate || result.metadata.dateMnl || prev.psuReceivedDate,
      psuReceivedTime: formatTimeToAmPm(ext.psuReceivedTime || result.metadata.timeMnl || prev.psuReceivedTime),
      projectNumber: primaryNumber,
      study: primaryStudy,
      jobType: primaryJobType,
      version: primaryVersion,
      projects: resolvedProjects,
      category: '', // Left blank for user's manual selection
      reason: '', // Left blank for user's manual input
      remarks: '', // Left blank for user's input as instructed
    }));

    const projectNames = resolvedProjects.map((p) => p.projectNumber).filter(Boolean).join(', ');
    setToastMessage({
      title: 'Email & PDF Parsed Successfully',
      desc: `Extracted ${resolvedProjects.length} ${resolvedProjects.length === 1 ? 'project' : 'projects'} from ${result.metadata.fileName}${
        projectNames ? ` (${projectNames})` : ''
      }.`,
    });

    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  const handleResetForm = () => {
    const now = getManilaNow();
    setFormData({
      emailAddress: '',
      scheduler: '',
      region: '',
      psuReceivedDate: now.dateStr,
      psuReceivedTime: now.timeStr,
      projectNumber: '',
      study: '',
      jobType: 'New Installs',
      version: '',
      projects: [
        {
          id: 'proj-1',
          projectNumber: '',
          study: '',
          version: 'Initial',
          jobType: 'New Installs',
        },
      ],
      category: '',
      reason: '',
      remarks: '',
    });
    confirmedProjectsRef.current.clear();
    setCurrentResult(null);
  };

  const handleSuccessAppend = (updatedRange: string) => {
    setRefreshTrigger((prev) => prev + 1);
    setToastMessage({
      title: 'Logged to Google Sheet',
      desc: `PSU entry successfully appended to "${sheetConfig.sheetName}" via Google Apps Script. (${updatedRange})`,
    });

    // Automatically clear the form after successful submission
    handleResetForm();

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleCopyScriptFromBanner = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE_CODE);
    setCodeCopiedBanner(true);
    setTimeout(() => setCodeCopiedBanner(false), 2500);
  };

  const isConnected = Boolean(sheetConfig.appsScriptUrl);

  const handleHeroLogPsu = () => {
    setActiveTab('entry');
    setTimeout(() => {
      const formEl = document.getElementById('psu-form-section');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleHeroExploreSheet = () => {
    setActiveTab('mirror');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHeroUpload = () => {
    setActiveTab('entry');
    setTimeout(() => {
      const dropZone = document.getElementById('file-drop-zone');
      if (dropZone) {
        dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleHeroViewRevisions = () => {
    setActiveTab('entry');
    setTimeout(() => {
      const recentEl = document.getElementById('recent-sheet-section');
      if (recentEl) {
        recentEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        appsScriptConnected={isConnected}
        onOpenAppsScriptSetup={handleRequestAppsScriptSetup}
        sheetTitle={sheetConfig.spreadsheetTitle || sheetConfig.sheetName}
        sheetUrl={sheetConfig.spreadsheetUrl}
        userEmail={userEmail}
        onChangeUserEmail={handleUserEmailChange}
        onOpenSheetSettings={handleRequestSheetSettings}
      />

      {/* Full-width Integrated Background Hero with Fading Gradient (Visible only on PSU Entry tab) */}
      {activeTab === 'entry' && (
        <HeroBanner
          onLogPsuClick={handleHeroLogPsu}
          onExploreSheetClick={handleHeroExploreSheet}
          onUploadClick={handleHeroUpload}
          onViewRevisionsClick={handleHeroViewRevisions}
          appsScriptConnected={isConnected}
          sheetUrl={sheetConfig.spreadsheetUrl}
        />
      )}

      {/* Main Content Workspace Container - Smoothly floats over bottom fade when Hero is present */}
      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6 relative z-10 ${
          activeTab === 'entry' ? '-mt-6 sm:-mt-12' : 'pt-4 sm:pt-6'
        }`}
      >
        {/* Toast alert */}
        {toastMessage && (
          <div className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center space-x-3 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold tracking-wide uppercase">{toastMessage.title}: </span>
                <span className="text-slate-300 font-normal">{toastMessage.desc}</span>
              </div>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-slate-400 hover:text-white text-xs ml-4"
            >
              &times;
            </button>
          </div>
        )}

        {/* Apps Script Setup Banner if not configured */}
        {!isConnected && (
          <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white border border-blue-700/60 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-blue-950/80 border border-blue-700/70 rounded-xl text-sky-300 shrink-0 mt-0.5">
                <Zap className="w-5 h-5 text-sky-300 animate-pulse" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <span>Connect Google Apps Script Web App API</span>
                  <span className="px-2 py-0.5 bg-blue-800/80 text-blue-200 text-[9px] rounded-sm font-bold tracking-widest uppercase border border-blue-600">
                    No Sign-In Required
                  </span>
                </h4>
                <p className="text-xs text-blue-100/90 mt-1 leading-relaxed">
                  The app communicates via: <strong className="text-white">React &rarr; Google Apps Script &rarr; Private Google Sheet</strong>.
                  Paste the deployment script into your Google Sheet to enable direct automated logging.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
              <button
                type="button"
                onClick={handleCopyScriptFromBanner}
                className="px-3.5 py-2 bg-blue-950/90 border border-blue-600 hover:bg-blue-900 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                {codeCopiedBanner ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-blue-300" />}
                <span>{codeCopiedBanner ? 'Copied Script!' : 'Copy Script'}</span>
              </button>
              <button
                type="button"
                onClick={handleRequestAppsScriptSetup}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-white" />
                <span>Setup Web App URL</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: PSU Entry Submission & Outlook/PDF Parser */}
        {activeTab === 'entry' ? (
          <div className="space-y-6">
            {/* 2-Column Work Area: Left (Parser / Upload), Right (PSU Form) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: File Uploader & Email Details (5 cols on large) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 bg-blue-600 text-white flex items-center justify-center rounded-lg shadow-xs">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-display">
                          Outlook Email &amp; PDF Parser
                        </h2>
                        <span className="text-[10px] text-slate-500 font-medium tracking-wide">
                          Instant field extraction &amp; Page 1 OCR crop
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-blue-700 font-bold uppercase tracking-widest px-2.5 py-1 bg-blue-50 rounded-md border border-blue-200 shadow-2xs">Step 1</span>
                  </div>

                  <FileUploader
                    onParsed={handleParsed}
                    isParsing={isParsing}
                    setIsParsing={setIsParsing}
                    currentResult={currentResult}
                  />
                </div>
              </div>

              {/* Right Column: Submission Form (7 cols on large) */}
              <div id="psu-form-section" className="lg:col-span-7 scroll-mt-20">
                <PsuForm
                  formData={formData}
                  onChange={setFormData}
                  onReset={handleResetForm}
                  sheetConfig={sheetConfig}
                  userEmail={userEmail}
                  onSuccessAppend={handleSuccessAppend}
                  onOpenAppsScriptSetup={handleRequestAppsScriptSetup}
                  onSyncSheetConfig={handleSaveSheetConfig}
                  recentEntries={DEFAULT_INITIAL_ENTRIES}
                  attachments={currentResult?.metadata?.attachments || []}
                  onRequestReentryConfirm={requestReentryConfirm}
                  confirmedProjectsRef={confirmedProjectsRef}
                  onShowToast={setToastMessage}
                />
              </div>
            </div>

            {/* Bottom Section: Quick Preview of Sheet with Switch to Full Mirror */}
            <section id="recent-sheet-section" className="pt-2 scroll-mt-20">
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <span>Recent Sheet Activity</span>
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 rounded-md border border-blue-200 uppercase font-mono">
                      Audit Stream
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Quick view of recently logged entries in Google Sheets</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('mirror')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-blue-700 hover:text-white bg-white hover:bg-blue-600 border border-blue-300 hover:border-blue-600 rounded-lg transition-all shadow-2xs group cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                  <span>Open Full Sheet Mirror Viewer Tab &rarr;</span>
                </button>
              </div>
              <RecentEntries
                sheetConfig={sheetConfig}
                refreshTrigger={refreshTrigger}
                onOpenAppsScriptSetup={handleRequestAppsScriptSetup}
                onViewAllInMirror={() => setActiveTab('mirror')}
              />
            </section>
          </div>
        ) : (
          /* Tab 2: Full Google Sheet Mirror Viewer */
          <section className="space-y-4">
            <SheetMirrorViewer
              sheetConfig={sheetConfig}
              refreshTrigger={refreshTrigger}
              onOpenAppsScriptSetup={handleRequestAppsScriptSetup}
              onSwitchToEntryTab={() => setActiveTab('entry')}
            />
          </section>
        )}
      </main>

      {/* Unified Editorial Light Blue / Slate Footer */}
      <footer className="mt-16 border-t border-blue-100 bg-white/90 backdrop-blur-md text-slate-600 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5 flex-wrap justify-center md:justify-start">
              <span className="font-display font-bold text-slate-900 text-xs tracking-wider uppercase">
                SCH <span className="text-blue-600">Project Tracker</span>
              </span>
              <span className="text-slate-300 font-mono text-[10px]">&bull;</span>
              <span className="text-slate-500 text-[11px]">
                &copy; {new Date().getFullYear()} All rights reserved.
              </span>
            </div>

            <div className="flex items-center space-x-3 text-slate-500 text-[10.5px] font-mono flex-wrap justify-center">
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                Apps Script Connected
              </span>
            </div>
          </div>

          {/* Discreet Developer Watermark */}
          <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] text-slate-400 font-mono select-none">
            <span className="tracking-wider uppercase text-[9.5px] text-slate-400">
              Direct Google Sheet Integration
            </span>
            <span className="tracking-wide text-slate-500 hover:text-blue-600 transition-colors">
              Developers: Patrick Franz O.B. and John B.
            </span>
          </div>
        </div>
      </footer>

      {/* Protected Settings Password Verification Modal */}
      <PasswordPromptModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingProtectedAction(null);
        }}
        onSuccess={handlePasswordSuccess}
        targetFeatureName={
          pendingProtectedAction === 'appsScript'
            ? 'Apps Script API Setup'
            : 'Sheet Link & Tab Settings'
        }
      />

      {/* Google Apps Script Web App API Setup Modal */}
      <AppsScriptSetupModal
        isOpen={isAppsScriptModalOpen}
        onClose={() => setIsAppsScriptModalOpen(false)}
        config={sheetConfig}
        onSaveAppsScriptUrl={handleSaveAppsScriptUrl}
        onSyncSheetConfig={handleSaveSheetConfig}
      />

      {/* Target Google Sheet Connection Settings Modal */}
      <SheetSettingsModal
        isOpen={isSheetSettingsOpen}
        onClose={() => setIsSheetSettingsOpen(false)}
        config={sheetConfig}
        onSaveConfig={handleSaveSheetConfig}
        onRequireAuth={handleRequestAppsScriptSetup}
      />

      {/* Existing Project Number Reentry Warning Modal */}
      {reentryModalState && (
        <ReentryWarningModal
          isOpen={reentryModalState.isOpen}
          projects={reentryModalState.projects}
          sheetName={sheetConfig.sheetName}
          onCancel={handleReentryCancel}
          onConfirmNewVersion={handleReentryNewVersion}
          onConfirmForCorrection={handleReentryForCorrection}
        />
      )}
    </div>
  );
}
