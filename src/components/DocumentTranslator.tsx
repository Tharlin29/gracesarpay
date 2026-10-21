import React, { useState, useRef, useEffect } from 'react';
import {
  ParsedDocument,
  parseUploadedFile,
} from '../lib/fileParser';
import {
  downloadAsWord,
  downloadAsPdf,
  downloadAsTxt,
  printMyanmarDocument,
  copyToClipboard,
} from '../lib/exportUtils';
import {
  repairMyanmarDocumentText,
} from '../lib/myanmarFontFixer';
import {
  playUploadSound,
  playSuccessSound,
  playWarningSound,
} from '../lib/sound';
import {
  TranslationHistoryItem,
  saveLocalHistory,
  getLocalHistory,
} from '../lib/firebase';
import {
  UploadCloud,
  FileText,
  Sparkles,
  Download,
  Copy,
  Check,
  Clock,
  Layers,
  BookOpen,
  ChevronDown,
  FileDown,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Wrench,
  Type,
  Printer,
  Briefcase,
  Feather,
  CheckCircle2,
} from 'lucide-react';

export type TranslationStyle = 'official' | 'colloquial' | 'literary';

interface DocumentTranslatorProps {
  userId: string;
  onOpenLargeStudio: (doc: ParsedDocument) => void;
  onSavedToHistory?: (item: TranslationHistoryItem) => void;
}

type MyanmarFontChoice = 'Noto Sans Myanmar' | 'Pyidaungsu' | 'Padauk';

