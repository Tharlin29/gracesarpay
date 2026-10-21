import React, { useState, useEffect, useRef } from 'react';
import {
  UserAccount,
  PaymentConfig,
  submitTopUpRequest,
  loadPaymentSettings,
  REPORT_COOLDOWN_MS,
  getLastReportTime,
  saveLastReportTime,
} from '../lib/firebase';
import { copyToClipboard } from '../lib/exportUtils';
import { playSuccessSound, playCoinSound } from '../lib/sound';
import {
  X,
  Coins,
  Copy,
  Check,
  Send,
  CreditCard,
  QrCode,
  ShieldAlert,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  FileCheck2,
  RefreshCw,
  Clock,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface CoinTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  paymentConfig: PaymentConfig;
  onRequestSubmitted: () => void;
}

export const CoinTopUpModal: React.FC<CoinTopUpModalProps> = ({
  isOpen,
  onClose,
  user,
  paymentConfig: initialConfig,
  onRequestSubmitted,
}) => {
  const [currentConfig, setCurrentConfig] = useState<PaymentConfig>(initialConfig);
  const [selectedCoins, setSelectedCoins] = useState<number>(100);
  const [paymentMethod, setPaymentMethod] = useState<'kpay' | 'wave' | 'usdt'>('kpay');
  const [txId, setTxId] = useState('');
  const [senderPhone, setSenderPhone] = useState(user.phone || '');
  const [note, setNote] = useState('');
  const [slipImageBase64, setSlipImageBase64] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'report'>('accounts');
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Exact Notification Text specified by user
  const EXACT_BURMESE_NOTIFICATION =
    'Admin ထံသင့်၏ငွေပေးချေမှုပြေစာအားအောင်မြင်စွာပေးပို့လိုက်ပါပြီးကျေးဇူးပြု၍ခဏခဏစာမပို့ပါနှင့် Admin မှသင့်၏ငွေပေးချေမှုကိုစစ်ဆေးပြီးနောက်သင်၏အကောင့်ထဲသို့သင်ဝယ်ယူသော coin ပမာဏကိုပေးပို့မည်ဖြစ်ပါသည်';

  // Check 5-hour cooldown on open & tick every second
  useEffect(() => {
    const checkCooldown = () => {
      const last = getLastReportTime(user.id) || user.lastReportSubmittedAt || 0;
      if (!last) {
        setCooldownRemainingMs(0);
        return;
      }
      const elapsed = Date.now() - last;
      const remaining = Math.max(0, REPORT_COOLDOWN_MS - elapsed);
      setCooldownRemainingMs(remaining);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, [user.id, user.lastReportSubmittedAt, isOpen]);

  // Reload settings on open to guarantee latest Admin upload is visible
  useEffect(() => {
    if (isOpen) {
      loadPaymentSettings().then((cfg) => {
        setCurrentConfig(cfg);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentConfig(initialConfig);
  }, [initialConfig]);

  if (!isOpen) return null;

  // Format cooldown into readable Burmese
  const formatCooldown = (ms: number): string => {
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours} နာရီ ${mins} မိနစ်`;
    }
    return `${mins} မိနစ် ${secs} စက္ကန့်`;
  };

  const isCooldownActive = cooldownRemainingMs > 0;

  // Check if Admin has uploaded accounts: If any of KPay, Wave, or USDT has value or isUploadedByAdmin is true
  const hasAdminUploaded = Boolean(
    currentConfig.isUploadedByAdmin ||
    (currentConfig.kpayNumber && currentConfig.kpayNumber.trim() !== '') ||
    (currentConfig.waveNumber && currentConfig.waveNumber.trim() !== '') ||
    (currentConfig.usdtAddress && currentConfig.usdtAddress.trim() !== '')
  );

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSlipImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();

    // 5 Hours Limit check: If active, prevent click and show notification
    if (isCooldownActive) {
      setShowNotificationModal(true);
      return;
    }

    if (!txId.trim()) return;

    setSubmitting(true);
    try {
      const now = Date.now();
      await submitTopUpRequest({
        userId: user.id,
        username: user.username,
        amountCoins: selectedCoins,
        paymentMethod,
        accountUsed:
          paymentMethod === 'kpay'
            ? currentConfig.kpayNumber
            : paymentMethod === 'wave'
            ? currentConfig.waveNumber
            : currentConfig.usdtAddress,
        transactionId: txId.trim(),
        senderPhone: senderPhone.trim(),
        slipImage: slipImageBase64 || undefined,
        slipNote: note.trim(),
      });

      // Save report time immediately to enforce 5-hour limit
      saveLastReportTime(user.id, now);
      setCooldownRemainingMs(REPORT_COOLDOWN_MS);

      playCoinSound();
      playSuccessSound();

      // Show exact notification modal to user as requested
      setShowNotificationModal(true);

      onRequestSubmitted();
      setTxId('');
      setNote('');
      setSlipImageBase64(null);
    } catch (e) {
      console.error('Submit report error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
              <Coins className="w-5 h-5 text-amber-100" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Coin ဝယ်ယူရန် & Payment Report</h3>
              <p className="text-xs text-amber-100">
                လက်ကျန်: <span className="font-mono font-bold text-white">{user.coinBalance}</span> Coins • ID: {user.id}
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

        {/* Tab switch between Accounts & Report */}
        <div className="grid grid-cols-2 bg-slate-100 p-1.5 border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-white text-amber-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
            <span>၁။ ငွေပေးချေရန် အကောင့်များ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'report'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>၂။ Paid Transition Report တင်ရန်</span>
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {!hasAdminUploaded ? (
            /* Strict Requirement: If Admin has NOT uploaded payment info, do NOT show any numbers! */
            <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-amber-900 text-sm">
                Admin မှ ငွေပေးချေရန် အကောင့် မတင်ရသေးပါ
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                စနစ်တာဝန်ခံ (Admin) မှ ငွေပေးချေရမည့် KPay, WavePay, USDT BEP-20 address များကို စနစ်ထဲသို့ တင်မပေးရသေးပါ။
                Admin မှ အကောင့်များ တင်ပေးပြီးမှသာ ဤနေရာတွင် ဖုန်းနံပါတ်နှင့် လိပ်စာများ ပေါ်လာမည်ဖြစ်ပါသည်။
              </p>
              <div className="text-[11px] text-slate-500 pt-1">
                ကျေးဇူးပြု၍ Admin တင်ပေးသည်အထိ စောင့်ဆိုင်းပေးပါ သို့မဟုတ် Admin ထံ တိုက်ရိုက် ဆက်သွယ်ပါ။
              </div>
            </div>
          ) : activeTab === 'accounts' ? (
            /* TAB 1: Payment Accounts & Packages */
            <div className="space-y-5">
              {/* Coin Package Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  ဝယ်ယူလိုသော Coin ပမာဏ ရွေးချယ်ပါ
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[50, 100, 250, 500].map((pkg) => (
                    <button
                      key={pkg}
                      type="button"
                      onClick={() => setSelectedCoins(pkg)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        selectedCoins === pkg
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <div className="font-mono text-sm">{pkg}</div>
                      <div className="text-[10px] opacity-80 font-normal">Coins</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  ငွေပေးချေမည့် နည်းလမ်း ရွေးချယ်ပါ
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('kpay')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                      paymentMethod === 'kpay'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <span>KPay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('wave')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                      paymentMethod === 'wave'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-amber-600" />
                    <span>WavePay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('usdt')}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                      paymentMethod === 'usdt'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <span>USDT (BEP20)</span>
                  </button>
                </div>
              </div>

              {/* Payment Detail Card Uploaded by Admin */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 shadow-md">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <span>Admin မှ တင်ထားသော တရားဝင် ငွေလွှဲအကောင့်</span>
                  <span className="text-emerald-400 font-bold">Official</span>
                </div>

                {paymentMethod === 'kpay' && (
                  <div>
                    <div className="text-xs text-blue-300 font-semibold mb-1">KPay အကောင့်</div>
                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <div>
                        <div className="font-mono text-base font-bold text-amber-300 select-all">
                          {currentConfig.kpayNumber || 'နံပါတ် မရှိသေးပါ'}
                        </div>
                        {currentConfig.kpayName && (
                          <div className="text-xs text-slate-300 mt-0.5">အမည်: {currentConfig.kpayName}</div>
                        )}
                      </div>
                      {currentConfig.kpayNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopy(currentConfig.kpayNumber, 'kpay')}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedKey === 'kpay' ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>ကူးပြီး</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === 'wave' && (
                  <div>
                    <div className="text-xs text-amber-300 font-semibold mb-1">WavePay အကောင့်</div>
                    <div className="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
                      <div>
                        <div className="font-mono text-base font-bold text-amber-300 select-all">
                          {currentConfig.waveNumber || 'နံပါတ် မရှိသေးပါ'}
                        </div>
                        {currentConfig.waveName && (
                          <div className="text-xs text-slate-300 mt-0.5">အမည်: {currentConfig.waveName}</div>
                        )}
                      </div>
                      {currentConfig.waveNumber && (
                        <button
                          type="button"
                          onClick={() => handleCopy(currentConfig.waveNumber, 'wave')}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedKey === 'wave' ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>ကူးပြီး</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === 'usdt' && (
                  <div>
                    <div className="text-xs text-emerald-300 font-semibold mb-1">
                      Crypto USDT (BEP-20 BNB Smart Chain)
                    </div>
                    <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-2.5">
                      <div className="font-mono text-xs text-emerald-300 break-all select-all leading-relaxed">
                        {currentConfig.usdtAddress || 'Address မရှိသေးပါ'}
                      </div>
                      {currentConfig.usdtAddress && (
                        <button
                          type="button"
                          onClick={() => handleCopy(currentConfig.usdtAddress, 'usdt')}
                          className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          {copiedKey === 'usdt' ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Address ကူးယူပြီးပါပြီ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>USDT Address ကူးယူမည်</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {currentConfig.adminNote && (
                  <p className="text-[11px] text-slate-400 italic pt-1 border-t border-slate-800">
                    * Admin ညွှန်ကြားချက်: {currentConfig.adminNote}
                  </p>
                )}
              </div>

              {/* Dedicated Transition Report Button as requested */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('report');
                  if (isCooldownActive) {
                    setShowNotificationModal(true);
                  }
                }}
                className={`w-full py-3.5 px-4 rounded-2xl font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                  isCooldownActive
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/25'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
                }`}
              >
                {isCooldownActive ? (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Paid Report တင်ထားပြီးပါပြီ (နောက်ထပ်တင်ရန် {formatCooldown(cooldownRemainingMs)} ကျန်)</span>
                  </>
                ) : (
                  <>
                    <FileCheck2 className="w-4 h-4" />
                    <span>ငွေလွှဲပြီးပါက Paid Transition Report တင်ရန် ဤနေရာကိုနှိပ်ပါ 👉</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* TAB 2: Dedicated Payment Transition Report Form */
            <form onSubmit={handleSubmitReport} className="space-y-4">
              {/* Cooldown Active Warning Box */}
              {isCooldownActive ? (
                <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl space-y-2.5 text-xs text-amber-950 animate-in fade-in">
                  <div className="flex items-center gap-2 font-extrabold text-amber-900">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>၅ နာရီ ကန့်သတ်ချက် (Cooldown) သတ်မှတ်ထားပါသည်</span>
                  </div>
                  <p className="leading-relaxed font-medium text-slate-800 bg-white/80 p-3 rounded-xl border border-amber-200">
                    {EXACT_BURMESE_NOTIFICATION}
                  </p>
                  <div className="p-2.5 bg-amber-100 rounded-xl font-mono text-amber-900 font-bold flex items-center justify-between text-xs">
                    <span>နောက်တစ်ကြိမ် Report ထပ်တင်နိုင်ရန် ကျန်ရှိချိန်:</span>
                    <span className="text-amber-800 font-black">{formatCooldown(cooldownRemainingMs)}</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    ငွေလွှဲပြီးမြောက်ကြောင်း အချက်အလက်နှင့် ပြေစာကို Admin ထံသို့ Report တင်ပါမည်။
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ဝယ်ယူသည့် Coin
                  </label>
                  <select
                    value={selectedCoins}
                    disabled={isCooldownActive}
                    onChange={(e) => setSelectedCoins(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                  >
                    <option value={50}>50 Coins</option>
                    <option value={100}>100 Coins</option>
                    <option value={250}>250 Coins</option>
                    <option value={500}>500 Coins</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    အသုံးပြုခဲ့သော နည်းလမ်း
                  </label>
                  <select
                    value={paymentMethod}
                    disabled={isCooldownActive}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                  >
                    <option value="kpay">KPay</option>
                    <option value="wave">WavePay</option>
                    <option value="usdt">USDT (BEP-20)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ငွေလွှဲ Transaction / Transition ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isCooldownActive}
                  placeholder="ဥပမာ - 029481928374 သို့မဟုတ် နောက်ဆုံး ၆ လုံး"
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ငွေလွှဲသူ ဖုန်းနံပါတ် သို့မဟုတ် နာမည်
                </label>
                <input
                  type="text"
                  disabled={isCooldownActive}
                  placeholder="ဥပမာ - 09xxxxxxxxx သို့မဟုတ် မောင်မောင်"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                />
              </div>

              {/* Slip Image Upload */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ငွေလွှဲပြေစာ ဓာတ်ပုံ / Screenshot (Slip Image)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  disabled={isCooldownActive}
                  className="hidden"
                  onChange={handleImageUpload}
                />

                {slipImageBase64 ? (
                  <div className="relative p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={slipImageBase64}
                        alt="Slip Preview"
                        className="w-12 h-12 object-cover rounded-lg border"
                      />
                      <span className="text-xs text-slate-700 font-medium">ပြေစာပုံ ထည့်သွင်းပြီးပါပြီ</span>
                    </div>
                    {!isCooldownActive && (
                      <button
                        type="button"
                        onClick={() => setSlipImageBase64(null)}
                        className="text-xs text-rose-600 font-bold hover:underline px-2 py-1"
                      >
                        ဖယ်ရှားမည်
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isCooldownActive}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 px-3 rounded-xl border border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/40 text-slate-600 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span>ပြေစာပုံ (Slip Image) ရွေးချယ်တင်သွင်းရန် နှိပ်ပါ</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  အပိုဆောင်း မှတ်ချက်
                </label>
                <input
                  type="text"
                  disabled={isCooldownActive}
                  placeholder="ဥပမာ - လွှဲပြီးပါပြီ အမြန်စစ်ပေးပါ"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('accounts')}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  အကောင့်ပြန်ကြည့်မည်
                </button>

                {isCooldownActive ? (
                  <button
                    type="button"
                    onClick={() => setShowNotificationModal(true)}
                    className="flex-1 py-3.5 px-4 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-black text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>၅ နာရီ Limit: {formatCooldown(cooldownRemainingMs)} စောင့်ရန်လိုပါသည်</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting || !txId.trim()}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'ပေးပို့နေပါသည်...' : 'Admin ထံ Paid Transition Report တင်မည်'}</span>
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Exact Burmese Notification Modal as requested by user */}
        {showNotificationModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden p-6 text-center space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <h4 className="font-extrabold text-slate-900 text-base">
                ငွေပေးချေမှုပြေစာ အောင်မြင်စွာ ပေးပို့ပြီးပါပြီ
              </h4>

              <div className="p-4 bg-emerald-50/90 rounded-2xl border border-emerald-200 text-left">
                <p className="text-xs text-emerald-950 font-medium leading-relaxed font-sans">
                  {EXACT_BURMESE_NOTIFICATION}
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-amber-800 bg-amber-50 py-2.5 px-3 rounded-xl border border-amber-200">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isCooldownActive
                    ? `နောက်တစ်ကြိမ်တင်ရန်: ${formatCooldown(cooldownRemainingMs)} စောင့်ရပါမည် (5-Hour Limit)`
                    : '၅ နာရီ ကန့်သတ်ချက် (5-Hour Limit) သတ်မှတ်ထားပါသည်'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowNotificationModal(false);
                  onClose();
                }}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition shadow-md cursor-pointer"
              >
                နားလည်ပါပြီ (OK)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
