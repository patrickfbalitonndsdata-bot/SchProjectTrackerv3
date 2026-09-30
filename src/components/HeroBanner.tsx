import React from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Sparkles,
  Zap,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import lightBlueHeroImg from '../assets/images/light_blue_hero_1790694964629.jpg';
import blueParserImg from '../assets/images/blue_parser_card_1790694984016.jpg';
import blueSheetImg from '../assets/images/blue_sheet_card_1790695001866.jpg';
import heroImg from '../assets/images/hero_banner_transport_1790102708525.jpg';
import { FIXED_SPREADSHEET_URL } from '../lib/sheetsApi';

interface HeroBannerProps {
  onLogPsuClick: () => void;
  onExploreSheetClick: () => void;
  onUploadClick: () => void;
  onViewRevisionsClick: () => void;
  appsScriptConnected: boolean;
  sheetUrl?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onLogPsuClick,
  onExploreSheetClick,
  onUploadClick,
  onViewRevisionsClick,
  appsScriptConnected,
  sheetUrl,
}) => {
  return (
    <section className="relative w-full overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50/70 to-indigo-50/40 text-slate-900 border-b border-blue-100/80">
      {/* 1. Full Background Image with Integrated Multi-stop Fading Gradients (Light Blue Theme) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <img
          src={lightBlueHeroImg}
          alt="PSU Tracking Operations Desk"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-1000 opacity-35 filter contrast-105"
        />

        {/* Horizontal Gradient Overlay: Clean luminous soft blue fade for high readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-sky-50/85 to-blue-100/40" />

        {/* Ambient Top Subtle Vignette */}
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-white/60 to-transparent" />

        {/* Bottom Seamless Gradient Fade: Melts directly into page canvas (#F4F7FB) */}
        <div className="absolute bottom-0 inset-x-0 h-40 sm:h-56 bg-gradient-to-b from-transparent via-[#F4F7FB]/70 to-[#F4F7FB]" />
      </div>

      {/* Top Editorial Ribbon */}
      <div className="relative z-10 bg-white/85 backdrop-blur-md text-blue-900 px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] font-bold tracking-[0.2em] uppercase border-b border-blue-100 shadow-2xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          <span className="text-slate-900 font-extrabold">PRECISION TRAFFIC LOGISTICS &bull; ASIA PACIFIC</span>
          <span className="hidden md:inline text-blue-600/80">&bull; REAL-TIME REVISION DISPATCH</span>
        </div>
        <div className="flex items-center space-x-4 text-blue-900">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200/80 font-mono text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${appsScriptConnected ? 'bg-blue-600' : 'bg-amber-500'}`} />
            {appsScriptConnected ? 'API SYNCHRONIZED' : 'API STANDBY'}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-20 sm:pb-28">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100/90 text-blue-900 border border-blue-200 rounded-full text-[10px] font-bold tracking-[0.25em] uppercase shadow-2xs">
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>PSU TRACKING AUTOMATION</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.03em] text-slate-900 leading-[0.98] uppercase">
              PROJECT LOGISTIC
              <br />
              <span className="text-blue-600">AND TRACKER</span>
            </h1>

            <div className="w-14 h-1.5 bg-blue-600 rounded-full mt-4 mb-3" />

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal max-w-lg">
              Instant Outlook email extraction (.msg &amp; .eml), automated multi-project recognition, and direct real-time synchronization to your Google Sheet.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="hero-log-psu-btn"
              type="button"
              onClick={onLogPsuClick}
              className="px-7 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold uppercase tracking-[0.2em] rounded-lg transition-all shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/35 active:scale-[0.98] flex items-center gap-2 group cursor-pointer"
            >
              <span>LOG PSU NOW</span>
              <ArrowRight className="w-3.5 h-3.5 text-white transition-transform group-hover:translate-x-1" />
            </button>

            <button
              id="hero-explore-sheet-btn"
              type="button"
              onClick={onExploreSheetClick}
              className="px-6 py-3.5 bg-white hover:bg-blue-50/80 text-blue-900 border border-blue-200 hover:border-blue-300 text-xs font-bold uppercase tracking-[0.2em] rounded-lg transition-all shadow-2xs active:scale-[0.98] flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>EXPLORE LIVE SHEET</span>
            </button>
          </div>

          {/* Quick Micro Status Badges */}
          <div className="pt-2 flex items-center gap-6 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>100% OCR ACCURACY</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-500" />
              <span>ZERO-LATENCY SYNC</span>
            </div>
          </div>
        </div>

        {/* Floating Module Cards Over the Gradient Transition */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Card 1: Outlook Email Parser */}
          <div
            onClick={onUploadClick}
            className="group cursor-pointer bg-white/90 hover:bg-white backdrop-blur-md border border-blue-100 hover:border-blue-300 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-sm hover:shadow-md"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-blue-100 bg-blue-50">
              <img
                src={blueParserImg}
                alt="Outlook Email Parser"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-600">
                MODULE 01
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                EMAIL &amp; PDF PARSER
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Automated extraction of projects, schedules &amp; targeted Page 1 OCR crop.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>START PARSING</span>
                <ArrowRight className="w-3 h-3 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Card 2: Live Sheet Mirror */}
          <div
            onClick={onExploreSheetClick}
            className="group cursor-pointer bg-white/90 hover:bg-white backdrop-blur-md border border-blue-100 hover:border-blue-300 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-sm hover:shadow-md"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-blue-100 bg-blue-50">
              <img
                src={blueSheetImg}
                alt="Google Sheet Mirror"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-600">
                MODULE 02
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                GOOGLE SHEET MIRROR
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Direct 13-column bidirectional Apps Script reflection with instant metrics.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>OPEN MIRROR</span>
                <ArrowRight className="w-3 h-3 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Card 3: Re-PSU & Revision Monitor */}
          <div
            onClick={onViewRevisionsClick}
            className="group cursor-pointer bg-white/90 hover:bg-white backdrop-blur-md border border-blue-100 hover:border-blue-300 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-sm hover:shadow-md"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-blue-100 bg-blue-50">
              <img
                src={heroImg}
                alt="Re-PSU Revision Engine"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-bottom filter contrast-105 group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-blue-600">
                MODULE 03
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                RE-PSU &amp; AUDIT LOGS
              </h3>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                Smart version tracking (Initial, v1, v2+) with automated revision validation.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>VIEW REVISIONS</span>
                <ArrowRight className="w-3 h-3 text-blue-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
