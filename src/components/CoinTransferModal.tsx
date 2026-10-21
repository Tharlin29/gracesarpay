import React, { useState } from 'react';
import { UserAccount, transferCoins } from '../lib/firebase';
import { playCoinSound, playWarningSound } from '../lib/sound';
import { X, Send, Coins, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CoinTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  onTransferSuccess: (updatedUser: UserAccount) => void;
}

export const CoinTransferModal: React.FC<CoinTransferModalProps> = ({
  isOpen,
  onClose,
  user,
  onTransferSuccess,
}) => {
  const [targetIdOrPhone, setTargetIdOrPhone] = useState('');
  const [amount, setAmount] = useState<number>(10);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!targetIdOrPhone.trim()) {
      setErrorMsg('လက်ခံမည့် User ID သို့မဟုတ် ဖုန်းနံပါတ် ရိုက်ထည့်ပါ။');
      return;
    }

    if (amount <= 0 || amount > user.coinBalance) {
      setErrorMsg(`Coin ပမာဏ မှားယွင်းနေပါသည်။ (လက်ကျန်: ${user.coinBalance} Coins)`);
      return;
    }

    setLoading(true);
    try {
      const res = await transferCoins(user.id, targetIdOrPhone.trim(), amount);
      if (!res.success || !res.updatedSender) {
        playWarningSound();
        setErrorMsg(res.error || 'လွှဲပြောင်းမှု မအောင်မြင်ပါ။');
      } else {
        playCoinSound();
        setSuccessMsg(`Coin ${amount} ကို ${targetIdOrPhone} ထံသို့ အောင်မြင်စွာ လွှဲပြောင်းပြီးပါပြီ။`);
        onTransferSuccess(res.updatedSender);
        setTimeout(() => {
          onClose();
        }, 2200);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'လွှဲပြောင်းမှု မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">User အချင်းချင်း Coin Transfer</h3>
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

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleTransfer} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                လက်ခံမည့် User ID သို့မဟုတ် ဖုန်းနံပါတ်
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="ဥပမာ - SP-12345 သို့မဟုတ် 09xxxxxxxxx"
                  value={targetIdOrPhone}
                  onChange={(e) => setTargetIdOrPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                လွှဲပြောင်းမည့် Coin ပမာဏ
              </label>
              <div className="relative">
                <Coins className="w-4 h-4 text-amber-500 absolute left-3 top-3" />
                <input
                  type="number"
                  min="1"
                  max={user.coinBalance}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold"
                />
              </div>

              {/* Quick amount chips */}
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmount(amt)}
                    disabled={amt > user.coinBalance}
                    className="py-1 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 transition cursor-pointer"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || user.coinBalance <= 0}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{loading ? 'လွှဲပြောင်းနေပါသည်...' : 'Coin ချက်ချင်း လွှဲပြောင်းမည်'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
