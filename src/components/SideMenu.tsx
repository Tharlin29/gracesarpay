import React from 'react';
import { UserAccount } from '../lib/firebase';
import {
  X,
  Coins,
  Send,
  Clock,
  LogOut,
  BookOpen,
  Library,
  Shield,
  Smartphone,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  isAdmin: boolean;
  timeRemainingSeconds: number;
  onOpenCoinTopUp: () => void;
  onOpenCoinTransfer: () => void;
  onOpenTimePurchase: () => void;
  onOpenHistory: (tab: 'small' | 'large') => void;
  onOpenAdminPanel?: () => void;
  onLogout: () => void;
}

export const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  user,
  isAdmin,
  timeRemainingSeconds,
  onOpenCoinTopUp,
  onOpenCoinTransfer,
  onOpenTimePurchase,
  onOpenHistory,
  onOpenAdminPanel,
  onLogout,
}) => {
  if (!isOpen) return null;

  const formatTime = (totalSeconds: number) => {
    if (totalSeconds <= 0) return '00:00:00 (ကုန်ဆုံးသွားပါပြီ)';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs} နာရီ ${mins} မိနစ် ${secs} စက္ကန့်`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-sm bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-slide-in">
          {/* Header */}
          <div className="p-5 bg-gradient-to-br from-blue-700 via-indigo-700 to-blue-900 text-white relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center font-black text-xl text-amber-300 shadow-inner">
                {user.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base truncate">{user.username}</h3>
                  {isAdmin && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-900">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-200 mt-0.5 font-mono">ID: {user.id}</p>
                <p className="text-xs text-blue-200 font-mono">{user.phone}</p>
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-white/15 text-center">
              <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-amber-200 shadow-xs">
                <span>စာပေချစ်မြတ်နိုးသူများအတွက် 📖SarPay📖</span>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 1. Coin Balance Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/40 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span>Coin လက်ကျန်စာရင်း</span>
                </span>
                <span className="text-2xl font-black text-amber-950 font-mono">
                  {user.coinBalance}
                </span>
              </div>
              <p className="text-[11px] text-amber-800/80 mb-3">
                ဘာသာပြန်ခြင်းနှင့် သက်တမ်းဝယ်ယူရန် Coin အသုံးပြုနိုင်ပါသည်။
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCoinTopUp();
                  }}
                  className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs hover:shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Coin ဝယ်ယူရန်</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCoinTransfer();
                  }}
                  className="py-2 px-3 rounded-xl bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-amber-600" />
                  <span>Coin Transfer</span>
                </button>
              </div>
            </div>

            {/* 2. Usage Timer Section */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>အသုံးပြုခွင့် သက်တမ်းကျန်ချိန်</span>
                </span>
              </div>
              <div className="text-xs font-bold font-mono text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 mb-3">
                {formatTime(timeRemainingSeconds)}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTimePurchase();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs hover:shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>အချိန်သက်တမ်း ဝယ်ယူရန်</span>
              </button>
            </div>

            {/* 3. Translation History Section */}
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">
                ဘာသာပြန် မှတ်တမ်းများ
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHistory('small');
                  }}
                  className="w-full p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left transition flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        စာအုပ်အသေးများ ဘာသာပြန်မှတ်တမ်း
                      </div>
                      <div className="text-[11px] text-slate-500">
                        စာမျက်နှာ ၅ မျက်နှာအောက် စာရွက်စာတမ်းများ
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenHistory('large');
                  }}
                  className="w-full p-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-left transition flex items-center justify-between group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Library className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">
                        စာအုပ်အကြီးများ ဘာသာပြန်မှတ်တမ်း
                      </div>
                      <div className="text-[11px] text-slate-500">
                        စာမျက်နှာ ၅ မျက်နှာစီ အပိုင်းခွဲပြန်ဆိုချက်များ
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition" />
                </button>
              </div>
            </div>

            {/* 4. Admin Shortcut if admin */}
            {isAdmin && onOpenAdminPanel && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdminPanel();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <span>Admin Panel သို့ သွားမည်</span>
                </button>
              </div>
            )}
          </div>

          {/* Footer - Logout Button */}
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>အကောင့်မှ ထွက်မည် (Log Out)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