export const DocumentTranslator: React.FC<DocumentTranslatorProps> = ({
  userId,
  onOpenLargeStudio,
  onSavedToHistory,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const [parsing, setParsing] = useState(false);

  // Translation Style Choice (ရုံးသုံး၊ စကားပြေ၊ စာပေ)
  const [translationStyle, setTranslationStyle] = useState<TranslationStyle>(() => {
    return (localStorage.getItem('sarpay_preferred_style') as TranslationStyle) || 'colloquial';
  });
  const [appliedStyle, setAppliedStyle] = useState<TranslationStyle>('colloquial');

  const handleSelectStyle = (style: TranslationStyle) => {
    setTranslationStyle(style);
    try {
      localStorage.setItem('sarpay_preferred_style', style);
    } catch {}
  };

  // Translation states
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Font choices and repair states
  const [selectedFont, setSelectedFont] = useState<MyanmarFontChoice>('Noto Sans Myanmar');
  const [fontRepairNotice, setFontRepairNotice] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Timer states
  const [elapsedSec, setElapsedSec] = useState(0);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [chunksCount, setChunksCount] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // AI Review states
  const [generatingReview, setGeneratingReview] = useState(false);
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'translation' | 'review'>('translation');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file selection
  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setParsing(true);
    setTranslationResult(null);
    setAiReview(null);
    setTranslationError(null);
    setFontRepairNotice(null);
    playUploadSound();

    try {
      const doc = await parseUploadedFile(selectedFile);
      setParsedDoc(doc);

      // Check if document was cleaned of PDF artifacts or Zawgyi
      const check = repairMyanmarDocumentText(doc.totalText);
      if (check.hasPdfArtifacts || check.isZawgyiDetected) {
        setFontRepairNotice(check.summary);
      }
    } catch (e: any) {
      console.error(e);
      playWarningSound();
      setTranslationError(e?.message || 'ဖိုင်အား ဖတ်ရှုတွက်ချက်ရာတွင် အဆင်မပြေဖြစ်သွားပါသည်။ ဖိုင်မှန်ကန်မှု ရှိမရှိ စစ်ဆေးပေးပါ။');
    } finally {
      setParsing(false);
    }
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Font repair action
  const handleRepairTranslation = () => {
    if (!translationResult) return;
    const { repairedText, summary } = repairMyanmarDocumentText(translationResult);
    setTranslationResult(repairedText);
    setFontRepairNotice(summary);
    playSuccessSound();
    setTimeout(() => setFontRepairNotice(null), 6000);
  };

  const handleRepairSourceDoc = () => {
    if (!parsedDoc) return;
    const { repairedText, summary } = repairMyanmarDocumentText(parsedDoc.totalText);
    setParsedDoc({
      ...parsedDoc,
      totalText: repairedText,
      wordCount: repairedText.split(/\s+/).filter(Boolean).length,
    });
    setFontRepairNotice(summary);
    playSuccessSound();
    setTimeout(() => setFontRepairNotice(null), 6000);
  };

  // Execute Translation
  const handleTranslate = async (forceDirect = false) => {
    if (!parsedDoc) return;
    setTranslationError(null);

    // If large book (> 5 pages) and user didn't force direct translation:
    if (parsedDoc.isLargeBook && !forceDirect) {
      onOpenLargeStudio(parsedDoc);
      return;
    }

    setTranslating(true);
    setElapsedSec(0);
    setDurationSec(null);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: parsedDoc.totalText,
          title: parsedDoc.fileName,
          style: translationStyle,
        }),
      });

      const data = await response.json();
      if (data.success && data.translation) {
        // Run Unicode normalization check
        const { repairedText } = repairMyanmarDocumentText(data.translation);
        setTranslationResult(repairedText);
        setAppliedStyle(data.styleUsed || translationStyle);
        setModelUsed(data.modelUsed || 'gemini-3.5-flash');
        setChunksCount(data.totalChunks || data.chunks || 1);
        setDurationSec(data.durationSec || elapsedSec);
        setTranslationError(null);
        playSuccessSound();

        // Auto generate AI Review and summary
        generateBookReview(parsedDoc.fileName, repairedText);

        // Save to small book history
        const historyItem: TranslationHistoryItem = {
          id: 'HIST-S-' + Date.now(),
          userId,
          title: parsedDoc.fileName,
          type: 'small',
          createdAt: Date.now(),
          originalWordCount: parsedDoc.wordCount,
          originalPageCount: parsedDoc.pageCount,
          modelUsed: data.modelUsed || 'gemini-3.5-flash',
          translatedContent: repairedText,
        };
        const allHist = getLocalHistory();
        allHist.unshift(historyItem);
        saveLocalHistory(allHist);
        onSavedToHistory?.(historyItem);
      } else {
        playWarningSound();
        setTranslationError(data.error || 'ဘာသာပြန်ခြင်း မအောင်မြင်ပါ။ ကျေးဇူးပြု၍ ပြန်လည်စမ်းသပ်ပေးပါ။');
      }
    } catch (e: any) {
      console.error(e);
      playWarningSound();
      setTranslationError('ကွန်ရက် သို့မဟုတ် ဆာဗာ အဆက်အသွယ် ချို့ယွင်းနေပါသည်။ ပြန်လည်စမ်းသပ်ပေးပါ။');
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setTranslating(false);
    }
  };

  // Generate AI Review and Summary
  const generateBookReview = async (title: string, text: string) => {
    setGeneratingReview(true);
    try {
      const res = await fetch('/api/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          text: text.slice(0, 30000),
        }),
      });
      const data = await res.json();
      if (data.success && data.review) {
        setAiReview(data.review);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReview(false);
    }
  };

  const handleCopy = async () => {
    if (!translationResult) return;
    const ok = await copyToClipboard(translationResult);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 1. Upload Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="p-8 sm:p-10 rounded-3xl border-2 border-dashed border-blue-200 bg-gradient-to-b from-blue-50/50 via-white to-indigo-50/30 hover:border-blue-400 hover:bg-blue-50/70 transition-all text-center cursor-pointer shadow-xs group"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileChange(e.target.files[0]);
            }
          }}
        />

        <div className="w-16 h-16 rounded-2xl bg-white text-blue-600 shadow-md flex items-center justify-center mx-auto mb-4 border border-blue-100 group-hover:scale-105 transition-transform">
          <UploadCloud className="w-8 h-8 text-blue-600" />
        </div>

        <h3 className="text-base sm:text-lg font-extrabold text-slate-800 tracking-tight">
          PDF သို့မဟုတ် Word File အား ဤနေရာတွင် တင်ပါ
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Drag and drop သို့မဟုတ် နှိပ်၍ <span className="font-semibold text-blue-700">PDF, Word (.docx), TXT</span> ဖိုင်များ ရွေးချယ်နိုင်ပါသည်။
        </p>

        <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>စာမျက်နှာ ၅ မျက်နှာကျော်ပါက ၅ မျက်နှာစီ အပိုင်းခွဲ Translation Studio ဖြင့် အလိုအလျောက် ခွဲထုတ်ပေးပါမည်</span>
        </div>
      </div>

      {/* Parsing indicator */}
      {parsing && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm text-center space-y-2">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-bold text-slate-700">
            PDF နှင့် စာသားများကို သန့်စင်စစ်ဆေး၍ ဖတ်ရှုတွက်ချက်နေပါသည်...
          </div>
          <div className="text-[11px] text-slate-400">
            PDF binary အမှိုက်များနှင့် font formatting များကို အလိုအလျောက် သန့်စင်ပေးနေပါသည်
          </div>
        </div>
      )}

      {/* 2. Uploaded Document Card & Overview */}
      {parsedDoc && !parsing && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-base text-slate-900 truncate max-w-md">
                    {parsedDoc.fileName}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                    {parsedDoc.fileType}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>စာမျက်နှာ: <strong className="text-slate-800">{parsedDoc.pageCount}</strong> မျက်နှာ</span>
                  <span>•</span>
                  <span>စာလုံးရေ: <strong className="text-slate-800">~{parsedDoc.wordCount.toLocaleString()}</strong> လုံး</span>
                  <span>•</span>
                  <span>အရွယ်အစား: {(parsedDoc.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              </div>
            </div>

          </div>

          {/* Translation Style Selection (ရုံးသုံး၊ စကားပြေ၊ စာပေ) */}
          <div className="bg-slate-50/90 rounded-2xl p-4 sm:p-5 border border-slate-200/90 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>ဘာသာပြန်ဆိုမည့် စတိုင် ရွေးချယ်ပါ (Select Translation Style):</span>
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                ဖိုင်အား မပြန်ဆိုမီ လိုအပ်သော အရေးအသားစတိုင်ကို စိတ်ကြိုက်ရွေးချယ်ပါ
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Option 1: ရုံးသုံး */}
              <button
                type="button"
                onClick={() => handleSelectStyle('official')}
                className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
                  translationStyle === 'official'
                    ? 'bg-white border-blue-600 shadow-md ring-2 ring-blue-500/20'
                    : 'bg-white/60 border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        translationStyle === 'official' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-slate-900">၁။ ရုံးသုံးစတိုင် (Official)</h5>
                      <span className="text-[10px] text-blue-600 font-bold">Formal & Legal</span>
                    </div>
                  </div>
                  {translationStyle === 'official' && (
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  စာချုပ်၊ စည်းမျဉ်း၊ အမိန့်စာ၊ ရုံးလုပ်ငန်းသုံး တိကျလေးနက်သော စာအရေးအသား
                </p>
                <div className="mt-2 text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded inline-block">
                  ပါသည် • ဖြစ်ပါသည် • ဆောင်ရွက်ရမည်
                </div>
              </button>

              {/* Option 2: စကားပြေ */}
              <button
                type="button"
                onClick={() => handleSelectStyle('colloquial')}
                className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
                  translationStyle === 'colloquial'
                    ? 'bg-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white/60 border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        translationStyle === 'colloquial' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-slate-900">၂။ စကားပြေစတိုင် (Prose)</h5>
                      <span className="text-[10px] text-indigo-600 font-bold">Recommended / ဖတ်ရလွယ်</span>
                    </div>
                  </div>
                  {translationStyle === 'colloquial' && (
                    <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  ခေတ်ပေါ်စကားပြောစကားပြေ၊ ဖတ်ရှုရရှင်းလင်းလွယ်ကူပြီး အများနားလည်လွယ်သော အရေးအသား
                </p>
                <div className="mt-2 text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded inline-block">
                  တယ် • ပါတယ်။ • လုပ်နိုင်ပါတယ်
                </div>
              </button>

              {/* Option 3: စာပေ */}
              <button
                type="button"
                onClick={() => handleSelectStyle('literary')}
                className={`p-3.5 rounded-xl border text-left transition relative cursor-pointer ${
                  translationStyle === 'literary'
                    ? 'bg-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
                    : 'bg-white/60 border-slate-200 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        translationStyle === 'literary' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Feather className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-slate-900">၃။ စာပေစတိုင် (Literary)</h5>
                      <span className="text-[10px] text-purple-600 font-bold">Classical & Art</span>
                    </div>
                  </div>
                  {translationStyle === 'literary' && (
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  ခန့်ညားထည်ဝါသော ဂန္ထဝင်စာပေ၊ ဒဿန၊ ရသစာပေနှင့် ဝတ္ထုရှည်များအတွက် အဆင့်မြင့်အရေးအသား
                </p>
                <div className="mt-2 text-[10px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded inline-block">
                  ပေသည် • ကုန်၏ • ရာတွင် • တည်း
                </div>
              </button>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleRepairSourceDoc}
              className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title="မူရင်းစာသား၏ ဖောင့်နှင့် အမှိုက်များကို သန့်စင်ပြင်ဆင်မည်"
            >
              <Wrench className="w-4 h-4 text-slate-600" />
              <span>Font & Text စစ်ဆေးသန့်စင်မည်</span>
            </button>

            {parsedDoc.isLargeBook ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onOpenLargeStudio(parsedDoc)}
                  className="py-3 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-amber-300" />
                  <span>စာမျက်နှာ ၅ မျက်နှာစီ အပိုင်းခွဲ Studio ဖွင့်မည် ({parsedDoc.segments.length} ပိုင်း)</span>
                </button>

                <button
                  type="button"
                  disabled={translating}
                  onClick={() => handleTranslate(true)}
                  className="py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>
                    {translating
                      ? 'ဘာသာပြန်နေပါသည်...'
                      : `${
                          translationStyle === 'official'
                            ? 'ရုံးသုံးစတိုင်ဖြင့်'
                            : translationStyle === 'literary'
                            ? 'စာပေစတိုင်ဖြင့်'
                            : 'စကားပြေစတိုင်ဖြင့်'
                        } ဖိုင်တစ်ခုလုံး တိုက်ရိုက်ဘာသာပြန်မည်`}
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={translating}
                onClick={() => handleTranslate(false)}
                className="py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>
                  {translating
                    ? 'ဘာသာပြန်နေပါသည်...'
                    : `${
                        translationStyle === 'official'
                          ? 'ရုံးသုံးစတိုင်ဖြင့်'
                          : translationStyle === 'literary'
                          ? 'စာပေစတိုင်ဖြင့်'
                          : 'စကားပြေစတိုင်ဖြင့်'
                      } မြန်မာစာ ပြန်ဆိုမည်`}
                </span>
              </button>
            )}
          </div>

          {/* Font Repair Banner if active */}
          {fontRepairNotice && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{fontRepairNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setFontRepairNotice(null)}
                className="text-[11px] text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                ပိတ်မည်
              </button>
            </div>
          )}

          {/* Translation Error Banner if any */}
          {translationError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <div className="font-bold text-rose-950">ဘာသာပြန်ဆိုခြင်း အဆင်မပြေပါ</div>
                  <div className="text-[11px] text-rose-700 mt-0.5">{translationError}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTranslate(parsedDoc.isLargeBook)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shrink-0 text-center"
              >
                ပြန်လည်ကြိုးစားမည်
              </button>
            </div>
          )}

          {/* Time & Cascade Notification Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/60 flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <div className="text-[10px] text-blue-700 font-medium">ခန့်မှန်းကြာမြင့်ချိန်</div>
                <div className="text-xs font-bold text-blue-950 font-mono">
                  ~{parsedDoc.estimatedSeconds} စက္ကန့်ခန့်
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/60 flex items-center gap-3">
              <RefreshCw className={`w-5 h-5 text-amber-600 shrink-0 ${translating ? 'animate-spin' : ''}`} />
              <div>
                <div className="text-[10px] text-amber-700 font-medium">ဘာသာပြန် ကြာမြင့်ချိန်</div>
                <div className="text-xs font-bold text-amber-950 font-mono">
                  {durationSec !== null ? `${durationSec} စက္ကန့် (ပြီးစီး)` : translating ? `${elapsedSec} စက္ကန့်` : 'စတင်ရန်အသင့်'}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-[10px] text-emerald-700 font-medium">AI Model ဦးစားပေး အဆင့်</div>
                <div className="text-xs font-bold text-emerald-950 font-mono truncate">
                  {modelUsed || 'gemini-3.5-flash (အဓိကထား)'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Translation Output & AI Review Tabs */}
      {translationResult && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5 animate-in fade-in">
          {/* Output Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('translation')}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'translation'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span>မြန်မာဘာသာပြန်ပြီး စာသား</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('review')}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'review'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>AI စာအုပ်သုံးသပ်ချက်နှင့် အကျဉ်းချုပ်</span>
              </button>
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Font Picker */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <Type className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
                {(['Noto Sans Myanmar', 'Pyidaungsu', 'Padauk'] as MyanmarFontChoice[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedFont(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                      selectedFont === f
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'Noto Sans Myanmar' ? 'Noto' : f}
                  </button>
                ))}
              </div>

              {/* Font Repair Button */}
              <button
                type="button"
                onClick={handleRepairTranslation}
                className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="မြန်မာဖောင့်နှင့် စာလုံးပေါင်း အမှားများကို ပြုပြင်မည်"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-700" />
                <span>Font ပြုပြင်ရန်</span>
              </button>

              {/* Copy button */}
              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="ဘာသာပြန်ပြီး စာသား ကူးယူမည်"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">ကူးယူပြီး</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Format selection download dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download ရွေးချယ်ရန်</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-30 text-slate-800 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase">
                      ဖိုင်အမျိုးအစား ရွေးပါ
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (parsedDoc) {
                          setShowExportMenu(false);
                          setExportProgress('PDF ဖန်တီးနေပါသည်...');
                          await downloadAsPdf(
                            `${parsedDoc.fileName}_Myanmar`,
                            parsedDoc.fileName,
                            translationResult,
                            (msg) => setExportProgress(msg)
                          );
                          setTimeout(() => setExportProgress(null), 3000);
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-rose-50 text-rose-900 flex items-center gap-2 transition cursor-pointer"
                    >
                      <FileDown className="w-4 h-4 text-rose-600" />
                      <div>
                        <div>PDF File (.pdf ဒေါင်းလုဒ်)</div>
                        <div className="text-[10px] text-slate-400 font-normal">စာမျက်နှာအလိုက် မြန်မာဖောင့်မှန် စနစ်</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (parsedDoc) {
                          printMyanmarDocument(parsedDoc.fileName, translationResult);
                        }
                        setShowExportMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-50 text-indigo-900 flex items-center gap-2 transition cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-indigo-600" />
                      <div>
                        <div>Print / Save as PDF (Vector)</div>
                        <div className="text-[10px] text-slate-400 font-normal">Browser တိုက်ရိုက် Save as PDF စနစ်</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (parsedDoc) {
                          downloadAsWord(`${parsedDoc.fileName}_Myanmar`, parsedDoc.fileName, translationResult);
                        }
                        setShowExportMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-blue-50 text-blue-900 flex items-center gap-2 transition cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div>
                        <div>Microsoft Word (.doc)</div>
                        <div className="text-[10px] text-slate-400 font-normal">Word တွင် ပုံနှိပ်ထုတ်ဝေရန် အဆင်သင့်</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (parsedDoc) {
                          downloadAsTxt(`${parsedDoc.fileName}_Myanmar`, translationResult);
                        }
                        setShowExportMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-100 text-slate-800 flex items-center gap-2 transition cursor-pointer"
                    >
                      <BookOpen className="w-4 h-4 text-slate-600" />
                      <div>
                        <div>Text File (.txt)</div>
                        <div className="text-[10px] text-slate-400 font-normal">UTF-8 Unicode သန့်သန့်</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Export progress notification */}
          {exportProgress && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <span>{exportProgress}</span>
            </div>
          )}

          {/* Tab 1: Translation Text Content */}
          {activeTab === 'translation' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold">
                    ဖိုင်တစ်ခုလုံး အစမှအဆုံး ၁၀၀% ပြည့်စုံစွာ ဘာသာပြန်ဆိုပြီးပါပြီ
                  </span>
                </div>
                <span className="text-[11px] font-mono bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md font-bold">
                  Font: {selectedFont}
                </span>
              </div>
              <div
                style={{
                  fontFamily: `'${selectedFont}', 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif`,
                  lineHeight: '2.2',
                }}
                className="p-6 bg-slate-50/70 rounded-2xl border border-slate-200/80 text-sm leading-relaxed text-slate-800 whitespace-pre-line max-h-[550px] overflow-y-auto"
              >
                {translationResult}
              </div>
            </div>
          )}

          {/* Tab 2: AI Review and Summary */}
          {activeTab === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  စာအုပ်၏ အကျဉ်းချုပ်၊ အားသာချက်၊ အားနည်းချက်နှင့် AI သုံးသပ်ချက်များ
                </div>
                {aiReview && (
                  <button
                    type="button"
                    onClick={() => {
                      if (parsedDoc) {
                        downloadAsWord(`${parsedDoc.fileName}_AI_Review_Summary`, `${parsedDoc.fileName} - သုံးသပ်ချက်`, aiReview);
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>သုံးသပ်ချက်ဖိုင် ဒေါင်းလုဒ်ဆွဲမည်</span>
                  </button>
                )}
              </div>

              {generatingReview ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <div className="text-xs font-bold text-indigo-900">
                    AI မှ စာအုပ်၏ အကျဉ်းချုပ်နှင့် သုံးသပ်ချက်များကို ပြုစုရေးသားနေပါသည်...
                  </div>
                </div>
              ) : aiReview ? (
                <div
                  style={{
                    fontFamily: `'${selectedFont}', 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif`,
                    lineHeight: '2.1',
                  }}
                  className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-sm leading-relaxed text-slate-800 whitespace-pre-line max-h-[550px] overflow-y-auto"
                >
                  {aiReview}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-slate-400">
                  သုံးသပ်ချက် မရှိသေးပါ။
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
