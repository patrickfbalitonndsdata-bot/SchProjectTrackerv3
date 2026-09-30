import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Globe,
  Hash,
  BookOpen,
  Briefcase,
  GitBranch,
  Tag,
  HelpCircle,
  MessageSquare,
  AlertCircle,
  Check,
  RefreshCw,
  ExternalLink,
  Mail,
  Plus,
  Trash2,
  Layers,
  Paperclip,
  Lock,
  ChevronDown,
  Sparkles,
  Eye,
  History,
  X,
} from 'lucide-react';
import { PsuFormData, SheetConfig, SheetEntryRow, AppendResult, ProjectItem, AttachmentInfo } from '../types';
import { appendPsuEntries, calculateProjectVersion, formatProjectVersion, getCurrentProjectVersion, FIXED_SPREADSHEET_URL, FIXED_SHEET_NAME } from '../lib/sheetsApi';
import { PdfViewerModal } from './PdfViewerModal';
import { SubmissionSuccessModal } from './SubmissionSuccessModal';
import { ExistingProjectReentryInfo, ReentryDecision } from './ReentryWarningModal';
import {
  SCHEDULER_ROSTER,
  getSchedulerEmail,
  getSchedulerAssignedRegions,
  PSU_CATEGORIES,
  PSU_REASONS,
  CATEGORY_RECOMMENDED_REASONS,
  COMMON_REGIONS,
  JOB_TYPES,
  isRevisedVersion,
  STUDY_TYPE_KEYWORDS,
  normalizeStudyType,
  SECONDARY_STUDY_KEYWORDS,
} from '../lib/roster';

interface PsuFormProps {
  formData: PsuFormData;
  onChange: (data: PsuFormData) => void;
  onReset: () => void;
  sheetConfig: SheetConfig;
  userEmail: string;
  onSuccessAppend: (updatedRange: string) => void;
  onOpenAppsScriptSetup: () => void;
  onSyncSheetConfig?: (newConfig: SheetConfig) => void;
  accessToken?: string | null;
  recentEntries?: SheetEntryRow[];
  attachments?: AttachmentInfo[];
  onRequestReentryConfirm?: (projects: ExistingProjectReentryInfo[]) => Promise<ReentryDecision | boolean>;
  confirmedProjectsRef?: React.MutableRefObject<Set<string>>;
  onShowToast?: (msg: { title: string; desc: string }) => void;
}

