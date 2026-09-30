import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Mail,
  Paperclip,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Camera,
  ScanLine,
  Maximize2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ParseResult, PsuFormData, AttachmentInfo } from '../types';
import { parseFileClientSide, parseFilesClientSide } from '../lib/clientFileParser';
import { PdfViewerModal } from './PdfViewerModal';
import { capturePage1HeaderScreenshot } from '../lib/pdfScreenshot';
import { extractTargetedPdfSections } from '../lib/roster';

interface FileUploaderProps {
  onParsed: (result: ParseResult) => void;
  isParsing: boolean;
  setIsParsing: (val: boolean) => void;
  currentResult: ParseResult | null;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onParsed,
  isParsing,
  setIsParsing,
  currentResult,
}) => {
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [showExtractedDetails, setShowExtractedDetails] = useState<boolean>(false);
  const [showAttachmentSnippet, setShowAttachmentSnippet] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedPdfForView, setSelectedPdfForView] = useState<AttachmentInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * For all attached PDF files:
   * Captures the Page 1 header & PROJECT DETAILS screenshot (as in user reference photo)
   * and sends it to /api/extract-screenshot to extract Project Number, Study Type, and Region directly from the crop.
   */
  const enrichWithPage1Screenshots = async (result: ParseResult): Promise<ParseResult> => {
    if (!result || !result.metadata || !Array.isArray(result.metadata.attachments)) {
      return result;
    }

    const updatedAttachments = [...result.metadata.attachments];
    let anyUpdated = false;

    for (let i = 0; i < updatedAttachments.length; i++) {
      const att = { ...updatedAttachments[i] };
      if (att.isPdf && att.base64Data && !att.screenshotDataUrl) {
        try {
          // Strictly crop the specific section where Project Number & Study Type are visible
          const shot = await capturePage1HeaderScreenshot(att.base64Data, {
            cropHeightRatio: 0.46,
            cropWidthRatio: 0.62,
            cropXRatio: 0.0,
            cropYRatio: 0.0,
          });
          att.screenshotDataUrl = shot.screenshotDataUrl;
          anyUpdated = true;

          // Immediately populate any fields detected directly during screenshot capture
          if (shot.projectNumber && !att.projectNumber) att.projectNumber = shot.projectNumber;
          if (shot.study && (!att.study || att.study === 'Uncategorized')) att.study = shot.study;
          if (shot.region && !att.region) att.region = shot.region;
          if (shot.cityState && !att.cityState) att.cityState = shot.cityState;

          // Re-extract targeted sections from the cleanly reconstructed visual text of Page 1
          const readableText = (shot.croppedText && shot.croppedText.length > 20 ? shot.croppedText : shot.page1Text) || '';
          if (readableText) {
            const targeted = extractTargetedPdfSections(readableText);
            const currentSnip = att.extractedTextSnippet || '';
            if (!currentSnip || currentSnip.includes('%PDF-') || currentSnip.includes('/FlateDecode') || currentSnip.length < 15) {
              att.extractedTextSnippet = targeted.targetedSnippet || readableText.substring(0, 1000).trim();
            }
            if (targeted.projectNumber && !att.projectNumber) att.projectNumber = targeted.projectNumber;
            if (targeted.study && (!att.study || att.study === 'Uncategorized')) att.study = targeted.study;
            if (targeted.region && !att.region) att.region = targeted.region;
            if (targeted.cityState && !att.cityState) att.cityState = targeted.cityState;
          }

          // OCR screenshot via /api/extract-screenshot to extract Project Number & Study Type from this crop
          try {
            const res = await fetch('/api/extract-screenshot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image: shot.screenshotDataUrl,
                fileName: att.fileName,
              }),
            });
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
              const shotData = await res.json();
              if (shotData.success) {
                if (shotData.projectNumber) att.projectNumber = shotData.projectNumber;
                if (shotData.study) att.study = shotData.study;
                if (shotData.region) att.region = shotData.region;
                if (shotData.cityState) att.cityState = shotData.cityState;
                if (shotData.verbatimText) att.extractedTextSnippet = shotData.verbatimText;
              }
            }
          } catch (ocrErr) {
            console.warn('Screenshot OCR fetch failed:', ocrErr);
          }
        } catch (shotErr) {
          console.warn('Failed to capture Page 1 header screenshot for attachment:', att.fileName, shotErr);
        }
      }
      updatedAttachments[i] = att;
    }

    if (anyUpdated) {
      const firstPdf = updatedAttachments.find((a) => a.isPdf && (a.projectNumber || a.study));
      const newExtracted = { ...result.extractedData };
      if (firstPdf) {
        if (firstPdf.projectNumber && (!newExtracted.projectNumber || newExtracted.projectNumber === '')) {
          newExtracted.projectNumber = firstPdf.projectNumber;
        }
        if (firstPdf.study && (!newExtracted.study || newExtracted.study === 'Uncategorized')) {
          newExtracted.study = firstPdf.study;
        }
        if (firstPdf.region && !newExtracted.region) {
          newExtracted.region = firstPdf.region;
        }
      }

      // Also update project items matching PDF files
      if (Array.isArray(newExtracted.projects)) {
        newExtracted.projects = newExtracted.projects.map((p) => {
          const matchedAtt = updatedAttachments.find((a) => a.fileName === p.sourceFile);
          if (matchedAtt) {
            return {
              ...p,
              projectNumber: matchedAtt.projectNumber || p.projectNumber,
              study: matchedAtt.study || p.study,
            };
          }
          return p;
        });
      }

      return {
        ...result,
        metadata: {
          ...result.metadata,
          attachments: updatedAttachments,
        },
        extractedData: newExtracted,
      };
    }

    return result;
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadError(null);
    setIsParsing(true);

    try {
      // 1. First attempt to parse via backend server endpoint
      let serverSuccess = false;
      try {
        const formData = new FormData();
        fileArray.forEach((f) => {
          formData.append('files', f);
        });
        formData.append('file', fileArray[0]);

        const response = await fetch('/api/parse-email', {
          method: 'POST',
          body: formData,
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          if (response.ok && data.success) {
            const enriched = await enrichWithPage1Screenshots(data);
            onParsed(enriched);
            serverSuccess = true;
            return;
          } else if (data.error) {
            console.warn('Backend parse returned error, trying client parser:', data.error);
          }
        } else {
          console.warn('Backend returned non-JSON response, falling back to client-side parser');
        }
      } catch (networkOrApiErr) {
        console.warn('Server API call failed, trying client parser:', networkOrApiErr);
      }

      // 2. If backend is warming up or had an error, use client-side fallback
      if (!serverSuccess) {
        const clientResult = await parseFilesClientSide(fileArray);
        const enrichedClient = await enrichWithPage1Screenshots(clientResult);
        onParsed(enrichedClient);
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setUploadError(err.message || 'Error processing file(s). Please ensure they are valid .msg, .eml, or .pdf files.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Box */}
      <div
        id="file-drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-150 ${
          dragOver
            ? 'border-blue-600 bg-blue-50/70 scale-[0.99]'
            : 'border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="email-file-input"
          accept=".msg,.eml,.pdf,application/pdf,message/rfc822,application/vnd.ms-outlook"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/25 flex items-center justify-center">
            {isParsing ? (
              <div className="w-6 h-6 border-2 border-blue-200 border-t-white rounded-full animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6 text-white" />
            )}
          </div>

          <div>
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 font-display">
              {isParsing
                ? 'Parsing Outlook Email & PDF Attachments...'
                : 'Upload Outlook Email File (.msg or .eml) or PDF'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Drag &amp; drop your files here, or click to browse.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
            <span className="px-2.5 py-1 text-[9px] font-bold tracking-widest uppercase bg-blue-50 text-blue-700 rounded-md border border-blue-200 shadow-2xs">
              .MSG (Outlook)
            </span>
            <span className="px-2.5 py-1 text-[9px] font-bold tracking-widest uppercase bg-blue-50 text-blue-700 rounded-md border border-blue-200 shadow-2xs">
              .EML (Email)
            </span>
            <span className="px-2.5 py-1 text-[9px] font-bold tracking-widest uppercase bg-blue-50 text-blue-700 rounded-md border border-blue-200 shadow-2xs">
              .PDF (Attachment)
            </span>
          </div>
        </div>
      </div>

      {/* Upload error display */}
      {uploadError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div>
            <div className="font-semibold">Upload &amp; Parsing Failed</div>
            <div className="mt-0.5">{uploadError}</div>
          </div>
        </div>
      )}

      {/* Parsed Metadata & Cropped Image Section */}
      {currentResult && currentResult.success && (() => {
        const hasScreenshots = currentResult.metadata.attachments.some(
          (a) => a.isPdf && a.screenshotDataUrl
        );
        const isDetailsVisible = showExtractedDetails || !hasScreenshots;

        return (
          <div className="space-y-3">
            {/* Top Unhide / Hide Toggle Bar (Strictly contained, no overlaps) */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 sm:p-3.5 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <span className="p-1.5 bg-blue-600 text-white rounded-md shrink-0 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4
                        className="text-xs font-bold uppercase tracking-wider text-slate-900 truncate max-w-[160px] sm:max-w-xs"
                        title={currentResult.metadata.fileName}
                      >
                        {currentResult.metadata.fileName}
                      </h4>
                      {currentResult.metadata.attachments.length > 0 && (
                        <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-medium shrink-0">
                          {currentResult.metadata.attachments.length} file{currentResult.metadata.attachments.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {currentResult.metadata.subject || 'Metadata & PDF attachments extracted'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowExtractedDetails((prev) => !prev)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  {isDetailsVisible ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-blue-200" />
                      <span className="hidden sm:inline">Hide Details</span>
                      <span className="sm:hidden">Hide</span>
                      <ChevronUp className="w-3.5 h-3.5 text-blue-200" />
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-sky-200" />
                      <span className="hidden sm:inline">Unhide Details</span>
                      <span className="sm:hidden">Unhide</span>
                      <ChevronDown className="w-3.5 h-3.5 text-sky-200" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Details Card: Hidden by default, toggled open via Unhide button */}
            {isDetailsVisible && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Email Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-[10px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      Email Header Details
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Subject: </span>
                      <span className="text-slate-900 font-bold">{currentResult.metadata.subject || '(No subject)'}</span>
                    </div>
                    <div className="truncate">
                      <span className="font-medium text-slate-500">From: </span>
                      <span className="text-slate-900 font-mono text-[11px]">{currentResult.metadata.from || 'N/A'}</span>
                    </div>
                    {currentResult.metadata.to && (
                      <div className="truncate">
                        <span className="font-medium text-slate-500">To: </span>
                        <span className="text-slate-900 font-mono text-[11px]">{currentResult.metadata.to}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-[10px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      PSU Sent / Received Timing
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Date (MNL)</div>
                        <div className="text-xs font-bold text-slate-900 font-mono mt-0.5">
                          {currentResult.metadata.dateMnl || 'N/A'}
                        </div>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Time (MNL)</div>
                        <div className="text-xs font-bold text-slate-900 font-mono mt-0.5">
                          {currentResult.metadata.timeMnl || 'N/A'}
                        </div>
                      </div>
                    </div>
                    {currentResult.metadata.dateSentReceivedRaw && (
                      <div className="text-[10px] text-slate-500 font-mono truncate">
                        Raw: {currentResult.metadata.dateSentReceivedRaw}
                      </div>
                    )}
                  </div>
                </div>

                {/* Attachments list */}
                {currentResult.metadata.attachments.length > 0 && (
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-blue-600" />
                        <span>Attachments ({currentResult.metadata.attachments.length})</span>
                      </div>
                      {currentResult.metadata.attachments.some((a) => a.extractedTextSnippet) && (
                        <button
                          type="button"
                          onClick={() => setShowAttachmentSnippet(!showAttachmentSnippet)}
                          className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
                        >
                          {showAttachmentSnippet ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5" /> Hide Extracted Text
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5" /> View Extracted Text
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {currentResult.metadata.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                            att.isPdf
                              ? 'bg-blue-50 text-blue-900 border-blue-200 font-semibold'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          <FileText className={`w-3.5 h-3.5 ${att.isPdf ? 'text-blue-600' : 'text-slate-500'}`} />
                          <span className="truncate max-w-[200px]">{att.fileName}</span>
                          <span className="text-[10px] opacity-70 font-mono">
                            ({Math.round(att.size / 1024)} KB)
                          </span>
                          {att.isPdf && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPdfForView(att);
                              }}
                              className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-2xs transition-colors"
                              title="View PDF and extracted text"
                            >
                              <Eye className="w-2.5 h-2.5 text-white" />
                              <span>View</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Collapsible extracted PDF Page 1 text snippet */}
                    {showAttachmentSnippet && (
                      <div className="mt-3 pt-3 border-t border-neutral-100 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-rose-500" />
                            PDF Page 1 Extracted Content &amp; Layout:
                          </span>
                          <span className="text-[10px] font-normal text-neutral-400">
                            Strictly extracted from First Page
                          </span>
                        </div>
                        {currentResult.metadata.attachments
                          .filter((a) => a.extractedTextSnippet)
                          .map((att, aIdx) => {
                            const cleanSnippet = (att.extractedTextSnippet || '')
                              .replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '')
                              .trim();
                            return (
                              <div key={aIdx} className="bg-neutral-50 rounded-lg border border-neutral-200 overflow-hidden">
                                <div className="px-3 py-1.5 bg-neutral-100/70 border-b border-neutral-200 flex items-center justify-between text-[11px]">
                                  <span className="font-semibold text-neutral-700 flex items-center gap-1.5">
                                    <FileText className="w-3 h-3 text-rose-500" />
                                    {att.fileName}
                                    {att.projectNumber && (
                                      <span className="font-mono text-[10px] bg-neutral-200 text-neutral-800 px-1.5 py-0.2 rounded">
                                        #{att.projectNumber}
                                      </span>
                                    )}
                                    {att.study && (
                                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">
                                        {att.study}
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPdfForView(att)}
                                      className="text-[10px] font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>View PDF</span>
                                    </button>
                                    <span className="text-[10px] text-neutral-400 font-mono">
                                      Page 1 Only
                                    </span>
                                  </div>
                                </div>
                                <pre className="text-[11px] font-mono p-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-neutral-800 leading-relaxed select-text">
                                  {cleanSnippet || '(No text could be extracted from Page 1)'}
                                </pre>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Page 1 Targeted Screenshots (Project Number & Study Crop) Gallery - ALWAYS SHOWN ON DEFAULT */}
            {hasScreenshots && (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5 min-w-0">
                    <Camera className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate">Page 1 Cropped Image (Project # &amp; Study)</span>
                  </div>
                  <span className="text-[9px] font-mono bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">
                    Targeted Crop
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {currentResult.metadata.attachments
                    .filter((a) => a.isPdf && a.screenshotDataUrl)
                    .map((att, sIdx) => (
                      <div
                        key={sIdx}
                        className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden hover:border-blue-400 transition-all shadow-2xs group"
                      >
                        <div className="relative bg-slate-950 overflow-hidden cursor-pointer" onClick={() => setSelectedPdfForView(att)}>
                          <img
                            src={att.screenshotDataUrl}
                            alt={`Targeted screenshot for ${att.fileName}`}
                            className="w-full h-auto max-h-60 sm:max-h-72 object-contain bg-white group-hover:scale-[1.01] transition-transform duration-200"
                            loading="lazy"
                          />
                          <div className="absolute top-2 left-2 bg-slate-950/85 backdrop-blur-xs text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow max-w-[65%] truncate">
                            {att.fileName}
                          </div>
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            <span className="bg-emerald-950/90 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded shadow flex items-center gap-1 border border-emerald-800">
                              <ScanLine className="w-2.5 h-2.5" /> Scanned
                            </span>
                          </div>
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPdfForView(att);
                              }}
                              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-900 font-bold uppercase tracking-wider text-xs rounded shadow-md flex items-center gap-1.5"
                            >
                              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                              Inspect Screenshot
                            </button>
                          </div>
                        </div>

                        {/* Metadata pill row extracted from screenshot */}
                        <div className="p-2.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {att.projectNumber ? (
                              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                                #{att.projectNumber}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">No Project # detected</span>
                            )}
                            {att.study && (
                              <span className="bg-blue-600 text-white font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded">
                                {att.study}
                              </span>
                            )}
                            {att.region && (
                              <span className="text-slate-600 text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                                {att.region}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPdfForView(att)}
                            className="text-[11px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0"
                          >
                            <Eye className="w-3 h-3 text-blue-600" />
                            <span>View Crop</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Interactive PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={Boolean(selectedPdfForView)}
        onClose={() => setSelectedPdfForView(null)}
        attachment={selectedPdfForView}
        onUpdateExtracted={(updated) => {
          if (!currentResult) return;
          const updatedAttachments = currentResult.metadata.attachments.map((a) => {
            if (a.fileName === selectedPdfForView?.fileName) {
              return {
                ...a,
                projectNumber: updated.projectNumber || a.projectNumber,
                study: updated.study || a.study,
                region: updated.region || a.region,
                extractedTextSnippet: updated.page1Text || a.extractedTextSnippet,
              };
            }
            return a;
          });

          const updatedResult: ParseResult = {
            ...currentResult,
            metadata: {
              ...currentResult.metadata,
              attachments: updatedAttachments,
            },
            extractedData: {
              ...currentResult.extractedData,
              projectNumber: updated.projectNumber || currentResult.extractedData.projectNumber,
              study: updated.study || currentResult.extractedData.study,
              region: updated.region || currentResult.extractedData.region,
            },
          };
          onParsed(updatedResult);
        }}
      />
    </div>
  );
};
