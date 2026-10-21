import React, { useState, useEffect } from 'react';
import {
  UserAccount,
  updateUserAccount,
  TimePackage,
  loadTimePackages,
  subscribeToTimePackages,
  getLocalTimePackages,
} from '../lib/firebase';
import { playSuccessSound, playWarningSound } from '../lib/sound';
import { X, Clock, Coins, Sparkles, Check, AlertCircle } from 'lucide-react';

interface TimePurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  onTimePurchased: (updatedUser: UserAccount) => void;
}

export const TimePurchaseModal: React.FC<TimePurchaseModalProps> = ({
  isOpen,
  onClose,
  user,
  onTimePurchased,
}) => {
  const [packages, setPackages] = useState<TimePackage[]>(() =>
    getLocalTimePackages().filter((p) => p.isActive)
  );
  const [selectedPkg, setSelectedPkg] = useState<TimePackage | null>(() => {
    const active = getLocalTimePackages().filter((p) => p.isActive);
    return active[0] || null;
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Subscribe to real-time Time Packages from Firebase
  useEffect(() => {
    const unsub = subscribeToTimePackages((allPkgs) => {
      const active = allPkgs.filter((p) => p.isActive);
      setPackages(active);
      setSelectedPkg((prev) => {
        if (!prev) return active[0] || null;
        const matched = active.find((a) => a.id === prev.id);
        return matched || active[0] || null;
      });
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handleBuyTime = async () => {
    setErrorMsg(null);
    if (!selectedPkg) {
      setErrorMsg('ကျေးဇူးပြု၍ Package တစ်ခုကို ရွေးချယ်ပါ။');
      return;
    }
    if (user.coinBalance < selectedPkg.costCoins) {
      playWarningSound();
      setErrorMsg(
        `Coin မလုံလောက်ပါ။ (လိုအပ်ချက်: ${selectedPkg.costCoins} Coins, လက်ကျန်: ${user.coinBalance} Coins)`
      );
      return;
    }

    setLoading(true);
    try {
      const updated = await updateUserAccount(user.id, {
        coinBalance: user.coinBalance - selectedPkg.costCoins,
        timeRemainingSeconds: (user.timeRemainingSeconds || 0) + selectedPkg.seconds,
      });

      if (updated) {
        playSuccessSound();
        onTimePurchased(updated);
        onClose();
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'ဝယ်ယူမှု မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">အချိန်သက်တမ်း ဝယ်ယူရန်</h3>
              <p className="text-xs text-blue-100">
                သင့်လက်ကျန်: <span className="font-mono font-bold text-white">{user.coinBalance}</span> Coins
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

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-2.5">
            {packages.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                လက်ရှိတွင် အချိန်သက်တမ်း Package များအား Admin မှ ပြင်ဆင်နေဆဲဖြစ်ပါသည်။
              </div>
            ) : (
              packages.map((pkg) => {
                const isSelected = selectedPkg?.id === pkg.id;
                const canAfford = user.coinBalance >= pkg.costCoins;
                const minutes = Math.round(pkg.seconds / 60);
                const hours = (pkg.seconds / 3600).toFixed(1).replace(/\.0$/, '');

                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPkg(pkg)}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{pkg.title}</span>
                          {pkg.badge && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800">
                              {pkg.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                          +{minutes} မိနစ် ({hours} နာရီ) သက်တမ်းတိုးမည်
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-1 font-mono font-black text-sm text-amber-700">
                        <Coins className="w-3.5 h-3.5 text-amber-500" />
                        <span>{pkg.costCoins}</span>
                      </div>
                      <div className={`text-[10px] ${canAfford ? 'text-emerald-600' : 'text-rose-500 font-semibold'}`}>
                        {canAfford ? 'ဝယ်ယူနိုင်ပါသည်' : 'Coin မလုံလောက်'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            disabled={loading || !selectedPkg || user.coinBalance < (selectedPkg?.costCoins || 0)}
            onClick={handleBuyTime}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>
              {loading
                ? 'လုပ်ဆောင်နေပါသည်...'
                : selectedPkg
                ? `Coin ${selectedPkg.costCoins} ဖြင့် အချိန်သက်တမ်း ဝယ်ယူမည်`
                : 'အချိန်သက်တမ်း ရွေးချယ်ပါ'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
