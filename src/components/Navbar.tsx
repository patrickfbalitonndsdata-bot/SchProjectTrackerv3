import React, { useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Settings,
  Lock,
  FileSpreadsheet,
  FileText,
  Sun,
  Moon,
} from 'lucide-react';
import { formatToManila } from '../lib/dateUtils';
import { FIXED_SPREADSHEET_URL, FIXED_SHEET_NAME } from '../lib/sheetsApi';
import { useTheme } from '../context/ThemeContext';

interface NavbarProps {
  activeTab: 'entry' | 'mirror';
  onSelectTab: (tab: 'entry' | 'mirror') => void;
  appsScriptConnected: boolean;
  onOpenAppsScriptSetup: () => void;
  sheetTitle?: string;
  sheetUrl?: string;
  userEmail?: string;
  onChangeUserEmail?: (email: string) => void;
  onOpenSheetSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  appsScriptConnected,
  onOpenAppsScriptSetup,
  sheetTitle,
  sheetUrl,
  onOpenSheetSettings,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [manilaClock, setManilaClock] = useState<string>('');
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const { dateStr, timeStr } = formatToManila(new Date());
      setManilaClock(`${dateStr} ${timeStr} MNL`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 dark:bg-[#0B1736]/95 backdrop-blur-xl border-b border-blue-100 dark:border-[#1C3565] shadow-md shadow-blue-900/5 dark:shadow-black/20 text-slate-900 dark:text-white'
          : 'bg-white/85 dark:bg-[#0B1736]/85 backdrop-blur-md border-b border-blue-100/70 dark:border-[#1C3565]/80 text-slate-900 dark:text-white'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
        {/* Left: Brand Identity */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
          <div className="w-8 h-8 sm:w-8.5 sm:h-8.5 bg-blue-600 dark:bg-amber-500 text-white dark:text-slate-950 rounded-lg flex items-center justify-center font-display font-extrabold text-xs sm:text-sm tracking-tighter shadow-xs transition-transform duration-300 hover:scale-105">
            PSU
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-xs sm:text-[13px] lg:text-sm text-slate-900 dark:text-white tracking-[0.04em] uppercase whitespace-nowrap">
                SCH <span className="text-blue-600 dark:text-amber-400 font-bold">Project Tracker</span>
              </span>
              <span className="px-1.5 py-0.2 text-[8.5px] font-bold tracking-wider bg-blue-50 dark:bg-amber-400/20 text-blue-700 dark:text-amber-300 rounded-full border border-blue-200 dark:border-amber-400/40 uppercase font-mono">
                3.0
              </span>
            </div>
            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium tracking-wider uppercase block -mt-0.5 hidden sm:block whitespace-nowrap">
              PSU Tracking Automation &bull; v3.0
            </span>
          </div>
        </div>

        {/* Center: Navigation Dock (Floating Pill) */}
        <nav className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-[#081229] backdrop-blur-md rounded-full border border-slate-200/90 dark:border-[#1C3565] shadow-inner">
          <button
            id="tab-btn-entry"
            type="button"
            onClick={() => onSelectTab('entry')}
            className={`group relative inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer ${
              activeTab === 'entry'
                ? 'bg-blue-600 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm shadow-blue-500/30 dark:shadow-amber-500/25 font-bold'
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-amber-300 hover:bg-white/80 dark:hover:bg-[#102046]'
            }`}
          >
            <FileText className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />
            <span>PSU Entry</span>
            {activeTab === 'entry' && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-200 dark:bg-slate-900 shadow-xs animate-pulse" />
            )}
          </button>

          <button
            id="tab-btn-mirror"
            type="button"
            onClick={() => onSelectTab('mirror')}
            className={`group relative inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer ${
              activeTab === 'mirror'
                ? 'bg-blue-600 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm shadow-blue-500/30 dark:shadow-amber-500/25 font-bold'
                : 'bg-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-amber-300 hover:bg-white/80 dark:hover:bg-[#102046]'
            }`}
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110 ${
              activeTab === 'mirror' ? 'text-white dark:text-slate-950' : 'text-blue-600 dark:text-amber-400 group-hover:text-blue-700 dark:group-hover:text-amber-300'
            }`} />
            <span>Sheet Mirror</span>
            <span className="hidden sm:inline-flex px-1.5 py-0.2 text-[8.5px] font-bold bg-amber-100 dark:bg-amber-400/20 text-amber-800 dark:text-amber-300 rounded-full border border-amber-200 dark:border-amber-400/40">
              LIVE
            </span>
          </button>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {/* Manila Time Clock */}
          <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-mono text-slate-600 dark:text-slate-300 px-2.5 py-1 bg-slate-100 dark:bg-[#102046] rounded-full border border-slate-200 dark:border-[#1C3565] mr-1">
            <Clock className="w-3 h-3 text-slate-500 dark:text-amber-400" />
            <span>{manilaClock || 'MNL TIME'}</span>
          </div>

          {/* Dark Mode Toggle Button (Navy & Gold Palette) */}
          <button
            type="button"
            id="theme-toggle-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode (Navy Blue & Gold)'}
            className={`group inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold tracking-wide transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer ${
              isDark
                ? 'bg-[#102046] hover:bg-[#162C5C] text-amber-300 border border-amber-400/40 shadow-xs shadow-amber-400/10'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            {isDark ? (
              <>
                <Moon className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30 transition-transform duration-300 group-hover:-rotate-12" />
                <span className="font-mono text-[11px] font-bold text-amber-300 hidden sm:inline">Navy &amp; Gold</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500 transition-transform duration-300 group-hover:rotate-90" />
                <span className="font-mono text-[11px] text-slate-700 hidden sm:inline">Dark Mode</span>
              </>
            )}
          </button>

          {/* Google Sheet Link */}
          <a
            href={sheetUrl || FIXED_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Google Sheet in new tab"
            className="group inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold tracking-wide text-slate-700 hover:text-blue-700 bg-transparent hover:bg-blue-50/80 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            <span className="hidden lg:inline">{sheetTitle || FIXED_SHEET_NAME}</span>
            <span className="lg:hidden">Sheet</span>
            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>

          {/* Settings Modal */}
          {onOpenSheetSettings && (
            <button
              type="button"
              id="navbar-change-sheet-link-btn"
              onClick={onOpenSheetSettings}
              title="Sheet Link & Tab Settings (Password protected)"
              className="group inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold tracking-wide text-slate-700 hover:text-slate-900 bg-transparent hover:bg-slate-100 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            >
              <Lock className="w-2.5 h-2.5 text-slate-400 group-hover:text-slate-600" />
              <Settings className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-800 transition-transform duration-300 group-hover:rotate-45" />
              <span className="hidden md:inline">Settings</span>
            </button>
          )}

          {/* Apps Script Status */}
          <button
            id="apps-script-status-btn"
            type="button"
            onClick={onOpenAppsScriptSetup}
            title="Google Apps Script API status (Click to configure)"
            className="group inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-full text-xs font-semibold tracking-wide text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all duration-200 transform hover:-translate-y-0.5 active:scale-95 cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                appsScriptConnected
                  ? 'bg-emerald-500 shadow-xs'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="hidden sm:inline text-slate-500 text-[10px]">API:</span>
            <span className="text-[11px] font-mono font-medium">{appsScriptConnected ? 'Online' : 'Setup'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
