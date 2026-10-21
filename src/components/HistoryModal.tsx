import React, { useState } from 'react';
import {
  TranslationHistoryItem,
  TranslationSegment,
  getLocalHistory,
  saveLocalHistory,
} from '../lib/firebase';
import {
  downloadAsWord,
  downloadAsPdf,
  downloadAsTxt,
  copyToClipboard,
} from '../lib/exportUtils';
import {
  X,
  BookOpen,
  Library,
  Copy,
  Check,
  Download,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Layers,
  Sparkles,
  FileText,
} from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  initialTab?: 'small' | 'large';
  onClose: () => void;
  userId: string;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  initialTab = 'small',
  onClose,
  userId,
}) => {
  const [activeTab, setActiveTab] = useState<'small' | 'large' | 'trash'>(initialTab);
  const [historyItems, setHistoryItems] = useState<TranslationHistoryItem[]>(getLocalHistory());
  const [expandedBookId, setExpandedBookId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const refreshHistory = () => {
    setHistoryItems(getLocalHistory());
  };

  const handleSoftDelete = (id: string) => {
    const all = getLocalHistory();
    const item = all.find((h) => h.id === id);
    if (item) {
      item.isDeleted = true;
      saveLocalHistory(all);
      refreshHistory();
    }
  };

  const handleRestore = (id: string) => {
    const all = getLocalHistory();
    const item = all.find((h) => h.id === id);
    if (item) {
      item.isDeleted = false;
      saveLocalHistory(all);
      refreshHistory();
    }
  };

  const handlePermanentDelete = (id: string) => {
    const all = getLocalHistory().filter((h) => h.id !== id);
    saveLocalHistory(all);
    refreshHistory();
  };

  const handleCopy = async (text: string, id: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Filter items
  const activeItems = historyItems.filter((h) => !h.isDeleted);
  const trashedItems = historyItems.filter((h) => h.isDeleted);

  const smallBookItems = activeItems.filter((h) => h.type === 'small');
  const largeBookItems = activeItems.filter((h) => h.type === 'large');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">ဘာသာပြန်မှတ်တမ်းများ (Translation History)</h3>
              <p className="text-xs text-blue-200">
                ပြန်လည်ကြည့်ရှုခြင်း၊ ကူးယူခြင်း၊ ဖျက်ခြင်းနှင့် Restore ပြန်လည်ရယူခြင်း
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 bg-slate-100 p-2 border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('small')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'small'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>စာအုပ်အသေးများ ဘာသာပြန်မှတ်တမ်း ({smallBookItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('large')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'large'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>စာအုပ်အကြီးများ ဘာသာပြန်မှတ်တမ်း ({largeBookItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trash')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-white text-rose-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>အမှိုက်ပုံး / Restore ({trashedItems.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: Small Books History */}
          {activeTab === 'small' && (
            <div className="space-y-3">
              {smallBookItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  စာအုပ်အသေးများ ဘာသာပြန်မှတ်တမ်း မရှိသေးပါ။
                </div>
              ) : (
                smallBookItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 shadow-2xs space-y-3 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {new Date(item.createdAt).toLocaleDateString()} • ~{item.originalWordCount} စာလုံး • {item.originalPageCount} မျက်နှာ
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(item.translatedContent, item.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-700">ကူးပြီး</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadAsWord(item.title, item.title, item.translatedContent)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Word ဖြင့် ဒေါင်းလုဒ်ဆွဲမည်"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Word</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadAsPdf(item.title, item.title, item.translatedContent)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="PDF ဖြင့် ဒေါင်းလုဒ်ဆွဲမည်"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSoftDelete(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="ဖျက်မည်"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed max-h-32 overflow-y-auto whitespace-pre-line">
                      {item.translatedContent}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: Large Books History (Grouped by title; click to reveal 20-page segments) */}
          {activeTab === 'large' && (
            <div className="space-y-3">
              {largeBookItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  စာအုပ်အကြီးများ ဘာသာပြန်မှတ်တမ်း မရှိသေးပါ။
                </div>
              ) : (
                largeBookItems.map((item) => {
                  const isExpanded = expandedBookId === item.id;
                  const segments = item.segments || [];

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition"
                    >
                      {/* Clickable Header for Large Book as requested: "user မှ click ကြည့်မှ သာလျှင် အပိုင်းအားလုံးကိုမြင်တွေ့စေပါ" */}
                      <div
                        onClick={() => setExpandedBookId(isExpanded ? null : item.id)}
                        className="p-4 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-between cursor-pointer border-b border-slate-200/80 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <Library className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-sm text-slate-900">
                                {item.title}
                              </h4>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {segments.length} ပိုင်းခွဲ
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {new Date(item.createdAt).toLocaleDateString()} • {item.originalPageCount} မျက်နှာ • ~{item.originalWordCount.toLocaleString()} စာလုံး
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-xs font-bold text-indigo-600 hidden sm:block">
                            {isExpanded ? 'အသေးစိတ် ပိတ်မည်' : 'အပိုင်းအားလုံး ကြည့်မည် (Click)'}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSoftDelete(item.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="ဖျက်မည်"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded View: All 20-Page Segment Cards with Copy Buttons */}
                      {isExpanded && (
                        <div className="p-5 bg-white space-y-4 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-indigo-600" />
                              <span>စာမျက်နှာ ၅ မျက်နှာစီ အပိုင်းကတ်များ ({segments.length} ပိုင်း)</span>
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => downloadAsWord(item.title, item.title, item.translatedContent)}
                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Word ဒေါင်းလုဒ်</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => downloadAsPdf(item.title, item.title, item.translatedContent)}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF ဒေါင်းလုဒ် (Font မှန်ကန်)</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {segments.map((seg) => (
                              <div
                                key={seg.id}
                                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-xs text-slate-900">{seg.title}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">{seg.pageRange}</div>
                                  </div>

                                  {/* Copy button on each segment card */}
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(seg.translatedText, `${item.id}-${seg.id}`)}
                                    className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  >
                                    {copiedId === `${item.id}-${seg.id}` ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span className="text-emerald-700 text-[10px]">ကူးပြီး</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span className="text-[10px]">Copy</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 max-h-32 overflow-y-auto leading-relaxed">
                                  {seg.translatedText || 'ဘာသာပြန် မပြီးသေးပါ'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: Trash & Restore (delete or restore ပြန်လုပ်နိုင်ရန်) */}
          {activeTab === 'trash' && (
            <div className="space-y-3">
              {trashedItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  အမှိုက်ပုံးထဲတွင် ဖျက်ထားသော မှတ်တမ်း မရှိပါ။
                </div>
              ) : (
                trashedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200/80 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-900">{item.title}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {item.type === 'large' ? 'စာအုပ်အကြီး' : 'စာအုပ်အသေး'} • {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(item.id)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                        <span>Restore ပြန်ရယူမည်</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>အပြီးဖျက်မည်</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
