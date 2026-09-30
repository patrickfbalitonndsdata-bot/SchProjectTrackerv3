import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  ExternalLink,
  Download,
  Filter,
  Layers,
  Clock,
  User,
  Globe,
  Tag,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  PlusCircle,
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { SheetEntryRow, SheetConfig } from '../types';
import { readRecentPsuEntries, FIXED_SPREADSHEET_URL } from '../lib/sheetsApi';
import { DEFAULT_INITIAL_ENTRIES } from './RecentEntries';
import { isRevisedVersion } from '../lib/roster';

export type ColumnKey =
  | 'rowNumber'
  | 'status'
  | 'emailAddress'
  | 'timestampMnl'
  | 'scheduler'
  | 'region'
  | 'psuDate'
  | 'psuTime'
  | 'projectNumber'
  | 'version'
  | 'jobType'
  | 'study'
  | 'category'
  | 'reason'
  | 'remarks';

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  colCode: string;
  defaultVisible: boolean;
  minWidth: string;
}

export const MIRROR_COLUMNS: ColumnDef[] = [
  { key: 'rowNumber', label: '#', colCode: '#', defaultVisible: true, minWidth: 'w-12' },
  { key: 'status', label: 'Monitoring', colCode: 'STATUS', defaultVisible: true, minWidth: 'min-w-[100px]' },
  { key: 'emailAddress', label: 'Email Address', colCode: 'COL A', defaultVisible: false, minWidth: 'min-w-[150px]' }, // DEFAULT HIDE
  { key: 'timestampMnl', label: 'Timestamp (MNL)', colCode: 'COL B', defaultVisible: false, minWidth: 'min-w-[150px]' }, // DEFAULT HIDE
  { key: 'scheduler', label: 'Scheduler', colCode: 'COL C', defaultVisible: true, minWidth: 'min-w-[120px]' },
  { key: 'region', label: 'Region', colCode: 'COL D', defaultVisible: true, minWidth: 'min-w-[110px]' },
  { key: 'psuDate', label: 'PSU Date (MNL)', colCode: 'COL E', defaultVisible: false, minWidth: 'min-w-[120px]' }, // DEFAULT HIDE
  { key: 'psuTime', label: 'PSU Time (MNL)', colCode: 'COL F', defaultVisible: false, minWidth: 'min-w-[120px]' }, // DEFAULT HIDE
  { key: 'projectNumber', label: 'Project Number', colCode: 'COL G', defaultVisible: true, minWidth: 'min-w-[130px]' },
  { key: 'version', label: 'Version', colCode: 'COL H', defaultVisible: true, minWidth: 'min-w-[90px]' },
  { key: 'jobType', label: 'Job Type', colCode: 'COL I', defaultVisible: true, minWidth: 'min-w-[140px]' },
  { key: 'study', label: 'Study Type', colCode: 'COL J', defaultVisible: true, minWidth: 'min-w-[120px]' },
  { key: 'category', label: 'Email Category', colCode: 'COL K', defaultVisible: true, minWidth: 'min-w-[130px]' },
  { key: 'reason', label: 'Sub-Category / Reason', colCode: 'COL L', defaultVisible: false, minWidth: 'min-w-[180px]' }, // DEFAULT HIDE
  { key: 'remarks', label: 'Remarks', colCode: 'COL M', defaultVisible: true, minWidth: 'min-w-[180px]' },
];

const STORAGE_KEY_COLUMNS = 'psu_mirror_table_visible_columns_v4';

interface SheetMirrorViewerProps {
  sheetConfig: SheetConfig;
  refreshTrigger: number;
  onOpenAppsScriptSetup?: () => void;
  accessToken?: string | null;
  onSwitchToEntryTab?: () => void;
}

