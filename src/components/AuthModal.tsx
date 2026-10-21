import React, { useState } from 'react';
import {
  UserAccount,
  registerUserAccount,
  loginUserAccount,
  getOrCreateDeviceId,
} from '../lib/firebase';
import { playSuccessSound, playWarningSound } from '../lib/sound';
import { ShieldCheck, UserPlus, LogIn, Lock, Smartphone, User, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onSuccess: (user: UserAccount) => void;
  onAdminLogin: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onSuccess,
  onAdminLogin,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'admin'>('login');

  // Form states
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentDeviceId = getOrCreateDeviceId();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!username.trim() || !phone.trim() || !password.trim()) {
      setErrorMsg('ကျေးဇူးပြု၍ အချက်အလက်အားလုံး ပြည့်စုံစွာ ဖြည့်သွင်းပါ။');
      return;
    }

    if (password.length < 4) {
      setErrorMsg('စကားဝှက်သည် အနည်းဆုံး ၄ လုံး ရှိရပါမည်။');
      return;
    }

    setLoading(true);
    try {
      const res = await registerUserAccount({
        username,
        phone,
        password,
      });

      if (res.error) {
        playWarningSound();
        setErrorMsg(res.error);
      } else {
        playSuccessSound();
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!phone.trim() || !password.trim()) {
      setErrorMsg('ဖုန်းနံပါတ်/ID နှင့် စကားဝှက် ရိုက်ထည့်ပါ။');
      return;
    }

    setLoading(true);
    try {
      const res = await loginUserAccount(phone, password);
      if (res.error || !res.user) {
        playWarningSound();
        setErrorMsg(res.error || 'အကောင့်ဝင်ရောက်ခြင်း မအောင်မြင်ပါ။');
      } else {
        playSuccessSound();
        onSuccess(res.user);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'အကောင့်ဝင်ရောက်ခြင်း မအောင်မြင်ပါ။');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Admin login password = "iam0" as requested
    if (adminPassword === 'iam0') {
      playSuccessSound();
      onAdminLogin();
    } else {
      playWarningSound();
      setErrorMsg('Admin စကားဝှက် မှားယွင်းနေပါသည်။ (Invalid Admin Password)');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 p-6 text-white text-center relative">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner border border-white/20">
            <span className="text-3xl select-none">📖</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">SarPay AI Translation</h2>
          <p className="text-xs text-blue-200 mt-1">
            မြန်မာဘာသာပြန်နှင့် စာအုပ် Studio စနစ်
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-950/50 border border-blue-300/30 text-xs font-semibold text-amber-200 shadow-xs">
            <span>စာပေချစ်မြတ်နိုးသူများအတွက် 📖SarPay📖</span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-3 bg-slate-100 p-1.5 border-b border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`py-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'login'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>အကောင့်ဝင်ရန်</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`py-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'register'
                ? 'bg-white text-blue-700 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>အကောင့်ဖွင့်ရန်</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('admin');
              setErrorMsg(null);
            }}
            className={`py-2.5 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              tab === 'admin'
                ? 'bg-white text-indigo-700 shadow-sm font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* User Login Form */}
          {tab === 'login' && (
            <form onSubmit={handleUserLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ဖုန်းနံပါတ် သို့မဟုတ် User ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="ဥပမာ - 09xxxxxxxxx သို့မဟုတ် SP-XXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  စကားဝှက် (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? 'စစ်ဆေးနေပါသည်...' : 'အကောင့်ဝင်ရောက်မည်'}
              </button>

              <div className="text-center text-xs text-slate-500 pt-2">
                အကောင့်မရှိသေးပါက{' '}
                <button
                  type="button"
                  onClick={() => setTab('register')}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  အကောင့်အသစ်ဖွင့်ပါ
                </button>
              </div>
            </form>
          )}

          {/* User Registration Form with Device Limit */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  ဖုန်းတစ်လုံးလျှင် အကောင့်တစ်ခုသာ မှတ်ပုံတင်ခွင့်ရှိပါသည်။ (1 Account per Device Limit)
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  အမည် (Username)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="ဥပမာ - Mg Mg"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ဖုန်းနံပါတ် (Phone Number)
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    placeholder="09xxxxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  စကားဝှက် (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="စကားဝှက် အသစ်ထားပါ"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? 'မှတ်ပုံတင်နေပါသည်...' : 'အကောင့်အသစ် ဖွင့်မည်'}
              </button>

              <div className="text-center text-xs text-slate-500 pt-1">
                အကောင့်ဖွင့်ပြီးသည်နှင့် Free 15 မိနစ် အသုံးပြုခွင့်နှင့် 25 Coins ရရှိပါမည်။
              </div>
            </form>
          )}

          {/* Admin Login Form */}
          {tab === 'admin' && (
            <form onSubmit={handleAdminAuth} className="space-y-4">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  Admin Login စနစ် - စီမံခန့်ခွဲသူများသာ ဝင်ရောက်ခွင့်ရှိပါသည်။
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Admin လျှို့ဝှက်စကားဝှက် (Admin Access Key)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-indigo-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="Admin password ရိုက်ထည့်ပါ"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  * Admin password ကို အခြား user များ မမြင်နိုင်အောင် ကာကွယ်ထားပါသည်။
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Admin Panel သို့ ဝင်ရောက်မည်</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
