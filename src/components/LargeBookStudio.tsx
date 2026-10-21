import React, { useState, useEffect, useRef } from 'react';
import {
  TranslationSegment,
  TranslationHistoryItem,
  saveLocalHistory,
  getLocalHistory,
} from '../lib/firebase';
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
import { playSuccessSound, playWarningSound } from '../lib/sound';
import {
  Layers,
  Copy,
  Check,
  Download,
  Sparkles,
  Play,
  CheckCircle2,
  Clock,
  BookOpen,
  FileText,
  FileDown,
  ArrowLeft,
  ChevronDown,
  Eye,
  RefreshCw,
  AlertCircle,
  Wrench,
  Type,
  Printer,
  Briefcase,
  Feather,
} from 'lucide-react';

interface LargeBookStudioProps {
  userId: string;
  bookTitle: string;
  originalPageCount: number;
  originalWordCount: number;
  initialSegments: TranslationSegment[];
  onBack: () => void;
  onSavedToHistory?: (item: TranslationHistoryItem) => void;
}

type MyanmarFontChoice = 'Noto Sans Myanmar' | 'Pyidaungsu' | 'Padauk';

export const LargeBookStudio: React.FC<LargeBookStudioProps> = ({
  userId,
  bookTitle,
  originalPageCount,
  originalWordCount,
  initialSegments,
  onBack,
  onSavedToHistory,
}) => {
  const [segments, setSegments] = useState<TranslationSegment[]>(initialSegments);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  // Translation Style Choice (ရုံးသုံး၊ စကားပြေ၊ စာပေ)
  const [translationStyle, setTranslationStyle] = useState<'official' | 'colloquial' | 'literary'>(() => {
    return (localStorage.getItem('sarpay_preferred_style') as 'official' | 'colloquial' | 'literary') || 'colloquial';
  });

  const handleSelectStyle = (style: 'official' | 'colloquial' | 'literary') => {
    setTranslationStyle(style);
    try {
      localStorage.setItem('sarpay_preferred_style', style);
    } catch {}
  };

  // Font choices & repair
  const [selectedFont, setSelectedFont] = useState<MyanmarFontChoice>('Noto Sans Myanmar');
  const [fontRepairNotice, setFontRepairNotice] = useState<string | null>(null);

  // Timer states
  const [elapsedSec, setElapsedSec] = useState(0);
  const [estimatedSec, setEstimatedSec] = useState(
    Math.max(10, Math.ceil((originalWordCount / 300) * 2))
  );
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // AI Summary & Review states
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [activeTab, setActiveTab] = useState<'segments' | 'merged' | 'review'>('segments');

  // Completed segments count
  const completedCount = segments.filter((s) => s.status === 'completed').length;
  const progressPercent = Math.round((completedCount / segments.length) * 100);

  // Combined translated text
  const mergedTranslation = segments
    .map((s) => `--- ${s.title} (${s.pageRange}) ---\n\n${s.translatedText || ''}`)
    .join('\n\n\n');

  // Save progress to local history
  const persistHistory = (
    currentSegments: TranslationSegment[],
    reviewText?: string
  ) => {
    const allHistory = getLocalHistory();
    const existingIndex = allHistory.findIndex(
      (h) => h.title === bookTitle && h.type === 'large'
    );

    const historyItem: TranslationHistoryItem = {
      id: existingIndex !== -1 ? allHistory[existingIndex].id : 'HIST-L-' + Date.now(),
      userId,
      title: bookTitle,
      type: 'large',
      createdAt: Date.now(),
      originalWordCount,
      originalPageCount,
      modelUsed: 'gemini-3.5-flash (Cascade)',
      translatedContent: currentSegments.map((s) => s.translatedText).join('\n\n'),
      segments: currentSegments,
      aiReview: reviewText || aiReview || undefined,
    };

    if (existingIndex !== -1) {
      allHistory[existingIndex] = historyItem;
    } else {
      allHistory.unshift(historyItem);
    }
    saveLocalHistory(allHistory);
    onSavedToHistory?.(historyItem);
  };

  // Font Repair Handler for all segments
  const handleRepairAllFonts = () => {
    let modifiedAny = false;
    const updated = segments.map((seg) => {
      let mod = false;
      let newOrig = seg.originalText;
      let newTrans = seg.translatedText;

      if (newOrig) {
        const rOrig = repairMyanmarDocumentText(newOrig);
        if (rOrig.wasModified) {
          newOrig = rOrig.repairedText;
          mod = true;
        }
      }

      if (newTrans) {
        const rTrans = repairMyanmarDocumentText(newTrans);
        if (rTrans.wasModified) {
          newTrans = rTrans.repairedText;
          mod = true;
        }
      }

      if (mod) modifiedAny = true;

      return {
        ...seg,
        originalText: newOrig,
        translatedText: newTrans,
      };
    });

    setSegments(updated);
    persistHistory(updated);
    setFontRepairNotice('အပိုင်းအားလုံး၏ မြန်မာဖောင့်၊ Zawgyi/Unicode နှင့် PDF အမှိုက်များကို ပြင်ဆင်ပြီးပါပြီ');
    playSuccessSound();
    setTimeout(() => setFontRepairNotice(null), 6000);
  };

  // Translate a single segment
  const translateSingleSegment = async (index: number) => {
    const seg = segments[index];
    if (!seg) return;

    setActiveSegmentIndex(index);
    setStudioError(null);

    // Update status to translating
    setSegments((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, status: 'translating' } : s))
    );

    const startTime = Date.now();
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: seg.originalText,
          title: `${bookTitle} - ${seg.title}`,
          segmentIndex: index,
          totalSegments: segments.length,
          style: translationStyle,
        }),
      });

      const data = await response.json();
      if (data.success && data.translation) {
        const duration = Math.round((Date.now() - startTime) / 1000);
        const { repairedText } = repairMyanmarDocumentText(data.translation);

        const updatedSegments = segments.map((s, idx) =>
          idx === index
            ? {
                ...s,
                translatedText: repairedText,
                status: 'completed' as const,
                durationSec: duration,
              }
            : s
        );

        setSegments(updatedSegments);
        persistHistory(updatedSegments);
        playSuccessSound();
      } else {
        playWarningSound();
        setSegments((prev) =>
          prev.map((s, idx) => (idx === index ? { ...s, status: 'failed' } : s))
        );
        setStudioError(data.error || `${seg.title} ဘာသာပြန်ခြင်း မအောင်မြင်ပါ။`);
      }
    } catch (err: any) {
      console.error(err);
      playWarningSound();
      setSegments((prev) =>
        prev.map((s, idx) => (idx === index ? { ...s, status: 'failed' } : s))
      );
      setStudioError('ကွန်ရက် ချိတ်ဆက်မှု မအောင်မြင်ပါ။');
    } finally {
      setActiveSegmentIndex(null);
    }
  };

  // Translate all segments sequentially
  const handleTranslateAll = async () => {
    if (isTranslatingAll) return;
    setIsTranslatingAll(true);
    setStudioError(null);
    setElapsedSec(0);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    let currentSegments = [...segments];

    for (let i = 0; i < currentSegments.length; i++) {
      if (currentSegments[i].status === 'completed' && currentSegments[i].translatedText) {
        continue;
      }

      setActiveSegmentIndex(i);
      currentSegments = currentSegments.map((s, idx) =>
        idx === i ? { ...s, status: 'translating' } : s
      );
      setSegments([...currentSegments]);

      const startTime = Date.now();
      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentSegments[i].originalText,
            title: `${bookTitle} - ${currentSegments[i].title}`,
            segmentIndex: i,
            totalSegments: currentSegments.length,
            style: translationStyle,
          }),
        });

        const data = await response.json();
        if (data.success && data.translation) {
          const duration = Math.round((Date.now() - startTime) / 1000);
          const { repairedText } = repairMyanmarDocumentText(data.translation);

          currentSegments = currentSegments.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  translatedText: repairedText,
                  status: 'completed',
                  durationSec: duration,
                }
              : s
          );
          setSegments([...currentSegments]);
          persistHistory(currentSegments);
        } else {
          currentSegments = currentSegments.map((s, idx) =>
            idx === i ? { ...s, status: 'failed' } : s
          );
          setSegments([...currentSegments]);
          setStudioError(`အပိုင်း ${i + 1} ဘာသာပြန်ခြင်းတွင် အဆင်မပြေဖြစ်သွားပါသည်။ ပြန်လည်နှိပ်နိုင်ပါသည်။`);
          break;
        }
      } catch (err) {
        console.error(err);
        currentSegments = currentSegments.map((s, idx) =>
          idx === i ? { ...s, status: 'failed' } : s
        );
        setSegments([...currentSegments]);
        setStudioError(`အပိုင်း ${i + 1} ကွန်ရက် ချိတ်ဆက်မှု ချို့ယွင်းသွားပါသည်။`);
        break;
      }
    }

    setIsTranslatingAll(false);
    setActiveSegmentIndex(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (currentSegments.every((s) => s.status === 'completed')) {
      playSuccessSound();
    }

    // Auto trigger AI review generation for large book
    handleGenerateReview(currentSegments);
  };

  // Generate Book Summary & Review
  const handleGenerateReview = async (currentSegs = segments) => {
    setGeneratingReview(true);
    const combinedSample = currentSegs
      .filter((s) => s.translatedText)
      .map((s) => s.translatedText)
      .join('\n\n')
      .slice(0, 30000);

    if (!combinedSample) {
      setGeneratingReview(false);
      return;
    }

    try {
      const res = await fetch('/api/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: bookTitle,
          text: combinedSample,
        }),
      });

      const data = await res.json();
      if (data.success && data.review) {
        setAiReview(data.review);
        persistHistory(currentSegs, data.review);
        playSuccessSound();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReview(false);
    }
  };

  const handleCopySegment = async (text: string, segId: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSegmentId(segId);
      setTimeout(() => setCopiedSegmentId(null), 2000);
    }
  };

  const handleCopyMaster = async () => {
    const ok = await copyToClipboard(mergedTranslation);
    if (ok) {
      setCopiedMaster(true);
      setTimeout(() => setCopiedMaster(false), 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in max-w-6xl mx-auto">
      {/* Studio Banner Header */}
      <div className="bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-blue-800/40 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-blue-200 transition mb-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>မူလစာမျက်နှာသို့ ပြန်သွားမည်</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase tracking-wider">
                Large Book Studio
              </span>
              <span className="text-xs text-blue-200">
                စာမျက်နှာ ၅ မျက်နှာကျော် စာအုပ်များ သီးသန့် အပိုင်းခွဲ ပြန်ဆိုရေးစနစ်
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {bookTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-blue-200 font-mono pt-1">
              <span>စာမျက်နှာ စုစုပေါင်း: {originalPageCount} မျက်နှာ</span>
              <span>•</span>
              <span>စာလုံးရေ: ~{originalWordCount.toLocaleString()} လုံး</span>
              <span>•</span>
              <span className="text-amber-300 font-bold">
                အပိုင်းခွဲအရေအတွက်: {segments.length} ပိုင်း (၅ မျက်နှာစီ)
              </span>
            </div>
          </div>

          {/* Style Selector Bar for Large Books */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-white font-bold">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>စာအုပ် ဘာသာပြန်စတိုင် ရွေးချယ်ပါ (Translation Style):</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectStyle('official')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  translationStyle === 'official'
                    ? 'bg-blue-500 text-white shadow-sm ring-2 ring-white/60'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title="စာချုပ်၊ စည်းမျဉ်း၊ အမိန့်စာသုံး စာအရေးအသား (ပါသည်၊ ဖြစ်ပါသည်)"
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>၁။ ရုံးသုံး</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectStyle('colloquial')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  translationStyle === 'colloquial'
                    ? 'bg-amber-400 text-slate-950 font-black shadow-sm ring-2 ring-white/60'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title="ဖတ်ရလွယ်ကူရှင်းလင်းသော ခေတ်ပေါ်စကားပြောစကားပြေ (တယ်၊ ပါတယ်။)"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>၂။ စကားပြေ</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectStyle('literary')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  translationStyle === 'literary'
                    ? 'bg-purple-500 text-white shadow-sm ring-2 ring-white/60'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
                title="ခန့်ညားထည်ဝါသော ဂန္ထဝင်စာပေအရေးအသား (ပေသည်၊ ကုန်၏၊ တည်း)"
              >
                <Feather className="w-3.5 h-3.5" />
                <span>၃။ စာပေ</span>
              </button>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Font Repair Button */}
            <button
              type="button"
              onClick={handleRepairAllFonts}
              className="py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="စာအုပ်အပိုင်းအားလုံး၏ ဖောင့်နှင့် အမှိုက်များကို စစ်ဆေးပြင်ဆင်မည်"
            >
              <Wrench className="w-4 h-4 text-amber-300" />
              <span>Font & Text စစ်ဆေးမည်</span>
            </button>

            {/* Translate All Button */}
            <button
              type="button"
              disabled={isTranslatingAll}
              onClick={handleTranslateAll}
              className="py-3 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isTranslatingAll
                  ? `ပြန်ဆိုနေပါသည် (${completedCount}/${segments.length})...`
                  : 'အပိုင်းအားလုံးကို အစဉ်လိုက်ဘာသာပြန်မည်'}
              </span>
            </button>

            {/* Combined Master Download Dropdown */}
            <div className="relative">
              <button
                type="button"
                disabled={completedCount === 0}
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="w-full sm:w-auto py-3 px-5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>ပြန်လည်ပေါင်းစပ် ဒေါင်းလုဒ်</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-30 text-slate-800 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 px-3 py-1 uppercase">
                    Format ရွေးချယ်ပါ
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setShowExportMenu(false);
                      setExportProgress('PDF ဖန်တီးနေပါသည်...');
                      await downloadAsPdf(
                        `${bookTitle}_Myanmar_Translated`,
                        bookTitle,
                        mergedTranslation,
                        (msg) => setExportProgress(msg)
                      );
                      setTimeout(() => setExportProgress(null), 3000);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-rose-50 text-rose-900 flex items-center gap-2 transition cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-rose-600" />
                    <div>
                      <div>PDF စာအုပ် (.pdf ဒေါင်းလုဒ်)</div>
                      <div className="text-[10px] text-slate-400 font-normal">စာမျက်နှာအလိုက် မြန်မာဖောင့်မှန် စနစ်</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      printMyanmarDocument(bookTitle, mergedTranslation);
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
                      downloadAsWord(`${bookTitle}_Myanmar_Translated`, bookTitle, mergedTranslation);
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
                      downloadAsTxt(`${bookTitle}_Myanmar_Translated`, mergedTranslation);
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

        {/* Studio Progress and Timer Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-blue-200">
              <span>ပြီးစီးမှု ရာခိုင်နှုန်း</span>
              <span className="font-mono font-bold text-white">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-400 to-amber-400 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-blue-200 bg-white/5 p-2.5 rounded-xl border border-white/10">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] text-blue-300">ခန့်မှန်းကြာမြင့်ချိန်</div>
              <div className="font-mono font-bold text-white">~{Math.ceil(estimatedSec / 60)} မိနစ်ခန့်</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-blue-200 bg-white/5 p-2.5 rounded-xl border border-white/10">
            <RefreshCw className={`w-4 h-4 text-emerald-400 shrink-0 ${isTranslatingAll ? 'animate-spin' : ''}`} />
            <div>
              <div className="text-[10px] text-blue-300">လက်ရှိကြာမြင့်ချိန်</div>
              <div className="font-mono font-bold text-emerald-300">
                {Math.floor(elapsedSec / 60)} မိနစ် {elapsedSec % 60} စက္ကန့်
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Font repair notification */}
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

      {/* Export progress notification */}
      {exportProgress && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2 text-xs text-blue-900">
          <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
          <span>{exportProgress}</span>
        </div>
      )}

      {/* Studio Error Alert if any */}
      {studioError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <div className="font-bold text-rose-950">ဘာသာပြန်ဆိုခြင်း အဆင်မပြေပါ</div>
              <div className="text-[11px] text-rose-700 mt-0.5">{studioError}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleTranslateAll}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition cursor-pointer shrink-0 text-center"
          >
            အပိုင်းအားလုံး ပြန်လည်စတင်မည်
          </button>
        </div>
      )}

      {/* View Tabs & Font Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 gap-3 pb-1">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('segments')}
            className={`py-3 px-4 text-xs font-bold transition flex items-center gap-2 cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'segments'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>စာမျက်နှာ ၅ မျက်နှာစီ အပိုင်းကတ်များ ({segments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('merged')}
            className={`py-3 px-4 text-xs font-bold transition flex items-center gap-2 cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'merged'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>ပြန်လည်ပေါင်းစပ် စာအုပ်အပြည့်အစုံ</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('review');
              if (!aiReview && !generatingReview) {
                handleGenerateReview();
              }
            }}
            className={`py-3 px-4 text-xs font-bold transition flex items-center gap-2 cursor-pointer border-b-2 whitespace-nowrap ${
              activeTab === 'review'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>AI စာအုပ်သုံးသပ်ချက်နှင့် အကျဉ်းချုပ်</span>
          </button>
        </div>

        {/* Font Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-center">
          <Type className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
          <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Font:</span>
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
      </div>

      {/* TAB 1: Segment Cards (စာမျက်နှာ ၅ မျက်နှာစီ ခွဲခြားထားသော ကတ်များ) */}
      {activeTab === 'segments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {segments.map((seg, idx) => {
            const isTranslating = activeSegmentIndex === idx;
            const isDone = seg.status === 'completed';

            return (
              <div
                key={seg.id}
                className={`bg-white rounded-2xl border transition-all p-5 shadow-xs flex flex-col justify-between ${
                  isDone
                    ? 'border-emerald-200 ring-1 ring-emerald-500/20'
                    : isTranslating
                    ? 'border-blue-400 ring-2 ring-blue-500/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Card Header with Copy Button requirement */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          {seg.title}
                        </span>
                        {isDone && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>ပြီးမြောက်</span>
                          </span>
                        )}
                        {isTranslating && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 animate-pulse">
                            ပြန်ဆိုနေဆဲ...
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {seg.pageRange} • ~{seg.wordCount.toLocaleString()} စာလုံး
                      </div>
                    </div>

                    {/* Copy Button for each segment */}
                    {isDone && (
                      <button
                        type="button"
                        onClick={() => handleCopySegment(seg.translatedText, seg.id)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="ဤအပိုင်းကို ကူးယူပါ"
                      >
                        {copiedSegmentId === seg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">ကူးပြီး</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-600" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="space-y-2 mb-4">
                    {seg.translatedText ? (
                      <div
                        style={{
                          fontFamily: `'${selectedFont}', 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif`,
                          lineHeight: '2.1',
                        }}
                        className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-800 max-h-48 overflow-y-auto whitespace-pre-line"
                      >
                        {seg.translatedText}
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-slate-50/60 border border-dashed border-slate-200 text-xs text-slate-400 italic">
                        ဘာသာပြန်ရန် အသင့်ဖြစ်နေပါသည်။ ဘာသာပြန်ခလုတ်ကို နှိပ်ပါ...
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="text-[11px] text-slate-400">
                    {seg.durationSec ? `ကြာမြင့်ချိန်: ${seg.durationSec} စက္ကန့်` : 'စောင့်ဆိုင်းဆဲ'}
                  </div>

                  <button
                    type="button"
                    disabled={isTranslating || isTranslatingAll}
                    onClick={() => translateSingleSegment(idx)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      isDone
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isDone ? 'ပြန်လည်ဘာသာပြန်မည်' : 'ဤအပိုင်းကို ပြန်ဆိုမည်'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: Merged Manuscript View */}
      {activeTab === 'merged' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                ပေါင်းစပ်ထားသော စာအုပ်အပြည့်အစုံ
              </h3>
              <p className="text-xs text-slate-500">
                အပိုင်းအားလုံးကို အစဉ်လိုက် ပေါင်းစည်းထားသော မြန်မာဘာသာပြန် မူကြမ်း
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyMaster}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              {copiedMaster ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">စာအုပ်အပြည့်အစုံ ကူးယူပြီး</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>စာအုပ်အပြည့်အစုံ ကူးယူမည်</span>
                </>
              )}
            </button>
          </div>

          <div
            style={{
              fontFamily: `'${selectedFont}', 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif`,
              lineHeight: '2.2',
            }}
            className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-sm leading-loose whitespace-pre-line max-h-[600px] overflow-y-auto text-slate-800"
          >
            {mergedTranslation.trim() || 'အပိုင်းများကို ဘာသာပြန်ပြီးပါက ဤနေရာတွင် စာအုပ်အပြည့်အစုံ ပေါ်လာပါမည်။'}
          </div>
        </div>
      )}

      {/* TAB 3: AI Book Summary & Review */}
      {activeTab === 'review' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                  AI Critical Review
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  စာအုပ်အကျဉ်းချုပ်နှင့် AI သုံးသပ်ချက်
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                စာအုပ်၏ အကျဉ်းချုပ်၊ အားသာချက်၊ အားနည်းချက်နှင့် AI ၏ အတွေးအမြင်များ
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={generatingReview}
                onClick={() => handleGenerateReview()}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>{generatingReview ? 'ရေးသားနေပါသည်...' : 'ပြန်လည်သုံးသပ်ခိုင်းမည်'}</span>
              </button>

              {aiReview && (
                <button
                  type="button"
                  onClick={() => downloadAsWord(`${bookTitle}_AI_Summary_Review`, `${bookTitle} - စာအုပ်သုံးသပ်ချက်နှင့် အကျဉ်းချုပ်`, aiReview)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>သုံးသပ်ချက်ဖိုင် ဒေါင်းလုဒ်ဆွဲမည်</span>
                </button>
              )}
            </div>
          </div>

          {generatingReview ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="font-bold text-xs text-indigo-900">
                AI မှ စာအုပ်၏ အကျဉ်းချုပ်နှင့် အားသာချက်၊ အားနည်းချက်များကို သုံးသပ်ရေးသားနေပါသည်...
              </div>
            </div>
          ) : aiReview ? (
            <div
              style={{
                fontFamily: `'${selectedFont}', 'Noto Sans Myanmar', 'Pyidaungsu', 'Padauk', sans-serif`,
                lineHeight: '2.1',
              }}
              className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-sm leading-relaxed whitespace-pre-line text-slate-800"
            >
              {aiReview}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              စာအုပ်အပိုင်းများ ဘာသာပြန်ပြီးပါက AI သုံးသပ်ချက် ရေးသားပေးပါမည်။
            </div>
          )}
        </div>
      )}
    </div>
  );
};
