import React from 'react';
import { UserAccount, getLocalTimePackages } from '../lib/firebase';
import { Clock, Lock, Sparkles, Coins, PlusCircle } from 'lucide-react';

interface TimeExpiredLockoutProps {
  user: UserAccount;
  onOpenTimePurchase: () => void;
  onOpenCoinTopUp: () => void;
}

export const TimeExpiredLockout: React.FC<TimeExpiredLockoutProps> = ({
  user,
  onOpenTimePurchase,
  onOpenCoinTopUp,
}) => {
  const activePackages = getLocalTimePackages().filter((p) => p.isActive);
  const minCost = activePackages.length > 0
    ? Math.min(...activePackages.map((p) => p.costCoins))
    : 10;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-center p-6 sm:p-8 space-y-5 animate-in zoom-in-95">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner ring-8 ring-rose-50">
          <Lock className="w-8 h-8" />
        </div>

        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            အသုံးပြုခွင့် သက်တမ်း ကုန်ဆုံးသွားပါပြီ
          </h3>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            SarPay AI Studio အား ဆက်လက် အသုံးပြုရန်အတွက် သင့်တွင်ရှိသော Coin ဖြင့် အချိန်သက်တမ်း ဝယ်ယူပေးပါ။
          </p>
        </div>

        {/* Current Coin Balance */}
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div className="text-left">
            <div className="text-xs font-bold text-amber-900">သင့်လက်ကျန် Coin</div>
            <div className="text-[11px] text-amber-700">အသုံးပြုသူ ID: {user.id}</div>
          </div>
          <div className="flex items-center gap-1.5 font-mono font-black text-xl text-amber-900">
            <Coins className="w-5 h-5 text-amber-600" />
            <span>{user.coinBalance}</span>
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          {user.coinBalance >= minCost ? (
            <button
              type="button"
              onClick={onOpenTimePurchase}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Coin ဖြင့် အချိန်သက်တမ်း ဝယ်ယူမည်</span>
            </button>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              သက်တမ်းဝယ်ယူရန် Coin မလုံလောက်ပါ။ (အနည်းဆုံး {minCost} Coins လိုအပ်ပါသည်)။ Admin ဆီမှ Coin ထပ်မံဝယ်ယူပါ။
            </div>
          )}

          <button
            type="button"
            onClick={onOpenCoinTopUp}
            className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Admin ဆီမှ Coin ထပ်မံဝယ်ယူမည်</span>
          </button>
        </div>
      </div>
    </div>
  );
};