export const SheetMirrorViewer: React.FC<SheetMirrorViewerProps> = ({
  sheetConfig,
  refreshTrigger,
  onOpenAppsScriptSetup,
  accessToken,
  onSwitchToEntryTab,
}) => {
  const [entries, setEntries] = useState<SheetEntryRow[]>(DEFAULT_INITIAL_ENTRIES);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('ALL');
  const [schedulerFilter, setSchedulerFilter] = useState<string>('ALL');

  // Selected row for detail inspector modal
  const [selectedRow, setSelectedRow] = useState<SheetEntryRow | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Column Visibility Management (Default hides: Email, Timestamp, PSU Date, PSU Time, Reason)
  const getDefaultVisibility = useCallback((): Record<ColumnKey, boolean> => {
    const defaults = {} as Record<ColumnKey, boolean>;
    MIRROR_COLUMNS.forEach((col) => {
      defaults[col.key] = col.defaultVisible;
    });
    return defaults;
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COLUMNS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return {
            ...getDefaultVisibility(),
            ...parsed,
          };
        }
      }
    } catch {}
    return getDefaultVisibility();
  });

  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState<boolean>(false);
  const columnsMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveVisibility = (next: Record<ColumnKey, boolean>) => {
    setVisibleColumns(next);
    try {
      localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify(next));
    } catch {}
  };

  const toggleColumn = (key: ColumnKey) => {
    saveVisibility({ ...visibleColumns, [key]: !visibleColumns[key] });
  };

  const hideColumn = (key: ColumnKey) => {
    saveVisibility({ ...visibleColumns, [key]: false });
  };

  const unhideColumn = (key: ColumnKey) => {
    saveVisibility({ ...visibleColumns, [key]: true });
  };

  const showAllColumns = () => {
    const next = {} as Record<ColumnKey, boolean>;
    MIRROR_COLUMNS.forEach((col) => {
      next[col.key] = true;
    });
    saveVisibility(next);
  };

  const resetToDefaultColumns = () => {
    saveVisibility(getDefaultVisibility());
  };

  const visibleColumnCount = useMemo(() => {
    return Object.values(visibleColumns).filter(Boolean).length;
  }, [visibleColumns]);

  const hiddenColumnsList = useMemo(() => {
    return MIRROR_COLUMNS.filter((col) => !visibleColumns[col.key]);
  }, [visibleColumns]);

  const hasApiConnection = Boolean(sheetConfig.appsScriptUrl || accessToken);

  const loadEntries = useCallback(async () => {
    if (!hasApiConnection) return;

    setIsLoading(true);
    setError(null);

    try {
      const rows = await readRecentPsuEntries(
        sheetConfig.spreadsheetId,
        sheetConfig.sheetName || 'Project Tracker',
        accessToken,
        150, // Higher limit for comprehensive mirror view
        sheetConfig.appsScriptUrl
      );
      if (rows && rows.length > 0) {
        setEntries(rows);
      }
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err: any) {
      console.warn('Sheet mirror sync notice:', err);
      setError(err.message || 'Could not fetch entries from Google Sheets.');
    } finally {
      setIsLoading(false);
    }
  }, [hasApiConnection, sheetConfig.appsScriptUrl, sheetConfig.spreadsheetId, sheetConfig.sheetName, accessToken]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refreshTrigger]);

  // Derive unique filter lists
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.region && e.region.trim()) set.add(e.region.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  const availableJobTypes = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.jobType && e.jobType.trim()) set.add(e.jobType.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  const availableSchedulers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      if (e.scheduler && e.scheduler.trim()) set.add(e.scheduler.trim());
    });
    return Array.from(set).sort();
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((row) => {
      if (regionFilter !== 'ALL' && row.region !== regionFilter) return false;
      if (jobTypeFilter !== 'ALL' && row.jobType !== jobTypeFilter) return false;
      if (schedulerFilter !== 'ALL' && row.scheduler !== schedulerFilter) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        row.projectNumber.toLowerCase().includes(term) ||
        row.scheduler.toLowerCase().includes(term) ||
        row.studyType.toLowerCase().includes(term) ||
        row.region.toLowerCase().includes(term) ||
        row.jobType.toLowerCase().includes(term) ||
        row.version.toLowerCase().includes(term) ||
        row.emailAddress.toLowerCase().includes(term) ||
        row.emailCategory.toLowerCase().includes(term) ||
        row.emailSubCategory.toLowerCase().includes(term) ||
        row.remarks.toLowerCase().includes(term) ||
        row.psuReceivedDateMnl.toLowerCase().includes(term)
      );
    });
  }, [entries, regionFilter, jobTypeFilter, schedulerFilter, searchTerm]);

  // Metrics summary
  const metrics = useMemo(() => {
    let rePsuCount = 0;
    let newInstallsCount = 0;
    const projectSet = new Set<string>();
    const schedulerSet = new Set<string>();

    entries.forEach((e) => {
      if (
        e.jobType === 'Re-PSU (Revised)' ||
        e.jobType.toLowerCase().includes('rev') ||
        isRevisedVersion(e.version)
      ) {
        rePsuCount++;
      } else if (e.jobType.toLowerCase().includes('new')) {
        newInstallsCount++;
      }
      if (e.projectNumber) projectSet.add(e.projectNumber.trim().toLowerCase());
      if (e.scheduler) schedulerSet.add(e.scheduler.trim().toLowerCase());
    });

    return {
      total: entries.length,
      rePsuCount,
      newInstallsCount,
      uniqueProjects: projectSet.size,
      uniqueSchedulers: schedulerSet.size,
    };
  }, [entries]);

  const handleCopyText = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleExportCsv = () => {
    if (filteredEntries.length === 0) return;

    const headers = [
      'Row #',
      'Email Address',
      'Timestamp (MNL)',
      'Scheduler',
      'Region',
      'PSU Received Date (MNL)',
      'PSU Received Time (MNL)',
      'Project Number',
      'Version',
      'Job Type',
      'Study Type',
      'Email Category',
      'Email Sub-Category / Description',
      'Remarks',
    ];

    const csvRows = [headers.join(',')];

    filteredEntries.forEach((r) => {
      const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
      csvRows.push(
        [
          r.rowNumber,
          escape(r.emailAddress),
          escape(r.timestampMnl),
          escape(r.scheduler),
          escape(r.region),
          escape(r.psuReceivedDateMnl),
          escape(r.psuReceivedTimeMnl),
          escape(r.projectNumber),
          escape(r.version),
          escape(r.jobType),
          escape(r.studyType),
          escape(r.emailCategory),
          escape(r.emailSubCategory),
          escape(r.remarks),
        ].join(',')
      );
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `google_sheet_mirror_${sheetConfig.sheetName}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Mirror Control Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 font-display">
                  Google Sheet Mirror Viewer
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Live Mirror
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  Tab: <strong className="text-blue-900 font-semibold">{sheetConfig.sheetName}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time reflection of the linked Google Sheet database showing all canonical columns alongside monitoring status.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-y-2">
            <button
              type="button"
              onClick={loadEntries}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 rounded-sm border border-slate-300 hover:border-blue-300 transition-colors shadow-2xs"
              title="Sync latest rows from Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? 'Syncing...' : 'Sync Sheet'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredEntries.length === 0}
              className="inline-flex items-center space-x-1.5 h-9 px-3 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 rounded-sm border border-slate-300 hover:border-blue-300 transition-colors shadow-2xs"
              title="Download filtered records as CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export CSV</span>
            </button>

            {onSwitchToEntryTab && (
              <button
                type="button"
                onClick={onSwitchToEntryTab}
                className="inline-flex items-center space-x-1.5 h-9 px-3.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 rounded-sm transition-colors border border-slate-300 hover:border-blue-300 shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Log New PSU</span>
              </button>
            )}
          </div>
        </div>

        {/* Monitoring Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
          <div className="bg-blue-50/50 border border-blue-100/90 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">Total Records</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{metrics.total}</div>
            <span className="text-[10px] text-blue-600/80">Rows in sheet</span>
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Re-PSU (Revised)</span>
            <div className="text-xl font-bold font-mono text-amber-950 mt-0.5">{metrics.rePsuCount}</div>
            <span className="text-[10px] text-amber-600/80">v1, v2+ revisions</span>
          </div>

          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">New Installs</span>
            <div className="text-xl font-bold font-mono text-emerald-950 mt-0.5">{metrics.newInstallsCount}</div>
            <span className="text-[10px] text-emerald-600/80">Initial setups</span>
          </div>

          <div className="bg-sky-50/50 border border-sky-100/90 rounded-md p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 block">Projects Monitored</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{metrics.uniqueProjects}</div>
            <span className="text-[10px] text-sky-600/80">Distinct project IDs</span>
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100/90 rounded-md p-3 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">Active Schedulers</span>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">{metrics.uniqueSchedulers}</div>
            <span className="text-[10px] text-indigo-600/80">Team members</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search across all columns (project, scheduler, remarks...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-9 pr-8 text-xs border border-slate-300 rounded-md bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Region Filter */}
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
            >
              <option value="ALL">All Regions ({availableRegions.length})</option>
              {availableRegions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Job Type Filter */}
            <select
              value={jobTypeFilter}
              onChange={(e) => setJobTypeFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
            >
              <option value="ALL">All Job Types</option>
              <option value="Re-PSU (Revised)">Re-PSU (Revised)</option>
              <option value="New Installs">New Installs</option>
              {availableJobTypes
                .filter((jt) => jt !== 'Re-PSU (Revised)' && jt !== 'New Installs')
                .map((jt) => (
                  <option key={jt} value={jt}>
                    {jt}
                  </option>
                ))}
            </select>

            {/* Scheduler Filter */}
            <select
              value={schedulerFilter}
              onChange={(e) => setSchedulerFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-slate-300 rounded-md bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 shadow-2xs"
            >
              <option value="ALL">All Schedulers ({availableSchedulers.length})</option>
              {availableSchedulers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {(regionFilter !== 'ALL' || jobTypeFilter !== 'ALL' || schedulerFilter !== 'ALL' || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setRegionFilter('ALL');
                  setJobTypeFilter('ALL');
                  setSchedulerFilter('ALL');
                  setSearchTerm('');
                }}
                className="h-9 px-3 text-xs font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-sm transition-colors border border-rose-200 shadow-2xs"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {lastSyncTime && (
          <div className="mt-2 text-[10px] text-slate-400 font-mono flex items-center justify-between uppercase tracking-wider">
            <span>Showing {filteredEntries.length} of {entries.length} entries</span>
            <span>Last synced: {lastSyncTime}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-between text-xs text-amber-800 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{error}</span>
          </div>
          {onOpenAppsScriptSetup && (
            <button
              onClick={onOpenAppsScriptSetup}
              className="underline font-bold text-neutral-950 hover:text-black"
            >
              Configure Connection
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet Mirror Grid */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Mirror Grid Subtitle & Column Customizer */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-600">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">Mirror Table:</span>
            <span className="font-mono text-[11px] text-slate-500">Columns A through M &bull; Real-time reflection</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              {visibleColumnCount} of {MIRROR_COLUMNS.length} Columns Visible
            </span>
          </div>

          <div className="flex items-center space-x-2 relative self-end sm:self-auto" ref={columnsMenuRef}>
            {/* Column Visibility Manager Button */}
            <button
              type="button"
              onClick={() => setIsColumnsMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-white hover:bg-blue-50/70 rounded-md border border-slate-300 hover:border-blue-300 transition-colors shadow-2xs"
              title="Customize visible columns in Mirror table"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
              <span>Columns ({visibleColumnCount}/{MIRROR_COLUMNS.length})</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isColumnsMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isColumnsMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-3 space-y-3 animate-in fade-in-50 zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                      Column Visibility
                    </h4>
                    <p className="text-[10px] text-slate-500">Toggle columns to show or hide</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsColumnsMenuOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="flex-1 py-1 px-2 text-center rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                  >
                    Show All
                  </button>
                  <button
                    type="button"
                    onClick={resetToDefaultColumns}
                    className="flex-1 py-1 px-2 text-center rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors"
                    title="Hide Email, Timestamp, PSU Date, PSU Time, and Reason"
                  >
                    Default (Hide 5)
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {MIRROR_COLUMNS.map((col) => {
                    const isVisible = visibleColumns[col.key];
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isVisible ? 'bg-blue-50/50 hover:bg-blue-50 text-slate-900' : 'hover:bg-slate-50 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isVisible}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                          />
                          <span className={isVisible ? 'font-semibold text-slate-900' : 'text-slate-500'}>
                            {col.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {col.colCode}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Unhide Banner when any column is hidden */}
        {hiddenColumnsList.length > 0 && (
          <div className="px-5 py-2.5 bg-gradient-to-r from-blue-50/70 via-sky-50/40 to-slate-50 border-b border-blue-100/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5 shrink-0">
                <EyeOff className="w-3.5 h-3.5 text-blue-600" />
                Hidden Columns ({hiddenColumnsList.length}):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {hiddenColumnsList.map((col) => (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => unhideColumn(col.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-medium transition-colors shadow-2xs group"
                    title={`Click to unhide ${col.label}`}
                  >
                    <Eye className="w-3 h-3 text-blue-500 group-hover:text-blue-700" />
                    <span>{col.label}</span>
                    <span className="text-[9px] text-blue-400 font-mono">({col.colCode})</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={showAllColumns}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline"
              >
                Show All
              </button>
              <span className="text-blue-300">&bull;</span>
              <button
                type="button"
                onClick={resetToDefaultColumns}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                title="Reset to default columns (hides Email, Timestamp, PSU Date, PSU Time, and Reason)"
              >
                Reset Default
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Spreadsheet Table Container */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="min-w-full text-xs text-left border-collapse">
            {/* Header row with spreadsheet Column Letters & Labels & Individual Hide Buttons */}
            <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 shadow-2xs">
              <tr className="text-slate-800 divide-x divide-slate-200 text-[10px] font-bold uppercase tracking-wider">
                {MIRROR_COLUMNS.filter((col) => visibleColumns[col.key]).map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2.5 whitespace-nowrap bg-slate-100 ${col.minWidth} group/th`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div>
                        <div className="text-[9px] text-slate-400 font-mono">{col.colCode}</div>
                        <div className="text-slate-800 font-bold">{col.label}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          hideColumn(col.key);
                        }}
                        className="opacity-70 group-hover/th:opacity-100 p-1 rounded-sm text-slate-400 hover:text-rose-600 hover:bg-slate-200/90 transition-all ml-1"
                        title={`Hide "${col.label}" column`}
                        aria-label={`Hide ${col.label} column`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading && entries.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, visibleColumnCount)} className="px-4 py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2 font-medium">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      Fetching Google Sheet records from &quot;{sheetConfig.sheetName}&quot;...
                    </div>
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, visibleColumnCount)} className="px-4 py-12 text-center text-slate-500">
                    <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-900 uppercase tracking-wider text-xs">No matching sheet entries</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {searchTerm || regionFilter !== 'ALL' || jobTypeFilter !== 'ALL'
                        ? 'Try clearing active filters to see all rows.'
                        : 'Append your first PSU record from the entry tab to view it mirrored here!'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredEntries.map((row) => {
                  const isRev =
                    row.jobType === 'Re-PSU (Revised)' ||
                    row.jobType.toLowerCase().includes('rev') ||
                    isRevisedVersion(row.version);

                  return (
                    <tr
                      key={row.rowNumber}
                      onClick={() => setSelectedRow(row)}
                      className="hover:bg-blue-50/30 cursor-pointer transition-colors divide-x divide-slate-200 group"
                    >
                      {/* Row Index */}
                      {visibleColumns.rowNumber && (
                        <td className="px-3 py-2.5 text-center font-mono text-[11px] text-slate-400 bg-slate-50 group-hover:bg-blue-50/50">
                          {row.rowNumber}
                        </td>
                      )}

                      {/* Monitoring Status Badge */}
                      {visibleColumns.status && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {isRev ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200">
                              Revised
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-900 border border-blue-200">
                              New Install
                            </span>
                          )}
                        </td>
                      )}

                      {/* Col A: Email Address */}
                      {visibleColumns.emailAddress && (
                        <td className="px-3 py-2.5 text-slate-600 truncate max-w-[180px]" title={row.emailAddress}>
                          {row.emailAddress || '—'}
                        </td>
                      )}

                      {/* Col B: Timestamp (MNL) */}
                      {visibleColumns.timestampMnl && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-600 text-[11px]">
                          {row.timestampMnl || '—'}
                        </td>
                      )}

                      {/* Col C: Scheduler */}
                      {visibleColumns.scheduler && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-slate-900">
                          {row.scheduler || '—'}
                        </td>
                      )}

                      {/* Col D: Region */}
                      {visibleColumns.region && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-xs bg-blue-50 text-blue-800 text-[10px] font-bold font-mono uppercase border border-blue-200">
                            {row.region || '—'}
                          </span>
                        </td>
                      )}

                      {/* Col E: PSU Received Date (MNL) */}
                      {visibleColumns.psuDate && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-900 font-semibold">
                          {row.psuReceivedDateMnl || '—'}
                        </td>
                      )}

                      {/* Col F: PSU Received Time (MNL) */}
                      {visibleColumns.psuTime && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                          {row.psuReceivedTimeMnl || '—'}
                        </td>
                      )}

                      {/* Col G: Project Number */}
                      {visibleColumns.projectNumber && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono font-bold text-slate-900 bg-blue-50/40">
                          {row.projectNumber || '—'}
                        </td>
                      )}

                      {/* Col H: Version */}
                      {visibleColumns.version && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">
                          {row.version ? (
                            <span
                              className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold border ${
                                isRevisedVersion(row.version)
                                  ? 'bg-amber-100 text-amber-950 border-amber-300'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                            >
                              {row.version}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* Col I: Job Type */}
                      {visibleColumns.jobType && (
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider border ${
                              row.jobType === 'For Correction' || (row.jobType && row.jobType.toLowerCase().includes('correct'))
                                ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                : row.jobType === 'Re-PSU (Revised)' || (row.jobType && row.jobType.toLowerCase().includes('rev'))
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : 'bg-blue-50 text-blue-900 border-blue-200'
                            }`}
                          >
                            {row.jobType || 'New Installs'}
                          </span>
                        </td>
                      )}

                      {/* Col J: Study Type */}
                      {visibleColumns.study && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-900" title={row.studyType}>
                          {row.studyType || '—'}
                        </td>
                      )}

                      {/* Col K: Email Category */}
                      {visibleColumns.category && (
                        <td className="px-3 py-2.5 truncate max-w-[160px] text-slate-900 font-semibold" title={row.emailCategory}>
                          {row.emailCategory || '—'}
                        </td>
                      )}

                      {/* Col L: Sub-Category / Description */}
                      {visibleColumns.reason && (
                        <td className="px-3 py-2.5 truncate max-w-[180px] text-slate-600" title={row.emailSubCategory}>
                          {row.emailSubCategory || '—'}
                        </td>
                      )}

                      {/* Col M: Remarks */}
                      {visibleColumns.remarks && (
                        <td className="px-3 py-2.5 truncate max-w-[220px] text-slate-600 text-[11px]" title={row.remarks}>
                          {row.remarks || '—'}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row Detail Inspector Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs font-mono shadow-xs">
                  #{selectedRow.rowNumber}
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-display flex items-center gap-2">
                    <span>Project {selectedRow.projectNumber}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-xs font-bold uppercase border ${
                        selectedRow.jobType === 'For Correction' || (selectedRow.jobType && selectedRow.jobType.toLowerCase().includes('correct'))
                          ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                          : selectedRow.jobType === 'Re-PSU (Revised)' || (selectedRow.jobType && selectedRow.jobType.toLowerCase().includes('rev'))
                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                          : 'bg-blue-50 text-blue-900 border-blue-200'
                      }`}
                    >
                      {selectedRow.jobType || 'New Installs'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Google Sheet Row #{selectedRow.rowNumber} &bull; Version: {selectedRow.version || 'Initial'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Email Address</span>
                <span className="font-semibold text-slate-900 break-all">{selectedRow.emailAddress || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Logged Timestamp (MNL)</span>
                <span className="font-mono text-slate-600">{selectedRow.timestampMnl || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Scheduler</span>
                <span className="font-semibold text-slate-900">{selectedRow.scheduler || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Region</span>
                <span className="font-mono font-semibold text-slate-900">{selectedRow.region || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">PSU Received Date</span>
                <span className="font-mono text-slate-900 font-semibold">{selectedRow.psuReceivedDateMnl || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">PSU Received Time</span>
                <span className="font-mono text-slate-600">{selectedRow.psuReceivedTimeMnl || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Study / Study Type</span>
                <span className="font-semibold text-slate-900">{selectedRow.studyType || '—'}</span>
              </div>

              <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Email Category</span>
                <span className="text-slate-900 font-semibold">{selectedRow.emailCategory || '—'}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200 text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Email Sub-Category / Description</span>
              <p className="text-slate-900 mt-0.5 leading-relaxed font-medium">{selectedRow.emailSubCategory || '—'}</p>
            </div>

            <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200 text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Remarks</span>
              <p className="text-slate-900 mt-0.5 leading-relaxed whitespace-pre-wrap font-medium">{selectedRow.remarks || '—'}</p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    `Project: ${selectedRow.projectNumber}\nScheduler: ${selectedRow.scheduler}\nRegion: ${selectedRow.region}\nJob Type: ${selectedRow.jobType}\nVersion: ${selectedRow.version}\nStudy: ${selectedRow.studyType}\nRemarks: ${selectedRow.remarks}`,
                    'modal'
                  )
                }
                className="px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-blue-900 bg-slate-50 hover:bg-blue-50 rounded-sm transition-colors flex items-center gap-1.5 border border-slate-300 hover:border-blue-300 shadow-2xs"
              >
                {copiedField === 'modal' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied Record
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" /> Copy Record
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-sm transition-colors shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