export const PsuForm: React.FC<PsuFormProps> = ({
  formData,
  onChange,
  onReset,
  sheetConfig,
  userEmail,
  onSuccessAppend,
  onOpenAppsScriptSetup,
  onSyncSheetConfig,
  accessToken,
  recentEntries = [],
  attachments = [],
  onRequestReentryConfirm,
  confirmedProjectsRef,
  onShowToast,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<AppendResult | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isCustomReason, setIsCustomReason] = useState<boolean>(false);
  const [showOtherReasonsDropdown, setShowOtherReasonsDropdown] = useState<boolean>(false);
  const [openStudyPickerId, setOpenStudyPickerId] = useState<string | null>(null);
  const [showKeywordChips, setShowKeywordChips] = useState<boolean>(false);
  const [viewingAttachment, setViewingAttachment] = useState<AttachmentInfo | null>(null);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Per-project version checking status map
  const [projectVersionStatuses, setProjectVersionStatuses] = useState<
    Record<string, { count: number; suggestedVersion: string; loading?: boolean; isCorrection?: boolean }>
  >({});

  const fallbackConfirmedRef = React.useRef<Set<string>>(new Set());
  const confirmedProjects = confirmedProjectsRef || fallbackConfirmedRef;
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasApiConnection = Boolean(sheetConfig.appsScriptUrl || accessToken);

  // Normalize projects list ensuring at least 1 project item exists
  const projectsList: ProjectItem[] =
    formData.projects && formData.projects.length > 0
      ? formData.projects
      : [
          {
            id: 'proj-1',
            projectNumber: formData.projectNumber || '',
            study: formData.study || '',
            version:
              formData.version
                ? formData.version.trim().toLowerCase() === 'initial'
                  ? 'Initial'
                  : formData.version
                : 'Initial',
            jobType: formData.jobType || 'New Installs',
          },
        ];

  // Helper to add another project
  const handleAddProject = () => {
    const newProject: ProjectItem = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectNumber: '',
      study: '',
      version: 'Initial',
      jobType: 'New Installs',
    };
    const updated = [...projectsList, newProject];
    onChange({
      ...formData,
      projects: updated,
    });
  };

  // Helper to remove a project
  const handleRemoveProject = (id: string) => {
    if (projectsList.length <= 1) return;
    const updated = projectsList.filter((p) => p.id !== id);
    const primary = updated[0];
    onChange({
      ...formData,
      projectNumber: primary?.projectNumber || '',
      study: primary?.study || '',
      version: primary?.version || '',
      jobType: primary?.jobType || 'New Installs',
      projects: updated,
    });
  };

  // Helper to update a project's field
  const handleUpdateProjectField = (id: string, field: keyof ProjectItem, value: string) => {
    const updated = projectsList.map((p) => {
      if (p.id !== id) return p;
      let finalVal = value;
      if (field === 'version' && value.trim().toLowerCase() === 'initial') {
        finalVal = 'Initial';
      }
      const modified = { ...p, [field]: finalVal };
      if (field === 'jobType') {
        if (value === 'For Correction') {
          // Only implement this for "For Correction" Job Type:
          // Retain current/recent version
          const status = projectVersionStatuses[id];
          const priorCount = status?.count ?? 0;
          if (priorCount > 0) {
            modified.version = getCurrentProjectVersion(priorCount, formData.region);
          } else if (!modified.version || isRevisedVersion(modified.version)) {
            modified.version = 'Initial';
          }
        }
      }
      if (field === 'version') {
        // Only auto-switch jobType if NOT 'For Correction'
        if (modified.jobType !== 'For Correction') {
          const isRev = isRevisedVersion(finalVal);
          modified.jobType = isRev
            ? 'Re-PSU (Revised)'
            : modified.jobType === 'Re-PSU (Revised)'
            ? 'New Installs'
            : modified.jobType || 'New Installs';
        }
      }
      return modified;
    });

    const primary = updated[0];
    onChange({
      ...formData,
      projectNumber: primary?.projectNumber || '',
      study: primary?.study || '',
      version: primary?.version || '',
      jobType: primary?.jobType || 'New Installs',
      projects: updated,
    });

    // If project number changed, debounce version check for this project
    if (field === 'projectNumber') {
      const trimmed = value.trim();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (trimmed.length >= 4) {
        typingTimeoutRef.current = setTimeout(() => {
          checkSingleProjectVersion(id, trimmed);
        }, 600);
      }
    }
  };

  // Check version against Google Sheet for a specific project
  const checkSingleProjectVersion = async (
    pId: string,
    pNumber: string,
    isSilentSync: boolean = false
  ) => {
    const trimmed = pNumber.trim();
    if (!trimmed) return;

    setProjectVersionStatuses((prev) => ({
      ...prev,
      [pId]: { ...(prev[pId] || { count: 0, suggestedVersion: '' }), loading: true },
    }));

    try {
      const { version, existingCount, currentVersion } = await calculateProjectVersion(
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName || 'Project Tracker',
        trimmed,
        accessToken,
        sheetConfig.appsScriptUrl,
        recentEntries,
        formData.region
      );

      const curProj = projectsList.find((p) => p.id === pId);
      const isForCorrection =
        curProj?.jobType === 'For Correction' || (!curProj && formData.jobType === 'For Correction');

      // CRITICAL REQUIREMENT:
      // When the google sheet syncs, The version of the Project Number that has a Job Type of "For Correction" Status
      // should NOT be overwritten and will retain as the current/recent version even when synced.
      // Only implement this for "For Correction" Job Type.
      if (isForCorrection) {
        const retainedVersion =
          currentVersion ||
          (existingCount > 0
            ? getCurrentProjectVersion(existingCount, formData.region)
            : curProj?.version || 'Initial');

        setProjectVersionStatuses((prev) => ({
          ...prev,
          [pId]: {
            count: existingCount,
            suggestedVersion: retainedVersion,
            isCorrection: true,
            loading: false,
          },
        }));

        const updated = projectsList.map((p) =>
          p.id === pId ? { ...p, version: retainedVersion, jobType: 'For Correction' } : p
        );
        const primary = updated[0];
        onChange({
          ...formData,
          projectNumber: primary?.projectNumber || '',
          study: primary?.study || '',
          version: primary?.version || retainedVersion,
          jobType: 'For Correction',
          projects: updated,
        });
        return;
      }

      setProjectVersionStatuses((prev) => ({
        ...prev,
        [pId]: { count: existingCount, suggestedVersion: version, loading: false },
      }));

      const isAlreadyConfirmed = confirmedProjects.current.has(trimmed.toLowerCase());

      // If existing project detected in Google Sheet and not yet confirmed:
      // Show warning modal with Cancel, New Version, or For Correction (retains current version)
      if (existingCount > 0 && !isAlreadyConfirmed && !isSilentSync && onRequestReentryConfirm) {
        const curProj = projectsList.find((p) => p.id === pId);
        const currentVer = getCurrentProjectVersion(existingCount, formData.region);
        const decision = await onRequestReentryConfirm([
          {
            id: pId,
            projectNumber: trimmed,
            existingCount,
            suggestedVersion: version,
            currentVersion: currentVer,
            targetJobType: 'Re-PSU (Revised)',
            correctionJobType: 'For Correction',
            sheetName: sheetConfig.sheetName,
            study: curProj?.study,
            sourceFile: curProj?.sourceFile,
            source: 'form_input',
          },
        ]);

        if (decision === 'for_correction') {
          // Option "For Correction": retain current/recent version and set Job Type to "For Correction"
          confirmedProjects.current.add(trimmed.toLowerCase());
          const updated = projectsList.map((p) =>
            p.id === pId ? { ...p, projectNumber: trimmed, version: currentVer, jobType: 'For Correction' } : p
          );
          const primary = updated[0];
          onChange({
            ...formData,
            projectNumber: primary?.projectNumber || '',
            study: primary?.study || '',
            version: primary?.version || currentVer,
            jobType: 'For Correction',
            projects: updated,
          });
          onShowToast?.({
            title: 'Logged as For Correction',
            desc: `Project ${trimmed} retained version "${currentVer}" with Job Type "For Correction".`,
          });
          return;
        } else if (decision === 'new_version' || decision === true) {
          // Option "New Version": advance to next revision version
          confirmedProjects.current.add(trimmed.toLowerCase());
          const isRev = isRevisedVersion(version);
          const nextJobType = isRev ? 'Re-PSU (Revised)' : 'New Installs';

          const updated = projectsList.map((p) =>
            p.id === pId ? { ...p, projectNumber: trimmed, version, jobType: nextJobType } : p
          );
          const primary = updated[0];
          onChange({
            ...formData,
            projectNumber: primary?.projectNumber || '',
            study: primary?.study || '',
            version: primary?.version || '',
            jobType: primary?.jobType || 'New Installs',
            projects: updated,
          });
          onShowToast?.({
            title: 'Advance to New Version',
            desc: `Project ${trimmed} advanced to revision ${version} (Job Type: Re-PSU (Revised)).`,
          });
          return;
        } else {
          // Option "Cancel" which will not go through: clear the project number
          confirmedProjects.current.delete(trimmed.toLowerCase());
          const updated = projectsList.map((p) =>
            p.id === pId ? { ...p, projectNumber: '', version: 'Initial', jobType: 'New Installs' } : p
          );
          const primary = updated[0];
          onChange({
            ...formData,
            projectNumber: primary?.projectNumber || '',
            study: primary?.study || '',
            version: primary?.version || 'Initial',
            jobType: primary?.jobType || 'New Installs',
            projects: updated,
          });
          setProjectVersionStatuses((prev) => {
            const next = { ...prev };
            delete next[pId];
            return next;
          });
          onShowToast?.({
            title: 'Reentry Cancelled',
            desc: `Project ${trimmed} cancelled. Project Number field cleared.`,
          });
          return;
        }
      }

      // Normal flow (initial or already confirmed)
      const currentProj = projectsList.find((item) => item.id === pId);
      if (currentProj && currentProj.jobType === 'For Correction') {
        return;
      }
      if (
        currentProj &&
        (!currentProj.version ||
          currentProj.version.toLowerCase() === 'initial' ||
          /^v\d+$/i.test(currentProj.version) ||
          currentProj.version.startsWith('('))
      ) {
        const isRev = isRevisedVersion(version);
        const nextJobType = isRev
          ? 'Re-PSU (Revised)'
          : currentProj.jobType === 'Re-PSU (Revised)'
          ? 'New Installs'
          : currentProj.jobType || 'New Installs';

        const updated = projectsList.map((p) =>
          p.id === pId ? { ...p, version, jobType: nextJobType } : p
        );
        const primary = updated[0];
        onChange({
          ...formData,
          projectNumber: primary?.projectNumber || '',
          study: primary?.study || '',
          version: primary?.version || '',
          jobType: primary?.jobType || 'New Installs',
          projects: updated,
        });
      }
    } catch (err) {
      console.warn('Project version check error:', err);
      setProjectVersionStatuses((prev) => ({
        ...prev,
        [pId]: { ...(prev[pId] || { count: 0, suggestedVersion: '' }), loading: false },
      }));
    }
  };

  // Check versions for all projects when Region changes (silent sync)
  useEffect(() => {
    const timer = setTimeout(() => {
      projectsList.forEach((proj) => {
        if (proj.projectNumber && proj.projectNumber.trim()) {
          checkSingleProjectVersion(proj.id, proj.projectNumber.trim(), true);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.region, sheetConfig.appsScriptUrl, sheetConfig.spreadsheetId, sheetConfig.sheetName]);

  const updateField = (field: keyof PsuFormData, value: string, _elementId?: string) => {
    if (field === 'category') {
      const isInitialCategory = value.trim().toLowerCase() === 'initial';
      if (isInitialCategory) {
        setIsCustomReason(false);
      }
      setShowOtherReasonsDropdown(false);
      onChange({
        ...formData,
        category: value,
        reason: isInitialCategory ? 'Initial' : formData.reason,
      });
      return;
    }
    onChange({
      ...formData,
      [field]: value,
    });
  };

  const handleSchedulerSelect = (selectedName: string) => {
    if (!selectedName) {
      onChange({
        ...formData,
        scheduler: '',
        emailAddress: '',
        region: '',
      });
      return;
    }

    const matched = SCHEDULER_ROSTER.find(
      (s) => s.name.toLowerCase() === selectedName.toLowerCase()
    );

    const assigned = matched?.regions && matched.regions.length > 0
      ? matched.regions
      : matched?.region ? [matched.region] : [];

    // If scheduler has multiple separated regions (e.g. Shane, Dwight, Marc, Jovie, John):
    // Do NOT join them together into a combined string.
    // If the currently selected region matches one of them, keep it; otherwise leave empty for user selection.
    let newRegion = '';
    if (assigned.length === 1) {
      newRegion = assigned[0];
    } else if (assigned.length > 1) {
      if (formData.region && assigned.some((r) => r.toLowerCase() === formData.region.trim().toLowerCase())) {
        newRegion = formData.region;
      } else {
        newRegion = '';
      }
    }

    const incorporatedEmail = matched?.email || getSchedulerEmail(selectedName) || '';

    onChange({
      ...formData,
      scheduler: matched ? matched.name : selectedName,
      emailAddress: incorporatedEmail,
      region: newRegion,
    });
  };

  // Keep email address strictly synchronized with the selected Scheduler Name
  useEffect(() => {
    if (formData.scheduler) {
      const email = getSchedulerEmail(formData.scheduler);
      if (email && formData.emailAddress !== email) {
        onChange({
          ...formData,
          emailAddress: email,
        });
      }
    } else if (formData.emailAddress) {
      onChange({
        ...formData,
        emailAddress: '',
      });
    }
  }, [formData.scheduler, formData.emailAddress]);

  // Active assigned regions for the selected scheduler
  const activeSchedulerRegions = useMemo(() => {
    return getSchedulerAssignedRegions(formData.scheduler);
  }, [formData.scheduler]);

  const isSheetReady = hasApiConnection;

  // Memoized recommended reasons for the active category
  const recommendedReasons = useMemo(() => {
    if (!formData.category) return [];
    return CATEGORY_RECOMMENDED_REASONS[formData.category] || [];
  }, [formData.category]);

  // All other reasons outside the recommended ones for the active category
  const otherReasonsList = useMemo(() => {
    return PSU_REASONS.filter((r) => !recommendedReasons.includes(r));
  }, [recommendedReasons]);

  // Whether the currently active reason is one of the "other" reasons
  const isOtherReasonActive = Boolean(formData.reason && otherReasonsList.includes(formData.reason));

  // Track all missing required fields before submission is allowed
  const missingFields: string[] = [];
  if (!formData.scheduler?.trim()) missingFields.push('Scheduler Name');
  if (!formData.emailAddress?.trim()) missingFields.push('Email Address');
  if (!formData.region?.trim()) missingFields.push('Region');
  if (!formData.psuReceivedDate?.trim()) missingFields.push('PSU Received Date');
  if (!formData.psuReceivedTime?.trim()) missingFields.push('PSU Received Time');

  const hasIncompleteProjects =
    projectsList.length === 0 ||
    projectsList.some(
      (p) =>
        !p.projectNumber?.trim() ||
        !p.study?.trim() ||
        !p.version?.trim() ||
        !p.jobType?.trim()
    );
  if (hasIncompleteProjects) {
    missingFields.push('Project item(s) Project #, Study, Job Type, & Version');
  }

  if (!formData.category?.trim()) missingFields.push('Category');
  if (!formData.reason?.trim()) missingFields.push('Reason');

  const isAllFieldsFilled = missingFields.length === 0;
  const isSubmitEnabled = isSheetReady && isAllFieldsFilled && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionSuccess(null);
    setSubmissionResult(null);
    setSubmissionError(null);

    if (!hasApiConnection) {
      onOpenAppsScriptSetup();
      return;
    }

    if (!isAllFieldsFilled) {
      setSubmissionError(
        `Please fill out all required fields before submitting: ${missingFields.join(', ')}.`
      );
      return;
    }

    const validProjects = projectsList.filter(
      (p) => p.projectNumber && p.projectNumber.trim().length > 0
    );

    if (validProjects.length === 0) {
      setSubmissionError('At least one Project Number is required.');
      return;
    }

    // Safety check for unconfirmed duplicates before submission
    if (onRequestReentryConfirm) {
      const unconfirmedDups: ExistingProjectReentryInfo[] = [];
      for (const proj of validProjects) {
        const pNum = proj.projectNumber.trim();
        // If already designated as "For Correction", its current version is retained and approved
        if (proj.jobType === 'For Correction') continue;
        if (confirmedProjects.current.has(pNum.toLowerCase())) continue;
        const status = projectVersionStatuses[proj.id];
        if (status && status.count > 0) {
          unconfirmedDups.push({
            id: proj.id,
            projectNumber: pNum,
            existingCount: status.count,
            suggestedVersion: status.suggestedVersion,
            currentVersion: getCurrentProjectVersion(status.count, formData.region),
            targetJobType: 'Re-PSU (Revised)',
            correctionJobType: 'For Correction',
            sheetName: sheetConfig.sheetName,
            study: proj.study,
            sourceFile: proj.sourceFile,
            source: 'form_input',
          });
        }
      }

      if (unconfirmedDups.length > 0) {
        const decision = await onRequestReentryConfirm(unconfirmedDups);
        if (!decision || decision === 'cancel') {
          setSubmissionError('Submission cancelled due to existing Project Number reentry.');
          return;
        }

        if (decision === 'for_correction') {
          for (const dup of unconfirmedDups) {
            const currentVer = dup.currentVersion || getCurrentProjectVersion(dup.existingCount, formData.region);
            const targetProj = validProjects.find(
              (p) => p.id === dup.id || p.projectNumber.trim().toLowerCase() === dup.projectNumber.trim().toLowerCase()
            );
            if (targetProj) {
              targetProj.version = currentVer;
              targetProj.jobType = 'For Correction';
            }
          }
          onChange({
            ...formData,
            jobType: 'For Correction',
            version: validProjects[0]?.version || formData.version,
            projects: validProjects,
          });
        }

        unconfirmedDups.forEach((p) => confirmedProjects.current.add(p.projectNumber.trim().toLowerCase()));
      }
    }

    // Default remarks to "N/A" if left blank by user
    const finalRemarks = formData.remarks?.trim() || 'N/A';

    setIsSubmitting(true);
    try {
      const targetSheetName = (sheetConfig.sheetName && sheetConfig.sheetName !== 'Scheduling Submission')
        ? sheetConfig.sheetName
        : FIXED_SHEET_NAME;

      const res = await appendPsuEntries(
        sheetConfig.spreadsheetId,
        targetSheetName,
        {
          ...formData,
          remarks: finalRemarks,
          projects: validProjects,
        },
        userEmail,
        accessToken,
        sheetConfig.appsScriptUrl,
        sheetConfig.spreadsheetUrl
      );

      setSubmissionResult(res);
      const rowCount = res.updatedRows || validProjects.length;
      if (rowCount > 1) {
        setSubmissionSuccess(
          `Successfully logged ${rowCount} project entries to "${res.sheetName || targetSheetName}" in Google Sheets!`
        );
      } else {
        setSubmissionSuccess(
          `Successfully logged entry to "${res.sheetName || targetSheetName}" in Google Sheets!`
        );
      }
      setIsSuccessModalOpen(true);
      setProjectVersionStatuses({});
      setIsCustomReason(false);
      setShowOtherReasonsDropdown(false);
      confirmedProjects.current.clear();
      if (formData.emailAddress && formData.emailAddress.includes('@')) {
        try {
          localStorage.setItem('psu_user_logger_email', formData.emailAddress);
        } catch {}
      }
      onSuccessAppend(res.updatedRange);
    } catch (err: any) {
      console.error('Submission error:', err);
      setSubmissionError(err.message || 'Failed to append row(s) to Google Sheets.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-display flex items-center gap-2">
            <span>PSU Entry Submission Form</span>
            <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 rounded-xs border border-blue-200 uppercase">
              Live Mirror
            </span>
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="reset-form-btn"
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 rounded-sm border border-slate-300 hover:border-blue-300 shadow-2xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Reset Form
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" data-lpignore="true" className="mt-6 space-y-5">
        {/* Row 1: Personnel & Region (3 Balanced Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Email Address: Auto-filled and Locked by Scheduler Name */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="email-address-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                <span>Email Address</span> <span className="text-rose-500">*</span>
              </label>
            </div>

            <div className="relative">
              <input
                ref={emailInputRef}
                id="email-address-input"
                name="psu_isolated_email_only"
                type="email"
                disabled
                readOnly
                tabIndex={-1}
                required
                data-lpignore="true"
                placeholder="Email Address"
                value={formData.emailAddress}
                className="w-full h-10 pl-3.5 pr-8 text-xs border border-slate-300 rounded-md bg-slate-100 text-slate-800 font-semibold cursor-not-allowed select-all shadow-2xs disabled:bg-slate-100 disabled:text-slate-800 disabled:cursor-not-allowed disabled:border-slate-300"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Scheduler Name */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="psu-scheduler-select" className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Scheduler Name <span className="text-rose-500">*</span>
              </label>
              {formData.scheduler && (
                <button
                  type="button"
                  onClick={() => onChange({ ...formData, scheduler: '', emailAddress: '', region: '' })}
                  className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              id="psu-scheduler-select"
              name="psu_form_scheduler"
              required
              autoComplete="off"
              data-lpignore="true"
              value={formData.scheduler}
              onChange={(e) => handleSchedulerSelect(e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium shadow-2xs"
            >
              <option value="">-- Pick Scheduler --</option>
              {SCHEDULER_ROSTER.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
              {formData.scheduler && !SCHEDULER_ROSTER.some((s) => s.name.toLowerCase() === formData.scheduler.toLowerCase()) && (
                <option value={formData.scheduler}>{formData.scheduler}</option>
              )}
            </select>
          </div>

          {/* Region */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="psu-operational-area" className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                Region <span className="text-rose-500">*</span>
              </label>
              {formData.region && (
                <button
                  type="button"
                  onClick={() => updateField('region', '', 'psu-operational-area')}
                  className="text-[10px] text-slate-400 hover:text-rose-600 underline"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Quick Option Buttons for Schedulers with multiple separated regions (Shane, Dwight, Marc, Jovie, John) */}
            {activeSchedulerRegions.length > 1 && (
              <div className="mb-2 p-2 bg-blue-50/90 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-900 mb-1.5">
                  <span>Assigned to {formData.scheduler} (Pick Option):</span>
                  {!formData.region && (
                    <span className="text-amber-700 font-semibold normal-case text-[10px]">Select option below</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {activeSchedulerRegions.map((reg) => {
                    const isSelected = formData.region.trim().toLowerCase() === reg.toLowerCase();
                    return (
                      <button
                        key={reg}
                        type="button"
                        onClick={() => updateField('region', reg, 'psu-operational-area')}
                        className={`py-1.5 px-2.5 rounded-md text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs scale-[1.01]'
                            : 'bg-white hover:bg-blue-100/70 text-slate-800 border border-slate-300 hover:border-blue-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />
                        <span className="truncate">{reg}</span>
                        {isSelected && <Check className="w-3 h-3 text-white ml-0.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative">
              <input
                id="psu-operational-area"
                name="psu_form_region"
                type="text"
                list="common-regions-list"
                required
                autoComplete="off"
                data-lpignore="true"
                placeholder={
                  activeSchedulerRegions.length > 1
                    ? `Choose: ${activeSchedulerRegions.join(' or ')}`
                    : 'Pick from list or enter region manually...'
                }
                value={formData.region}
                onChange={(e) => updateField('region', e.target.value, 'psu-operational-area')}
                className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
              />
              <datalist id="common-regions-list">
                {activeSchedulerRegions.map((reg) => (
                  <option key={`active-${reg}`} value={reg}>
                    {reg} (Assigned to {formData.scheduler})
                  </option>
                ))}
                {COMMON_REGIONS.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* Row 2: Timing Details (2 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="psu-date-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              PSU Received Date (MNL) <span className="text-rose-500">*</span>
            </label>
            <input
              id="psu-date-input"
              name="psu_form_received_date"
              type="date"
              required
              autoComplete="off"
              data-lpignore="true"
              value={formData.psuReceivedDate}
              onChange={(e) => updateField('psuReceivedDate', e.target.value, 'psu-date-input')}
              className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
            />
          </div>

          <div>
            <label htmlFor="psu-time-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              PSU Received Time (MNL) <span className="text-rose-500">*</span>
            </label>
            <input
              id="psu-time-input"
              name="psu_form_received_time"
              type="text"
              required
              autoComplete="off"
              data-lpignore="true"
              placeholder="e.g., 4:45 PM"
              value={formData.psuReceivedTime}
              onChange={(e) => updateField('psuReceivedTime', e.target.value, 'psu-time-input')}
              className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
            />
          </div>
        </div>

        {/* Dynamic Multiple Projects Section */}
        <div className="border border-slate-200/90 rounded-xl p-4 sm:p-5 bg-slate-50/70 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-600 text-white rounded-md shadow-xs">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-display flex items-center gap-2">
                <span>Project Details</span>
                <span className="px-2 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 rounded-xs border border-blue-200 uppercase">
                  {projectsList.length} {projectsList.length === 1 ? 'Project' : 'Projects'}
                </span>
              </h3>
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowKeywordChips((prev) => !prev)}
                className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold tracking-wide px-2.5 py-1 h-7 rounded-sm border transition-colors ${
                  showKeywordChips
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-900 border-slate-300 hover:border-blue-300 shadow-2xs'
                }`}
                title="Toggle standard traffic study keywords bar"
              >
                <Sparkles className="w-3 h-3 text-blue-500" />
                <span>Study Keywords</span>
                <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showKeywordChips ? 'rotate-180' : ''}`} />
              </button>

              <button
                id="add-project-btn"
                type="button"
                onClick={handleAddProject}
                className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold tracking-wide px-2.5 py-1 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded-sm shadow-xs transition-all"
              >
                <Plus className="w-3 h-3 text-blue-100" />
                <span>Add Another Project</span>
              </button>
            </div>
          </div>

          {/* Quick-Access Standard Study Keywords Toolbar */}
          {showKeywordChips && (
            <div className="p-3 bg-gradient-to-r from-blue-50/70 via-sky-50/40 to-slate-50 border border-blue-100 rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Recognized Study Types (Click to fill first project or matching row):
                </span>
                <span className="text-[10px] text-blue-600 font-medium">{STUDY_TYPE_KEYWORDS.length} Official Keywords</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STUDY_TYPE_KEYWORDS.map((kw) => {
                  const isUsed = projectsList.some((p) => p.study === kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => {
                        // Fill active project or first project with empty study, or project #1
                        const targetProj = projectsList.find((p) => !p.study.trim()) || projectsList[0];
                        if (targetProj) {
                          handleUpdateProjectField(targetProj.id, 'study', kw);
                        }
                      }}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 ${
                        isUsed
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-semibold'
                          : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-900 border-blue-200'
                      }`}
                      title={`Select ${kw}`}
                    >
                      <span>{kw}</span>
                      {isUsed && <Check className="w-2.5 h-2.5 text-blue-100" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* List of Projects */}
          <div className="space-y-3">
            {projectsList.map((project, index) => {
              const status = projectVersionStatuses[project.id];
              const isChecking = status?.loading;

              return (
                <div
                  key={project.id}
                  id={`project-row-${index}`}
                  className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-xl p-3.5 shadow-2xs space-y-3 transition-colors"
                >
                  {/* Card Mini Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold text-[11px] flex items-center justify-center border border-blue-200">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900">
                        Project #{index + 1}
                      </span>
                      {project.sourceFile && (
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-md truncate max-w-[200px]"
                            title={`Extracted from PDF attachment: ${project.sourceFile}`}
                          >
                            <Paperclip className="w-2.5 h-2.5 shrink-0 text-blue-500" />
                            <span className="truncate">{project.sourceFile}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const matched =
                                attachments.find((a) => a.fileName === project.sourceFile) ||
                                attachments.find((a) => a.isPdf) ||
                                null;
                              if (matched) {
                                setViewingAttachment(matched);
                                setViewingProjectId(project.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded shadow-2xs transition-colors"
                            title="View PDF attachment and check Page 1 extraction"
                          >
                            <Eye className="w-2.5 h-2.5" />
                            <span>View PDF</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {projectsList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveProject(project.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Remove this project"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                    )}
                  </div>

                  {/* 4 Inputs: Project Number, Study, Version, Job Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Project Number */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label htmlFor={`proj-${project.id}-projectNumber`} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                          <Hash className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>Project Number</span> <span className="text-rose-500">*</span>
                        </label>
                      </div>
                      <input
                        id={`proj-${project.id}-projectNumber`}
                        name={`psu_proj_num_${project.id}`}
                        type="text"
                        required
                        autoComplete="off"
                        data-lpignore="true"
                        placeholder="e.g., 26-770124"
                        value={project.projectNumber}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'projectNumber', e.target.value)
                        }
                        onBlur={() => {
                          if (project.projectNumber && project.projectNumber.trim().length >= 4) {
                            checkSingleProjectVersion(project.id, project.projectNumber.trim());
                          }
                        }}
                        className="w-full h-9.5 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-mono shadow-2xs"
                      />
                    </div>

                    {/* Study / Study Type */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label htmlFor={`proj-${project.id}-study`} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                          <BookOpen className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>Study / Study Type</span>
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          id={`proj-${project.id}-study`}
                          name={`psu_proj_study_${project.id}`}
                          type="text"
                          autoComplete="off"
                          data-lpignore="true"
                          list="study-types-datalist"
                          placeholder="e.g., TMC, ATR, Radar..."
                          value={project.study}
                          onChange={(e) =>
                            handleUpdateProjectField(project.id, 'study', e.target.value)
                          }
                          onBlur={(e) => {
                            const norm = normalizeStudyType(e.target.value);
                            if (norm && norm !== e.target.value) {
                              handleUpdateProjectField(project.id, 'study', norm);
                            }
                          }}
                          className="w-full h-9.5 px-3 pr-7 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setOpenStudyPickerId(openStudyPickerId === project.id ? null : project.id)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                          title="Open Keywords list"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dropdown Popover for Standard Study Keywords */}
                      {openStudyPickerId === project.id && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-xl p-2 max-h-60 overflow-y-auto space-y-1">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-200 px-1">
                            <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              Official Keywords
                            </span>
                            <button
                              type="button"
                              onClick={() => setOpenStudyPickerId(null)}
                              className="text-[10px] text-slate-500 hover:text-slate-900 font-bold uppercase"
                            >
                              Close
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-0.5 pt-1">
                            {STUDY_TYPE_KEYWORDS.map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => {
                                  handleUpdateProjectField(project.id, 'study', kw);
                                  setOpenStudyPickerId(null);
                                }}
                                className={`text-left px-2.5 py-1.5 text-xs rounded transition-colors flex items-center justify-between ${
                                  project.study === kw
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'hover:bg-blue-50 text-slate-900'
                                }`}
                              >
                                <span className="truncate">{kw}</span>
                                {project.study === kw && <Check className="w-3 h-3 text-blue-100 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Version */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label htmlFor={`proj-${project.id}-version`} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                          <GitBranch className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>Version</span>
                        </label>
                        {project.projectNumber.trim() && (
                          <button
                            type="button"
                            onClick={() =>
                              checkSingleProjectVersion(project.id, project.projectNumber)
                            }
                            disabled={isChecking}
                            className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline shrink-0 font-bold uppercase tracking-wider"
                            title="Query sheet history for this project"
                          >
                            <RefreshCw
                              className={`w-2.5 h-2.5 ${isChecking ? 'animate-spin text-blue-600' : ''}`}
                            />
                            Sync
                          </button>
                        )}
                      </div>
                      <input
                        id={`proj-${project.id}-version`}
                        name={`psu_proj_ver_${project.id}`}
                        type="text"
                        autoComplete="off"
                        data-lpignore="true"
                        placeholder="Initial, v2, v3, ..."
                        value={project.version}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'version', e.target.value)
                        }
                        onBlur={(e) => {
                          if (e.target.value.trim().toLowerCase() === 'initial' && e.target.value !== 'Initial') {
                            handleUpdateProjectField(project.id, 'version', 'Initial');
                          }
                        }}
                        className="w-full h-9.5 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-mono font-medium shadow-2xs"
                      />
                      {/* Version status pill (only shown when actively checking or dynamically returned) */}
                      {isChecking ? (
                        <span className="text-[10px] text-slate-500 mt-1 block animate-pulse leading-tight">
                          Checking sheet...
                        </span>
                      ) : status ? (
                        <span className="text-[10px] mt-1 block font-medium leading-tight truncate">
                          {status.isCorrection || project.jobType === 'For Correction' ? (
                            <span className="text-cyan-800 font-semibold inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                              <span>
                                {status.count} prior &rarr;{' '}
                                <strong>{project.version || status.suggestedVersion}</strong> (Retained for Correction)
                              </span>
                            </span>
                          ) : status.count === 0 ? (
                            <span className="text-emerald-700 font-semibold">
                              1st entry &rarr; <strong>{status.suggestedVersion}</strong>
                            </span>
                          ) : (
                            <span className="text-amber-800 font-semibold inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                              <span>
                                {status.count} prior &rarr; <strong>{status.suggestedVersion}</strong> (Re-PSU)
                              </span>
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>

                    {/* Job Type */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 h-5">
                        <label htmlFor={`proj-${project.id}-jobType`} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                          <Briefcase className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>Job Type</span> <span className="text-rose-500">*</span>
                        </label>
                      </div>
                      <select
                        id={`proj-${project.id}-jobType`}
                        name={`psu_proj_jt_${project.id}`}
                        required
                        autoComplete="off"
                        data-lpignore="true"
                        value={project.jobType || 'New Installs'}
                        onChange={(e) =>
                          handleUpdateProjectField(project.id, 'jobType', e.target.value)
                        }
                        className="w-full h-9.5 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium shadow-2xs"
                      >
                        {JOB_TYPES.map((jt) => (
                          <option key={jt} value={jt}>
                            {jt}
                          </option>
                        ))}
                        {project.jobType && !JOB_TYPES.includes(project.jobType) && (
                          <option value={project.jobType}>{project.jobType}</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Add Another Project Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleAddProject}
              className="w-full py-2.5 border border-dashed border-blue-300 hover:border-blue-600 hover:bg-blue-50/50 text-blue-700 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ Add Another Project Number, Study Type &amp; Version</span>
            </button>
          </div>
        </div>

        {/* Row 3: Category (Email Category) */}
        <div>
          <label htmlFor="category-select" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            Category (Email Category) <span className="text-rose-500">*</span>
          </label>
          <select
            id="category-select"
            name="psu_form_category"
            required
            autoComplete="off"
            data-lpignore="true"
            value={formData.category}
            onChange={(e) => updateField('category', e.target.value, 'category-select')}
            className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium shadow-2xs"
          >
            <option value="">(Select Category)</option>
            {PSU_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
            {formData.category && !PSU_CATEGORIES.includes(formData.category) && (
              <option value={formData.category}>{formData.category}</option>
            )}
          </select>
        </div>

        {/* Row 4: Reason (Email Sub-Category / Description) */}
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <label htmlFor={isCustomReason ? "reason-input" : "reason-select"} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
              Reason (Email Sub-Category / Description) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              {formData.category && !isCustomReason && (
                <button
                  type="button"
                  onClick={() => setShowOtherReasonsDropdown((prev) => !prev)}
                  className={`text-[10px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1 ${
                    showOtherReasonsDropdown || isOtherReasonActive
                      ? 'text-blue-900 underline font-extrabold'
                      : 'text-slate-600 hover:text-blue-900 hover:underline'
                  }`}
                  title="Toggle other available reasons dropdown"
                >
                  <span>{showOtherReasonsDropdown || isOtherReasonActive ? 'Hide Other Reasons' : 'Other Available Reason'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showOtherReasonsDropdown || isOtherReasonActive ? 'rotate-180' : ''}`} />
                </button>
              )}
              {formData.category && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomReason(!isCustomReason);
                    if (!isCustomReason) {
                      setShowOtherReasonsDropdown(false);
                    }
                  }}
                  className="text-[10px] text-blue-700 hover:text-blue-900 hover:underline font-bold uppercase tracking-wider transition-colors"
                >
                  {isCustomReason ? 'Choose from list' : 'Type custom reason'}
                </button>
              )}
            </div>
          </div>

          {isCustomReason ? (
            <input
              id="reason-input"
              name="psu_form_reason_text"
              type="text"
              required
              autoComplete="off"
              data-lpignore="true"
              placeholder={
                formData.category
                  ? 'Enter custom reason or description...'
                  : 'Please select a Category above first...'
              }
              value={formData.reason}
              onChange={(e) => updateField('reason', e.target.value, 'reason-input')}
              disabled={!formData.category}
              className={`w-full h-10 px-3.5 text-xs border rounded-md font-medium shadow-2xs focus:outline-none transition-colors ${
                !formData.category
                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 placeholder:text-slate-400'
              }`}
            />
          ) : (
            <div className="space-y-2">
              <select
                id="reason-select"
                name="psu_form_reason_select"
                required={!showOtherReasonsDropdown && !isOtherReasonActive}
                autoComplete="off"
                data-lpignore="true"
                value={
                  recommendedReasons.includes(formData.reason)
                    ? formData.reason
                    : isOtherReasonActive
                    ? '__OTHER_AVAILABLE_REASON__'
                    : formData.reason
                }
                disabled={!formData.category}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__OTHER_CUSTOM__') {
                    setIsCustomReason(true);
                    setShowOtherReasonsDropdown(false);
                    updateField('reason', '', 'reason-select');
                  } else if (val === '__OTHER_AVAILABLE_REASON__') {
                    setShowOtherReasonsDropdown(true);
                  } else {
                    setShowOtherReasonsDropdown(false);
                    updateField('reason', val, 'reason-select');
                  }
                }}
                className={`w-full h-10 px-3.5 text-xs border rounded-md font-medium shadow-2xs focus:outline-none transition-colors ${
                  !formData.category
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-white border-slate-300 text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600'
                }`}
              >
                {!formData.category ? (
                  <option value="">(Please select a Category above first)</option>
                ) : (
                  <>
                    <option value="">
                      {recommendedReasons.length > 0
                        ? `(Select Recommended Reason for "${formData.category}")`
                        : '(Select Reason)'}
                    </option>
                    {recommendedReasons.length > 0 && (
                      <optgroup label={`Recommended for "${formData.category}"`}>
                        {recommendedReasons.map((r) => (
                          <option key={`rec-${r}`} value={r}>
                            ⭐ {r}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {formData.reason &&
                      !recommendedReasons.includes(formData.reason) &&
                      !otherReasonsList.includes(formData.reason) && (
                        <option value={formData.reason}>{formData.reason}</option>
                      )}
                    <option value="__OTHER_AVAILABLE_REASON__">
                      {isOtherReasonActive
                        ? `▶ Other Available Reason: "${formData.reason}"`
                        : '▶ Other Available Reason (Click to choose other reasons)...'}
                    </option>
                    <option value="__OTHER_CUSTOM__">+ Other (Type custom reason)...</option>
                  </>
                )}
              </select>

              {/* Secondary dropdown: Only shows when "Other Available Reason" is clicked */}
              {formData.category && (showOtherReasonsDropdown || isOtherReasonActive) && (
                <div className="p-3 bg-slate-50 border border-slate-300 rounded-lg space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="other-available-reason-select"
                      className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                      <span>Other Available Reason</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOtherReasonsDropdown(false);
                        if (isOtherReasonActive) {
                          updateField('reason', '', 'reason-select');
                        }
                      }}
                      className="text-[10px] text-slate-500 hover:text-blue-900 underline font-semibold"
                    >
                      Close / Back to Recommended
                    </button>
                  </div>

                  <select
                    id="other-available-reason-select"
                    name="psu_form_other_available_reason_select"
                    required={!recommendedReasons.includes(formData.reason) && !isCustomReason}
                    autoComplete="off"
                    data-lpignore="true"
                    value={otherReasonsList.includes(formData.reason) ? formData.reason : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__OTHER_CUSTOM__') {
                        setIsCustomReason(true);
                        setShowOtherReasonsDropdown(false);
                        updateField('reason', '', 'reason-select');
                      } else {
                        updateField('reason', val, 'other-available-reason-select');
                      }
                    }}
                    className="w-full h-10 px-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium shadow-2xs"
                  >
                    <option value="">(Select from Other Available Reasons)</option>
                    {otherReasonsList.map((r) => (
                      <option key={`other-${r}`} value={r}>
                        {r}
                      </option>
                    ))}
                    <option value="__OTHER_CUSTOM__">+ Other (Type custom reason)...</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Showing {otherReasonsList.length} other standard PSU reasons outside the recommended list for &quot;{formData.category}&quot;.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Row 5: Remarks */}
        <div>
          <label htmlFor="remarks-input" className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            Remarks
          </label>
          <textarea
            id="remarks-input"
            name="psu_form_remarks"
            rows={3}
            autoComplete="off"
            data-lpignore="true"
            placeholder="Enter any remarks, special scheduling requirements, or notes (optional)..."
            value={formData.remarks}
            onChange={(e) => updateField('remarks', e.target.value, 'remarks-input')}
            className="w-full p-3.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-none font-normal shadow-2xs"
          />
        </div>

        {/* Alerts */}
        {submissionError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-700 shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold uppercase tracking-wider text-red-900">Submission Error: </span>
              <p className="leading-relaxed text-red-800">{submissionError}</p>
            </div>
          </div>
        )}

        {/* Submit Button (Modern, eye-catching, blue palette) */}
        <div className="pt-2">
          <button
            id="submit-psu-btn"
            type="submit"
            disabled={!isSubmitEnabled}
            className={`w-full py-4 px-6 rounded-md text-xs font-extrabold uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all duration-150 ${
              isSubmitEnabled
                ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md hover:shadow-lg active:scale-[0.99] cursor-pointer ring-1 ring-blue-500/30'
                : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed select-none'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {projectsList.length > 1
                  ? `Submitting ${projectsList.length} Entries to Google Sheets...`
                  : 'Submitting Entry to Google Sheets...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 text-blue-100" />
                {isSheetReady
                  ? projectsList.length > 1
                    ? `Submit ${projectsList.length} Projects to Google Sheet (${sheetConfig.sheetName})`
                    : `Submit Entry to Google Sheet (${sheetConfig.sheetName})`
                  : 'Setup Apps Script API to Submit'}
              </>
            )}
          </button>

          {/* Missing Fields Notice */}
          {isSheetReady && !isAllFieldsFilled && (
            <div className="mt-3 p-3 bg-blue-50/50 border border-blue-200 rounded-md text-xs text-slate-700 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-blue-950 uppercase tracking-wider text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Submit Entry is locked until all required fields are completed:</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {missingFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-200 rounded-xs text-slate-800 font-medium text-[11px] shadow-2xs"
                  >
                    • {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isSheetReady && (
            <p className="text-center text-[11px] text-slate-500 mt-2">
              Please click{' '}
              <button
                type="button"
                onClick={onOpenAppsScriptSetup}
                className="text-blue-600 font-bold underline hover:text-blue-800"
              >
                Setup Apps Script API
              </button>{' '}
              to connect your Google Sheet without sign-in requirements.
            </p>
          )}

          {/* Datalist autocomplete for all standard study keywords */}
          <datalist id="study-types-datalist">
            {STUDY_TYPE_KEYWORDS.map((kw) => (
              <option key={kw} value={kw} />
            ))}
            {SECONDARY_STUDY_KEYWORDS.map((sec) => (
              <option key={sec} value={sec} />
            ))}
          </datalist>
        </div>
      </form>

      {/* PDF Attachment Modal Viewer */}
      <PdfViewerModal
        isOpen={Boolean(viewingAttachment)}
        onClose={() => {
          setViewingAttachment(null);
          setViewingProjectId(null);
        }}
        attachment={viewingAttachment}
        onUpdateExtracted={(updated) => {
          if (viewingProjectId) {
            if (updated.projectNumber) {
              handleUpdateProjectField(viewingProjectId, 'projectNumber', updated.projectNumber);
            }
            if (updated.study) {
              handleUpdateProjectField(viewingProjectId, 'study', updated.study);
            }
          }
          if (updated.region && !formData.region) {
            updateField('region', updated.region);
          }
        }}
      />

      {/* Submission Success Modal with 3-second auto-close and animation */}
      <SubmissionSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => {
          setIsSuccessModalOpen(false);
          setSubmissionSuccess(null);
        }}
        message={submissionSuccess}
        result={submissionResult}
        projectNumbers={projectsList
          .map((p) => p.projectNumber?.trim())
          .filter((p): p is string => Boolean(p && p.length > 0))}
        durationMs={3000}
      />
    </div>
  );
};
