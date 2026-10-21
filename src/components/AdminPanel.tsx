import React, { useState, useEffect } from 'react';
import {
  UserAccount,
  PaymentConfig,
  CoinTopUpRequest,
  TimePackage,
  ApiProxyConfig,
  getLocalUsers,
  getLocalRequests,
  processTopUpRequest,
  adminDirectCoinTopUp,
  savePaymentSettings,
  subscribeToTopUpRequests,
  saveTimePackages,
  loadTimePackages,
  subscribeToTimePackages,
  DEFAULT_TIME_PACKAGES,
  DEFAULT_PROXY_CONFIG,
  saveApiProxyConfig,
  subscribeToApiProxyConfig,
  CustomApiKeyEntry,
} from '../lib/firebase';
import { playSuccessSound, playCoinSound, playWarningSound } from '../lib/sound';
import {
  Shield,
  Users,
  CheckCircle,
  XCircle,
  CreditCard,
  Plus,
  Clock,
  Smartphone,
  Save,
  Check,
  Search,
  Sparkles,
  AlertTriangle,
  ArrowLeft,
  LogOut,
  Eye,
  FileImage,
  X,
  Trash2,
  ArrowUp,
  ArrowDown,
  Coins,
  Tag,
  RotateCcw,
  Key,
  RefreshCw,
  Zap,
  Activity,
  Play,
  ToggleLeft,
  ToggleRight,
  Sliders,
  Globe,
  Server,
  PlusCircle,
} from 'lucide-react';

interface AdminPanelProps {
  paymentConfig: PaymentConfig;
  onPaymentConfigUpdated: (config: PaymentConfig) => void;
  onBackToApp: () => void;
  onAdminLogout: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  paymentConfig,
  onPaymentConfigUpdated,
  onBackToApp,
  onAdminLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'users' | 'payments' | 'packages' | 'proxy'>('requests');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [requests, setRequests] = useState<CoinTopUpRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Payment upload state
  const [kpayNumber, setKpayNumber] = useState(paymentConfig.kpayNumber || '');
  const [kpayName, setKpayName] = useState(paymentConfig.kpayName || '');
  const [waveNumber, setWaveNumber] = useState(paymentConfig.waveNumber || '');
  const [waveName, setWaveName] = useState(paymentConfig.waveName || '');
  const [usdtAddress, setUsdtAddress] = useState(paymentConfig.usdtAddress || '');
  const [adminNote, setAdminNote] = useState(paymentConfig.adminNote || '');
  const [isUploaded, setIsUploaded] = useState(paymentConfig.isUploadedByAdmin || false);
  const [paymentSavedMsg, setPaymentSavedMsg] = useState(false);
  const [viewingSlipImage, setViewingSlipImage] = useState<string | null>(null);

  // Time Packages & Pricing state (Firebase-synced)
  const [packages, setPackages] = useState<TimePackage[]>([]);
  const [packageSavedMsg, setPackageSavedMsg] = useState(false);
  const [savingPackages, setSavingPackages] = useState(false);

  // Direct top up modal state
  const [selectedUserForTopUp, setSelectedUserForTopUp] = useState<UserAccount | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<number>(100);

  // API Proxy & Key Rotation state (Firebase-synced)
  const [proxyConfig, setProxyConfig] = useState<ApiProxyConfig>(DEFAULT_PROXY_CONFIG);
  const [groqKeyInput, setGroqKeyInput] = useState(DEFAULT_PROXY_CONFIG.groqApiKey);
  const [openRouterKeyInput, setOpenRouterKeyInput] = useState(DEFAULT_PROXY_CONFIG.openRouterApiKey);
  const [deepSeekKeyInput, setDeepSeekKeyInput] = useState(DEFAULT_PROXY_CONFIG.deepSeekApiKey);
  const [savingProxy, setSavingProxy] = useState(false);
  const [proxySavedMsg, setProxySavedMsg] = useState(false);
  const [proxyServerStatus, setProxyServerStatus] = useState<any>(null);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  // Manual Add AI Model API Key state
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newKeyProviderType, setNewKeyProviderType] = useState<
    'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible'
  >('groq');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyModel, setNewKeyModel] = useState('openai/gpt-oss-120b');
  const [newKeyApiKey, setNewKeyApiKey] = useState('');
  const [newKeyBaseUrl, setNewKeyBaseUrl] = useState('');
  const [isTestingNewKey, setIsTestingNewKey] = useState(false);
  const [newKeyTestResult, setNewKeyTestResult] = useState<{
    success: boolean;
    output?: string;
    latencyMs?: number;
    model?: string;
    error?: string;
  } | null>(null);
  const [addingKey, setAddingKey] = useState(false);
  const [retestingKeyId, setRetestingKeyId] = useState<string | null>(null);

  const handleProviderTypeChange = (type: 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible') => {
    setNewKeyProviderType(type);
    setNewKeyTestResult(null);
    if (type === 'groq') {
      setNewKeyModel('openai/gpt-oss-120b');
      setNewKeyBaseUrl('');
    } else if (type === 'gemini') {
      setNewKeyModel('gemini-3.5-flash');
      setNewKeyBaseUrl('');
    } else if (type === 'openrouter') {
      setNewKeyModel('google/gemma-4-26b-a4b-it:free');
      setNewKeyBaseUrl('');
    } else if (type === 'deepseek') {
      setNewKeyModel('deepseek-chat');
      setNewKeyBaseUrl('');
    } else if (type === 'openai-compatible') {
      setNewKeyModel('gpt-4o-mini');
      setNewKeyBaseUrl('https://api.openai.com/v1');
    }
  };

  const handleTestNewKey = async () => {
    if (!newKeyApiKey.trim() && newKeyProviderType !== 'gemini') {
      alert('စမ်းသပ်ရန် API Key ကို ဦးစွာ ရိုက်ထည့်ပေးပါ');
      return;
    }
    if (!newKeyModel.trim()) {
      alert('မော်ဒယ်အမည်ကို ရိုက်ထည့်ပေးပါ');
      return;
    }

    setIsTestingNewKey(true);
    setNewKeyTestResult(null);

    try {
      const res = await fetch('/api/proxy/test-arbitrary-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: newKeyProviderType,
          apiKey: newKeyApiKey.trim(),
          model: newKeyModel.trim(),
          baseUrl: newKeyBaseUrl.trim(),
        }),
      });

      const data = await res.json();
      setNewKeyTestResult(data);
      if (data.success) {
        playSuccessSound();
      } else {
        playWarningSound();
      }
    } catch (e: any) {
      setNewKeyTestResult({
        success: false,
        error: e?.message || 'စမ်းသပ်မှု ချိတ်ဆက်၍မရပါ',
      });
      playWarningSound();
    } finally {
      setIsTestingNewKey(false);
    }
  };

  const handleSaveNewCustomKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel.trim()) {
      alert('Key အညွှန်းအမည် (Label) ထည့်ပေးပါ');
      return;
    }
    if (!newKeyApiKey.trim() && newKeyProviderType !== 'gemini') {
      alert('API Key ထည့်သွင်းပေးပါ');
      return;
    }

    setAddingKey(true);
    try {
      const newEntry: CustomApiKeyEntry = {
        id: 'ckey-' + Date.now(),
        label: newKeyLabel.trim(),
        providerType: newKeyProviderType,
        apiKey: newKeyApiKey.trim(),
        model: newKeyModel.trim(),
        baseUrl: newKeyBaseUrl.trim() || undefined,
        enabled: true,
        isTestedWorking: newKeyTestResult?.success || false,
        lastTestedAt: Date.now(),
        testLatencyMs: newKeyTestResult?.latencyMs,
        createdAt: Date.now(),
      };

      const res = await fetch('/api/proxy/add-custom-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
      });

      const data = await res.json();
      if (data.success) {
        // Also sync to Firebase Firestore
        const existingCustom = proxyConfig.customKeys || [];
        const updatedCustom = [...existingCustom.filter((k) => k.id !== newEntry.id), newEntry];
        const updatedConfig: ApiProxyConfig = {
          ...proxyConfig,
          customKeys: updatedCustom,
          updatedAt: Date.now(),
        };
        await saveApiProxyConfig(updatedConfig);
        setProxyConfig(updatedConfig);
        await fetchProxyStatus();
        playSuccessSound();

        // Reset
        setShowAddKeyModal(false);
        setNewKeyLabel('');
        setNewKeyApiKey('');
        setNewKeyTestResult(null);
      } else {
        alert(data.error || 'Key ထည့်သွင်းခြင်း မအောင်မြင်ပါ');
      }
    } catch (err: any) {
      console.error(err);
      alert('API Key ထည့်သွင်းခြင်း မအောင်မြင်ပါ');
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteCustomKey = async (id: string) => {
    if (!confirm('ဤ API Key အား အမှန်တကယ် ဖျက်ပစ်လိုပါသလား?')) return;
    try {
      await fetch('/api/proxy/delete-custom-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const updatedCustom = (proxyConfig.customKeys || []).filter((k) => k.id !== id);
      const updatedConfig: ApiProxyConfig = {
        ...proxyConfig,
        customKeys: updatedCustom,
        updatedAt: Date.now(),
      };
      await saveApiProxyConfig(updatedConfig);
      setProxyConfig(updatedConfig);
      await fetchProxyStatus();
      playSuccessSound();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCustomKey = async (id: string, currentEnabled: boolean) => {
    try {
      await fetch('/api/proxy/toggle-custom-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !currentEnabled }),
      });
      const updatedCustom = (proxyConfig.customKeys || []).map((k) =>
        k.id === id ? { ...k, enabled: !currentEnabled } : k
      );
      const updatedConfig: ApiProxyConfig = {
        ...proxyConfig,
        customKeys: updatedCustom,
        updatedAt: Date.now(),
      };
      await saveApiProxyConfig(updatedConfig);
      setProxyConfig(updatedConfig);
      await fetchProxyStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetestCustomKey = async (ck: CustomApiKeyEntry) => {
    setRetestingKeyId(ck.id);
    try {
      const res = await fetch('/api/proxy/test-arbitrary-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: ck.providerType,
          apiKey: ck.apiKey,
          model: ck.model,
          baseUrl: ck.baseUrl,
        }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        playSuccessSound();
      } else {
        playWarningSound();
      }
      fetchProxyStatus();
    } catch (err: any) {
      setTestResult({
        success: false,
        provider: ck.label,
        error: err?.message || 'Retest failed',
      });
    } finally {
      setRetestingKeyId(null);
    }
  };

  const fetchProxyStatus = async () => {
    try {
      const res = await fetch('/api/proxy/status');
      const data = await res.json();
      if (data.success) {
        setProxyServerStatus(data);
      }
    } catch (e) {
      console.warn('Proxy status fetch warning:', e);
    }
  };

  const handleSaveProxyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProxy(true);
    try {
      const updated: ApiProxyConfig = {
        ...proxyConfig,
        groqApiKey: groqKeyInput.trim(),
        openRouterApiKey: openRouterKeyInput.trim(),
        deepSeekApiKey: deepSeekKeyInput.trim(),
        updatedAt: Date.now(),
      };
      await saveApiProxyConfig(updated);
      setProxyConfig(updated);
      await fetchProxyStatus();
      playSuccessSound();
      setProxySavedMsg(true);
      setTimeout(() => setProxySavedMsg(false), 3500);
    } catch (err) {
      console.error(err);
      alert('Proxy keys saving error');
    } finally {
      setSavingProxy(false);
    }
  };

  const handleTestProvider = async (providerId: string) => {
    setTestingProviderId(providerId);
    setTestResult(null);
    try {
      const res = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        playSuccessSound();
      }
      fetchProxyStatus();
    } catch (err: any) {
      setTestResult({
        success: false,
        provider: providerId,
        error: err?.message || 'Connection test failed',
      });
    } finally {
      setTestingProviderId(null);
    }
  };

  const refreshData = () => {
    setUsers(getLocalUsers());
    setRequests(getLocalRequests());
  };

  useEffect(() => {
    refreshData();
    // Real-time Firestore subscription to topup requests
    const unsub = subscribeToTopUpRequests((reqs) => {
      setRequests(reqs);
    });
    // Real-time Firestore subscription to time packages
    const unsubPackages = subscribeToTimePackages((pkgs) => {
      setPackages(pkgs);
    });
    // Real-time Firestore subscription to proxy config
    const unsubProxy = subscribeToApiProxyConfig((cfg) => {
      setProxyConfig(cfg);
      setGroqKeyInput(cfg.groqApiKey);
      setOpenRouterKeyInput(cfg.openRouterApiKey);
      setDeepSeekKeyInput(cfg.deepSeekApiKey);
    });
    fetchProxyStatus();
    const proxyPoll = setInterval(fetchProxyStatus, 8000);

    return () => {
      unsub();
      unsubPackages();
      unsubProxy();
      clearInterval(proxyPoll);
    };
  }, []);

  const computeSeconds = (val: number, unit: 'hours' | 'days' | 'minutes'): number => {
    if (unit === 'minutes') return Math.max(60, val * 60);
    if (unit === 'days') return Math.max(86400, val * 86400);
    return Math.max(3600, val * 3600);
  };

  const handleUpdatePackage = (index: number, updates: Partial<TimePackage>) => {
    setPackages((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], ...updates };
      if (updates.durationValue !== undefined || updates.durationUnit !== undefined) {
        target.seconds = computeSeconds(target.durationValue, target.durationUnit);
      }
      copy[index] = target;
      return copy;
    });
  };

  const handleAddPackage = () => {
    const newId = 'pkg-' + Date.now();
    const newPkg: TimePackage = {
      id: newId,
      title: '၂ နာရီ အသုံးပြုခွင့်',
      durationValue: 2,
      durationUnit: 'hours',
      seconds: 7200,
      costCoins: 20,
      badge: 'Custom',
      isActive: true,
      order: packages.length + 1,
    };
    setPackages((prev) => [...prev, newPkg]);
  };

  const handleDeletePackage = (index: number) => {
    setPackages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMovePackage = (index: number, direction: 'up' | 'down') => {
    setPackages((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((p, i) => ({ ...p, order: i + 1 }));
    });
  };

  const handleResetPackages = () => {
    if (confirm('မူလ စံနှုန်းထားများအတိုင်း ပြန်လည်သတ်မှတ်လိုပါသလား?')) {
      setPackages([...DEFAULT_TIME_PACKAGES]);
    }
  };

  const handleSavePackagesToFirebase = async () => {
    setSavingPackages(true);
    try {
      await saveTimePackages(packages);
      playSuccessSound();
      setPackageSavedMsg(true);
      setTimeout(() => setPackageSavedMsg(false), 3500);
    } catch (e) {
      console.error(e);
      alert('Firebase သို့ သိမ်းဆည်းခြင်း မအောင်မြင်ပါ။');
    } finally {
      setSavingPackages(false);
    }
  };

  // Handle Request Approval / Rejection
  const handleProcessRequest = async (reqId: string, action: 'approved' | 'rejected') => {
    const res = await processTopUpRequest(reqId, action);
    if (res.success) {
      playCoinSound();
      refreshData();
    }
  };

  // Handle Direct User Top Up
  const handleDirectTopUp = async () => {
    if (!selectedUserForTopUp || topUpAmount <= 0) return;
    const res = await adminDirectCoinTopUp(selectedUserForTopUp.id, topUpAmount);
    if (res.success) {
      playCoinSound();
      refreshData();
      setSelectedUserForTopUp(null);
    }
  };

  // Handle Save Payment Upload to Firebase
  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasAnyAccount = Boolean(kpayNumber.trim() || waveNumber.trim() || usdtAddress.trim());
    const updated: PaymentConfig = {
      kpayNumber: kpayNumber.trim(),
      kpayName: kpayName.trim(),
      waveNumber: waveNumber.trim(),
      waveName: waveName.trim(),
      usdtAddress: usdtAddress.trim(),
      usdtNetwork: 'BEP20 (BNB Smart Chain)',
      isUploadedByAdmin: hasAnyAccount || isUploaded,
      updatedAt: Date.now(),
      adminNote: adminNote.trim(),
    };

    await savePaymentSettings(updated);
    onPaymentConfigUpdated(updated);
    playSuccessSound();
    setPaymentSavedMsg(true);
    setTimeout(() => setPaymentSavedMsg(false), 3000);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery)
  );

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">
                  SarPay AI - Admin Dashboard
                </h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-950">
                  SYSTEM ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-400">
                User စာရင်း၊ Coin Top-up တောင်းဆိုချက်များနှင့် ငွေပေးချေမှု အကောင့်များ စီမံခန့်ခွဲမှု
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToApp}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>App စာမျက်နှာသို့ ပြန်သွားမည်</span>
            </button>

            <button
              type="button"
              onClick={onAdminLogout}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              title="Admin အကောင့်မှ ထွက်မည်"
            >
              <LogOut className="w-4 h-4" />
              <span>Admin Log Out</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>မှတ်ပုံတင်ထားသော User စုစုပေါင်း</span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black font-mono text-white mt-2">
              {users.length} <span className="text-xs text-slate-400 font-normal">ဦး</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>စစ်ဆေးရန် ကျန်ရှိသော တောင်းဆိုချက်များ</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black font-mono text-amber-400 mt-2">
              {pendingRequests.length} <span className="text-xs text-slate-400 font-normal">ခု</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800 border border-slate-700/80">
            <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
              <span>ငွေပေးချေမှု အကောင့် တင်ထားမှု အခြေအနေ</span>
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-sm font-bold mt-2 flex items-center gap-2">
              {paymentConfig.isUploadedByAdmin ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> တင်ထားပြီး (User များ မြင်တွေ့နိုင်သည်)
                </span>
              ) : (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> မတင်ရသေးပါ (User များကို မပြသေးပါ)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-slate-800 text-amber-400 border-t-2 border-amber-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Coin ဝယ်ယူခွင့် တောင်းဆိုချက်များ ({pendingRequests.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-slate-800 text-blue-400 border-t-2 border-blue-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User စာရင်းနှင့် တိကျစွာ Coin ထည့်သွင်းခြင်း</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-slate-800 text-emerald-400 border-t-2 border-emerald-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>ငွေပေးချေမှု အကောင့်များ တင်ပေးရန် (KPay / Wave / USDT)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'packages'
                ? 'bg-slate-800 text-purple-400 border-t-2 border-purple-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>အချိန်သက်တမ်း & Coin ဈေးနှုန်း သတ်မှတ်ခြင်း</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('proxy')}
            className={`py-3 px-4 font-bold text-xs rounded-t-xl transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'proxy'
                ? 'bg-slate-800 text-cyan-400 border-t-2 border-cyan-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Key className="w-4 h-4 text-cyan-400" />
            <span>API Keys & Proxy Rotation</span>
          </button>
        </div>

        {/* TAB 1: Coin Top-up Requests */}
        {activeTab === 'requests' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Coin ဝယ်ယူလိုသူများ၏ တောင်းဆိုစာများ</span>
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-amber-300">
                  {requests.length} ခု
                </span>
              </h2>
            </div>

            {requests.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                လက်ရှိတွင် မည်သည့် Coin တောင်းဆိုချက်မျှ မရှိသေးပါ။
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 uppercase text-[11px]">
                      <th className="py-3 px-3">အချိန်</th>
                      <th className="py-3 px-3">User ID & အမည်</th>
                      <th className="py-3 px-3">Coin ပမာဏ</th>
                      <th className="py-3 px-3">ငွေပေးချေနည်း</th>
                      <th className="py-3 px-3">Transaction ID / မှတ်ချက်</th>
                      <th className="py-3 px-3">အခြေအနေ</th>
                      <th className="py-3 px-3 text-right">ဆောင်ရွက်ချက်</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-750">
                        <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                          {new Date(req.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-white">{req.username}</div>
                          <div className="text-[11px] font-mono text-indigo-300">{req.userId}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono font-black text-amber-400 text-sm">
                            +{req.amountCoins}
                          </span>{' '}
                          <span className="text-[10px] text-slate-400">Coins</span>
                        </td>
                        <td className="py-3 px-3 uppercase font-semibold text-slate-300">
                          {req.paymentMethod}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-1">
                            <div className="font-mono text-white text-[11px] bg-slate-900/60 px-2 py-0.5 rounded w-max">
                              {req.transactionId}
                            </div>
                            {req.senderPhone && (
                              <div className="text-[11px] text-blue-300 font-mono">
                                လွှဲသူ: {req.senderPhone}
                              </div>
                            )}
                            {req.slipImage && (
                              <button
                                type="button"
                                onClick={() => setViewingSlipImage(req.slipImage!)}
                                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer mt-0.5"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>ပြေစာပုံ (Slip Image) ကြည့်မည်</span>
                              </button>
                            )}
                            {req.slipNote && (
                              <div className="text-[11px] text-slate-400 mt-0.5">{req.slipNote}</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {req.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              စောင့်ဆိုင်းဆဲ
                            </span>
                          )}
                          {req.status === 'approved' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              အတည်ပြုပြီး
                            </span>
                          )}
                          {req.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              ပယ်ဖျက်ခဲ့သည်
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {req.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleProcessRequest(req.id, 'approved')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center gap-1 cursor-pointer"
                                title="အတည်ပြုပြီး Coin ထည့်ပေးမည်"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>အတည်ပြုမည်</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProcessRequest(req.id, 'rejected')}
                                className="px-2 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition cursor-pointer"
                                title="ပယ်ဖျက်မည်"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500">ပြီးစီး</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Users Management & Direct Coin Top-Up */}
        {activeTab === 'users' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>မှတ်ပုံတင်ထားသော အသုံးပြုသူများ စာရင်း</span>
                <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-blue-300">
                  {users.length} ဦး
                </span>
              </h2>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="ID, အမည် သို့မဟုတ် ဖုန်းနံပါတ်ဖြင့် ရှာဖွေပါ"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-full sm:w-64"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 uppercase text-[11px]">
                    <th className="py-3 px-3">User ID</th>
                    <th className="py-3 px-3">အမည်</th>
                    <th className="py-3 px-3">ဖုန်းနံပါတ်</th>
                    <th className="py-3 px-3">စက်ပစ္စည်း (Device ID)</th>
                    <th className="py-3 px-3">Coin လက်ကျန်</th>
                    <th className="py-3 px-3">ကျန်ရှိချိန်</th>
                    <th className="py-3 px-3 text-right">ဆောင်ရွက်ချက်</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-750">
                      <td className="py-3 px-3 font-mono font-bold text-indigo-300">
                        {u.id}
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">
                        {u.username}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {u.phone}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded w-max">
                          <Smartphone className="w-3 h-3 text-emerald-400" />
                          <span>{u.deviceId.slice(0, 14)}...</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {u.coinBalance}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400">Coins</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {Math.floor((u.timeRemainingSeconds || 0) / 60)} မိနစ်
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedUserForTopUp(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Coin ထည့်သွင်းမည်</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Payment Accounts Configuration & Upload */}
        {activeTab === 'payments' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>Admin ငွေပေးချေမှု အကောင့်များ စနစ်ထည့်သွင်းခြင်း (Payment Upload)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  * Admin မှ ဤနေရာတွင် KPay, WavePay, USDT လိပ်စာများကို တင်ပြီးမှသာ User များ Coin ဝယ်ယူသည့်အခါ မြင်တွေ့ရမည်ဖြစ်ပါသည်။
                </p>
              </div>

              {paymentSavedMsg && (
                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                  <Check className="w-4 h-4" />
                  <span>Firebase သို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSavePaymentConfig} className="space-y-5">
              {/* Status Toggle */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-white">
                    ငွေပေးချေမှု အကောင့်များကို User များအား ဖွင့်ပြမည် (Publish to Users)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    အမှန်ခြစ်ထားပါက User များ Coin ဝယ်ယူသည့်အခါ အောက်ပါအကောင့်များကို မြင်တွေ့နိုင်မည်ဖြစ်ပါသည်။
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUploaded}
                    onChange={(e) => setIsUploaded(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* KPay Form */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700 space-y-3">
                <div className="text-xs font-bold text-blue-400 flex items-center gap-2">
                  <span>၁။ KPay အကောင့်</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      KPay ဖုန်းနံပါတ်
                    </label>
                    <input
                      type="text"
                      placeholder="ဥပမာ - 09123456789"
                      value={kpayNumber}
                      onChange={(e) => setKpayNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      KPay အကောင့်ပိုင်ရှင် အမည်
                    </label>
                    <input
                      type="text"
                      placeholder="ဥပမာ - U Myo Win"
                      value={kpayName}
                      onChange={(e) => setKpayName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* WavePay Form */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700 space-y-3">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                  <span>၂။ WavePay အကောင့်</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      WavePay ဖုန်းနံပါတ်
                    </label>
                    <input
                      type="text"
                      placeholder="ဥပမာ - 09987654321"
                      value={waveNumber}
                      onChange={(e) => setWaveNumber(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      WavePay အကောင့်ပိုင်ရှင် အမည်
                    </label>
                    <input
                      type="text"
                      placeholder="ဥပမာ - Daw Hla Hla"
                      value={waveName}
                      onChange={(e) => setWaveName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* USDT Form */}
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-700 space-y-3">
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                  <span>၃။ Crypto USDT BEP20 Wallet Address</span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    BNB Smart Chain (BEP-20) Address
                  </label>
                  <input
                    type="text"
                    placeholder="ဥပမာ - 0x71C...849"
                    value={usdtAddress}
                    onChange={(e) => setUsdtAddress(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Admin Note Form */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  User များထံ ဖော်ပြပေးလိုသော မှတ်ချက်/ညွှန်ကြားချက်
                </label>
                <textarea
                  rows={2}
                  placeholder="ဥပမာ - ငွေလွှဲပြီးပါက Transaction ID ရိုက်ထည့်၍ တောင်းဆိုချက် ပေးပို့ပါ..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Firebase သို့ အချက်အလက်များ Upload တင်၍ သိမ်းဆည်းမည်</span>
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: Time Packages & Coin Pricing Management (Firebase Connected) */}
        {activeTab === 'packages' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-5 animate-in fade-in">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <span>အချိန်သက်တမ်းနှင့် Coin ဈေးနှုန်း စီမံခန့်ခွဲမှု (Time Packages & Pricing)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Admin မှ အချိန်သက်တမ်းအမျိုးအစား၊ ကြာချိန်နှင့် Coin ဈေးနှုန်းများကို စိတ်ကြိုက် ပြင်ဆင်/ထည့်သွင်း/ဖျက်ပစ်နိုင်ပါသည်။ Firebase သို့ တိုက်ရိုက်ချိတ်ဆက် သိမ်းဆည်းပေးမည်ဖြစ်ပြီး User များ၏ အချိန်သက်တမ်းဝယ်ယူသည့်နေရာတွင် ချက်ချင်း ပြောင်းလဲသွားပါမည်။
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetPackages}
                  className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="မူလ စံနှုန်းထားများအတိုင်း ပြန်လည်ထားရှိမည်"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>မူလစံနှုန်းထားများ</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddPackage}
                  className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-purple-500/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Package အသစ်ထည့်မည်</span>
                </button>
              </div>
            </div>

            {/* Success Alert Banner */}
            {packageSavedMsg && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2.5 animate-in zoom-in-95">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <span className="font-semibold">
                  အချိန်သက်တမ်းနှင့် Coin ဈေးနှုန်း အချက်အလက်များအား Firebase သို့ အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။ User များ၏ အချိန်သက်တမ်း ဝယ်ယူသည့်နေရာတွင် ချက်ချင်း အလိုအလျောက် ပြောင်းလဲသွားပါပြီ။
                </span>
              </div>
            )}

            {/* List of Time Packages */}
            <div className="space-y-4">
              {packages.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-900/40 rounded-2xl border border-slate-700/60">
                  <p>လက်ရှိတွင် အချိန်သက်တမ်း Package မရှိသေးပါ။ "Package အသစ်ထည့်မည်" ကို နှိပ်၍ အသစ်ထည့်သွင်းပါ။</p>
                </div>
              ) : (
                packages.map((pkg, index) => {
                  const minutes = Math.round(pkg.seconds / 60);
                  const hours = (pkg.seconds / 3600).toFixed(1).replace(/\.0$/, '');

                  return (
                    <div
                      key={pkg.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition ${
                        pkg.isActive
                          ? 'bg-slate-900/70 border-slate-700 hover:border-slate-600'
                          : 'bg-slate-950/40 border-slate-800 opacity-60'
                      }`}
                    >
                      {/* Top Row: Meta info & Order actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 font-mono font-bold text-xs flex items-center justify-center">
                            #{index + 1}
                          </span>
                          <span className="font-bold text-xs text-white">
                            {pkg.title || 'အမည်မရှိ Package'}
                          </span>
                          {pkg.badge && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              {pkg.badge}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Active / Inactive Toggle */}
                          <button
                            type="button"
                            onClick={() => handleUpdatePackage(index, { isActive: !pkg.isActive })}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                              pkg.isActive
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {pkg.isActive ? '✓ အသုံးပြုခွင့် ဖွင့်ထားသည်' : '✕ ပိတ်ထားသည်'}
                          </button>

                          {/* Move Up */}
                          <button
                            type="button"
                            onClick={() => handleMovePackage(index, 'up')}
                            disabled={index === 0}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="အပေါ်သို့ ရွှေ့မည်"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Move Down */}
                          <button
                            type="button"
                            onClick={() => handleMovePackage(index, 'down')}
                            disabled={index === packages.length - 1}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                            title="အောက်သို့ ရွှေ့မည်"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeletePackage(index)}
                            className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition cursor-pointer"
                            title="Package ဖျက်ပစ်မည်"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inputs Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        {/* 1. Title */}
                        <div className="lg:col-span-2">
                          <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                            Package ခေါင်းစဉ် (Title)
                          </label>
                          <input
                            type="text"
                            value={pkg.title}
                            onChange={(e) => handleUpdatePackage(index, { title: e.target.value })}
                            placeholder="ဥပမာ - ၁ နာရီ အသုံးပြုခွင့်"
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>

                        {/* 2. Duration Value */}
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                            ကြာချိန် ပမာဏ (Duration)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={pkg.durationValue}
                            onChange={(e) =>
                              handleUpdatePackage(index, { durationValue: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>

                        {/* 3. Duration Unit */}
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                            ယူနစ် (Unit)
                          </label>
                          <select
                            value={pkg.durationUnit}
                            onChange={(e) =>
                              handleUpdatePackage(index, {
                                durationUnit: e.target.value as 'hours' | 'days' | 'minutes',
                              })
                            }
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          >
                            <option value="hours">နာရီ (Hours)</option>
                            <option value="days">ရက် (Days)</option>
                            <option value="minutes">မိနစ် (Minutes)</option>
                          </select>
                        </div>

                        {/* 4. Cost Coins */}
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1 font-semibold flex items-center justify-between">
                            <span>ကျသင့်မည့် Coin</span>
                            <Coins className="w-3 h-3 text-amber-400" />
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={pkg.costCoins}
                            onChange={(e) =>
                              handleUpdatePackage(index, { costCoins: Math.max(1, Number(e.target.value) || 1) })
                            }
                            className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-amber-300 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      {/* Secondary row: Badge and Live Summary */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-slate-400 font-semibold shrink-0 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-slate-400" />
                            <span>အညွှန်း Badge Tag:</span>
                          </label>
                          <input
                            type="text"
                            value={pkg.badge || ''}
                            onChange={(e) => handleUpdatePackage(index, { badge: e.target.value })}
                            placeholder="Standard, Popular, Best Value, VIP, etc."
                            className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500 w-44"
                          />
                        </div>

                        {/* Calculated Duration Display */}
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                          <span>
                            စုစုပေါင်း: <strong className="text-purple-300 font-bold">+{minutes} မိနစ်</strong> ({hours} နာရီ)
                          </span>
                          <span>•</span>
                          <span>
                            ဈေးနှုန်း: <strong className="text-amber-400 font-bold">{pkg.costCoins} Coins</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Save to Firebase Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSavePackagesToFirebase}
                disabled={savingPackages}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-purple-500/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {savingPackages
                    ? 'Firebase သို့ သိမ်းဆည်းနေပါသည်...'
                    : 'Firebase သို့ အပြောင်းအလဲများ အတည်ပြု သိမ်းဆည်းမည် (Save to Firebase)'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: API Keys & Proxy Rotation Management */}
        {activeTab === 'proxy' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-6">
            {/* Header & Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyan-400" />
                  <span>API Keys & Multi-Engine Proxy Rotation</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Daily Limit နှင့် Rate Limit ကာကွယ်ရန် Groq, Gemini, OpenRouter, DeepSeek အကြား Round-Robin လှည့်ပတ်သုံးစွဲခြင်း
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchProxyStatus}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                  title="အခြေအနေ ပြန်လည်စစ်ဆေးမည်"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Refresh Status</span>
                </button>
              </div>
            </div>

            {/* Live Rotation Engine Status Cards */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>တပ်ဆင်ထားသော AI Providers အခြေအနေ (Live Rotation Pool)</span>
                </h3>
                {proxyServerStatus?.strategy && (
                  <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-0.5 rounded-full">
                    Active Strategy: {proxyServerStatus.strategy} (Failover Retries: 4)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {proxyServerStatus?.providers ? (
                  proxyServerStatus.providers.map((p: any, idx: number) => {
                    const isTesting = testingProviderId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                          p.isCooldown
                            ? 'bg-amber-950/20 border-amber-800/60'
                            : p.enabled
                            ? 'bg-slate-900/90 border-slate-700/80 hover:border-cyan-500/50'
                            : 'bg-slate-900/40 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <span className="text-[10px] font-mono text-slate-400 font-bold">
                                #{idx + 1}
                              </span>
                              <h4 className="text-sm font-bold text-white capitalize">{p.name}</h4>
                            </div>

                            {p.isCooldown ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-600/40 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Cooldown ({p.cooldownSecondsRemaining}s)
                              </span>
                            ) : p.enabled ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-600/40 flex items-center gap-1">
                                <Zap className="w-3 h-3" /> Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                                Disabled
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800 truncate">
                            Model: <span className="text-slate-200">{p.model}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1">
                            <div className="bg-slate-950/40 p-1.5 rounded border border-slate-800">
                              <div className="text-slate-500">အောင်မြင်မှု:</div>
                              <div className="text-emerald-400 font-bold">{p.successCount} reqs</div>
                            </div>
                            <div className="bg-slate-950/40 p-1.5 rounded border border-slate-800">
                              <div className="text-slate-500">အမှား:</div>
                              <div className={`${p.errorCount > 0 ? 'text-amber-400' : 'text-slate-400'} font-bold`}>
                                {p.errorCount} reqs
                              </div>
                            </div>
                          </div>

                          {p.lastError && (
                            <div className="text-[10px] text-rose-300/90 bg-rose-950/30 p-1.5 rounded border border-rose-900/40 line-clamp-2">
                              {p.lastError}
                            </div>
                          )}
                        </div>

                        <div className="pt-3 mt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleTestProvider(p.id)}
                            disabled={isTesting}
                            className="w-full py-2 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {isTesting ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                <span>စမ်းသပ်နေသည်...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                                <span>စမ်းသပ်မည် (Test Call)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-4 p-6 text-center text-slate-400 text-xs">
                    Proxy အခြေအနေ ရယူနေပါသည်...
                  </div>
                )}
              </div>
            </div>

            {/* Test Result Display Modal / Card */}
            {testResult && (
              <div
                className={`p-4 rounded-xl border ${
                  testResult.success
                    ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-800/80 text-rose-200'
                } space-y-2`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {testResult.provider?.toUpperCase()} စမ်းသပ်မှု{' '}
                      {testResult.success ? 'အောင်မြင်ပါသည် (Passed)' : 'မအောင်မြင်ပါ (Failed)'}
                    </span>
                    {testResult.latencyMs && (
                      <span className="font-mono text-[11px] bg-slate-900/60 px-2 py-0.5 rounded text-cyan-300">
                        {testResult.latencyMs} ms
                      </span>
                    )}
                    {testResult.model && (
                      <span className="font-mono text-[11px] bg-slate-900/60 px-2 py-0.5 rounded text-slate-300">
                        Model: {testResult.model}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestResult(null)}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    ပိတ်မည်
                  </button>
                </div>

                {testResult.success ? (
                  <div className="text-xs bg-slate-900/80 p-3 rounded-lg border border-slate-700/60 font-sans text-slate-100">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      မြန်မာဘာသာပြန် စမ်းသပ်မှု ရလဒ်:
                    </span>
                    {testResult.sample}
                  </div>
                ) : (
                  <div className="text-xs bg-rose-950/50 p-2.5 rounded-lg border border-rose-900/60 font-mono text-rose-300">
                    {testResult.error}
                  </div>
                )}
              </div>
            )}

            {/* API Keys Configuration Form */}
            <form onSubmit={handleSaveProxyConfig} className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>API Keys သတ်မှတ်သိမ်းဆည်းခြင်း (Firebase & Server Synced)</span>
                </h3>
                {proxySavedMsg && (
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> သိမ်းဆည်းပြီးပါပြီ
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Groq Key */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span>⚡ Groq API Key</span>
                    </label>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      High Speed
                    </span>
                  </div>
                  <input
                    type="password"
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    placeholder="gsk_..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Llama 3.3 / GPT-OSS 120B ဖြင့် မြန်ဆန်စွာ ဘာသာပြန်နိုင်သည်
                  </p>
                </div>

                {/* OpenRouter Key */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                      <span>🌐 OpenRouter API Key</span>
                    </label>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      Multi-Model
                    </span>
                  </div>
                  <input
                    type="password"
                    value={openRouterKeyInput}
                    onChange={(e) => setOpenRouterKeyInput(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Gemma 4 / MiniMax Flash Pool ဖြင့် အလိုအလျောက်ချိတ်ဆက်သည်
                  </p>
                </div>

                {/* DeepSeek Key */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <span>🧠 DeepSeek API Key</span>
                    </label>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      DeepSeek-V3
                    </span>
                  </div>
                  <input
                    type="password"
                    value={deepSeekKeyInput}
                    onChange={(e) => setDeepSeekKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    Balance မလုံလောက်ပါက အခြား Provider များသို့ အလိုအလျောက်ကူးပြောင်းသည်
                  </p>
                </div>
              </div>

              {/* Server-Side Gemini info card */}
              <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-indigo-200 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Google Gemini (Gemini 2.5 Flash)</span>
                  <p className="text-[11px] text-indigo-300/80">
                    Google Gemini ကို စနစ်၏ Built-in Environment (GEMINI_API_KEY) မှ တိုက်ရိုက် ရယူထားပြီး Round-Robin Rotation တွင် အမြဲ အဆင်သင့်ပါဝင်နေပါသည်။
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={savingProxy}
                className="w-full py-3.5 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>
                  {savingProxy
                    ? 'Firebase နှင့် Proxy Server သို့ သိမ်းဆည်းနေပါသည်...'
                    : 'Firebase နှင့် Proxy Server သို့ API Keys အတည်ပြု သိမ်းဆည်းမည် (Save & Sync)'}
                </span>
              </button>
            </form>

            {/* Custom AI Model API Keys Management Section */}
            <div className="space-y-4 pt-2 border-t border-slate-700/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <span>မန်နျူရယ် ထည့်သွင်းထားသော AI Model API Keys (Custom AI Keys Pool)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    အသစ်ထည့်သွင်းလိုသော မော်ဒယ်များနှင့် API Key များကို တိုက်ရိုက် စမ်းသပ်စစ်ဆေး၍ လှည့်ပတ်အသုံးပြုမှုထဲသို့ ထည့်သွင်းနိုင်ပါသည်
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddKeyModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>➕ AI MODEL API KEY အသစ် ထည့်သွင်းမည်</span>
                </button>
              </div>

              {/* Custom Keys List */}
              {proxyServerStatus?.customKeys && proxyServerStatus.customKeys.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {proxyServerStatus.customKeys.map((ck: any) => {
                    const isRetesting = retestingKeyId === ck.id;
                    return (
                      <div
                        key={ck.id}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                          ck.enabled
                            ? 'bg-slate-900/90 border-slate-700/80 hover:border-emerald-500/40'
                            : 'bg-slate-900/40 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-emerald-300 border border-slate-700">
                                  {ck.providerType}
                                </span>
                                <h4 className="text-sm font-bold text-white">{ck.label}</h4>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-1">
                                Model: <span className="text-slate-200">{ck.model}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleCustomKey(ck.id, ck.enabled)}
                              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                ck.enabled
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-600/40'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                              title={ck.enabled ? 'Disable Key' : 'Enable Key'}
                            >
                              {ck.enabled ? (
                                <>
                                  <ToggleRight className="w-4 h-4 text-emerald-400" />
                                  <span>Active</span>
                                </>
                              ) : (
                                <>
                                  <ToggleLeft className="w-4 h-4 text-slate-400" />
                                  <span>Off</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                            <span className="text-slate-400">Key: {ck.apiKeyMasked || '****'}</span>
                            {ck.testLatencyMs ? (
                              <span className="text-cyan-400 text-[10px]">
                                Passed ({ck.testLatencyMs}ms)
                              </span>
                            ) : ck.isTestedWorking ? (
                              <span className="text-emerald-400 text-[10px]">Tested Working</span>
                            ) : null}
                          </div>

                          {ck.baseUrl && (
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              Endpoint: {ck.baseUrl}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleRetestCustomKey(ck)}
                            disabled={isRetesting}
                            className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {isRetesting ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" />
                            ) : (
                              <Play className="w-3 h-3 text-cyan-400 fill-cyan-400" />
                            )}
                            <span>စမ်းသပ်မည် (Test)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCustomKey(ck.id)}
                            className="py-1.5 px-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer border border-rose-900/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ဖျက်မည်</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                  <Key className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-xs font-bold text-slate-300">
                    စိတ်ကြိုက် မန်နျူရယ်ထည့်သွင်းထားသော API Key မရှိသေးပါ
                  </div>
                  <div className="text-[11px] text-slate-500 max-w-md mx-auto">
                    အထက်ပါ "➕ AI MODEL API KEY အသစ် ထည့်သွင်းမည်" ခလုတ်ကို နှိပ်ပြီး မိမိစိတ်ကြိုက် API Key များကို တိုက်ရိုက် စမ်းသပ်ထည့်သွင်းနိုင်ပါသည်
                  </div>
                </div>
              )}
            </div>

            {/* How rotation works explanation */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs space-y-2 text-slate-300">
              <span className="font-bold text-white flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Automatic Fallback & Round-Robin Logic အလုပ်လုပ်ပုံ:</span>
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
                <li>
                  <strong className="text-slate-200">Round-Robin Rotation:</strong> စာအုပ်နှင့် စာရွက်စာတမ်း ဘာသာပြန်တိုင်းတွင် Request များကို Groq ➔ Gemini ➔ OpenRouter ➔ DeepSeek နှင့် စိတ်ကြိုက်ထည့်သွင်းထားသော Key များအကြား တစ်လှည့်စီ ညီမျှစွာ ခွဲဝေအသုံးပြုပေးသောကြောင့် Provider တစ်ခုတည်းပေါ်တွင် Daily Quota မကုန်စေပါ။
                </li>
                <li>
                  <strong className="text-slate-200">Automatic Failover (အမှားကာကွယ်မှု):</strong> အကယ်၍ Provider တစ်ခုတွင် Rate Limit (429)၊ Credit Balance ကုန်ဆုံးမှု (402) သို့မဟုတ် Server Error (500/503) ဖြစ်ပေါ်ပါက ထို Provider ကို ခေတ္တ Cooldown သတ်မှတ်ပြီး နောက်ထပ် Provider တစ်ခုထံသို့ အချိန်မဆိုင်းဘဲ ချက်ချင်း ကူးပြောင်း ဘာသာပြန်ပေးပါသည်။
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Direct Coin Top Up Modal */}
        {selectedUserForTopUp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>User အလိုက် တိကျစွာ Coin ထည့်သွင်းပေးခြင်း</span>
              </h3>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 text-xs space-y-1">
                <div>
                  User ID: <span className="font-mono text-indigo-300">{selectedUserForTopUp.id}</span>
                </div>
                <div>
                  အမည်: <span className="font-bold text-white">{selectedUserForTopUp.username}</span>
                </div>
                <div>
                  လက်ရှိ Coin: <span className="font-mono text-amber-400 font-bold">{selectedUserForTopUp.coinBalance}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  ထည့်သွင်းမည့် Coin ပမာဏ
                </label>
                <input
                  type="number"
                  min="1"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-950 border border-slate-700 rounded-xl text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForTopUp(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition cursor-pointer"
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="button"
                  onClick={handleDirectTopUp}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  Coin အတည်ပြုထည့်မည်
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-size Slip Preview Modal */}
        {viewingSlipImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="relative max-w-lg w-full bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileImage className="w-4 h-4 text-emerald-400" />
                  <span>ငွေလွှဲပြေစာ ဓာတ်ပုံ (Payment Slip Screenshot)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setViewingSlipImage(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-[75vh] overflow-auto flex items-center justify-center bg-slate-950 rounded-xl p-2 border border-slate-800">
                <img
                  src={viewingSlipImage}
                  alt="Payment Receipt Slip"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              </div>

              <button
                type="button"
                onClick={() => setViewingSlipImage(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                ပိတ်မည် (Close)
              </button>
            </div>
          </div>
        )}

        {/* Modal: Add New AI Model API Key with Live Testing */}
        {showAddKeyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto">
            <div className="relative max-w-xl w-full bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl p-6 space-y-5 my-8">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      AI MODEL API KEY အသစ် ထည့်သွင်းခြင်း
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      မထည့်သွင်းမီ API Key အမှန်တကယ် အလုပ်လုပ်မှု ရှိမရှိ Live စမ်းသပ်နိုင်ပါသည်
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddKeyModal(false);
                    setNewKeyTestResult(null);
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSaveNewCustomKey} className="space-y-4">
                {/* 1. Provider Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    ၁။ Provider အမျိုးအစား ရွေးချယ်ပါ
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        { id: 'groq', name: '⚡ Groq', sub: 'High-Speed' },
                        { id: 'openrouter', name: '🌐 OpenRouter', sub: 'Multi-Model' },
                        { id: 'deepseek', name: '🧠 DeepSeek', sub: 'DeepSeek-V3' },
                        { id: 'gemini', name: '✨ Google Gemini', sub: 'Flash / Pro' },
                        { id: 'openai-compatible', name: '🔌 Custom Endpoint', sub: 'OpenAI API' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleProviderTypeChange(t.id)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          newKeyProviderType === t.id
                            ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                        }`}
                      >
                        <div className="font-bold text-xs">{t.name}</div>
                        <div className="text-[10px] text-slate-400">{t.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Key Label */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ၂။ Key အညွှန်းအမည် (Label)
                  </label>
                  <input
                    type="text"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder="ဥပမာ: Backup Groq Key 2 သို့မဟုတ် OpenRouter Fast"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>

                {/* 3. Model Name with preset suggestions */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-300">
                      ၃။ Model အမည် (Model Identifier)
                    </label>
                    <span className="text-[10px] text-slate-400">Preset chips ကို နှိပ်၍လည်း ရွေးနိုင်ပါသည်</span>
                  </div>
                  <input
                    type="text"
                    value={newKeyModel}
                    onChange={(e) => setNewKeyModel(e.target.value)}
                    placeholder="e.g. openai/gpt-oss-120b, deepseek-chat, gemini-3.5-flash"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                  />

                  {/* Preset Suggestions */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    <span className="text-[10px] text-slate-400">အကြံပြုချက်:</span>
                    {newKeyProviderType === 'groq' && (
                      <>
                        {['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewKeyModel(m)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                    {newKeyProviderType === 'openrouter' && (
                      <>
                        {[
                          'google/gemma-4-26b-a4b-it:free',
                          'minimax/minimax-m3.1-flash:free',
                          'deepseek/deepseek-r1:free',
                          'meta-llama/llama-3.3-70b-instruct',
                        ].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewKeyModel(m)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                    {newKeyProviderType === 'deepseek' && (
                      <>
                        {['deepseek-chat', 'deepseek-reasoner'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewKeyModel(m)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                    {newKeyProviderType === 'gemini' && (
                      <>
                        {['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewKeyModel(m)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                    {newKeyProviderType === 'openai-compatible' && (
                      <>
                        {['gpt-4o-mini', 'mistral-large-latest', 'llama-3.3-70b'].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setNewKeyModel(m)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          >
                            {m}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* 4. API Key Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ၄။ API Key
                  </label>
                  <input
                    type="password"
                    value={newKeyApiKey}
                    onChange={(e) => setNewKeyApiKey(e.target.value)}
                    placeholder="sk-... သို့မဟုတ် gsk_..."
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required={newKeyProviderType !== 'gemini'}
                  />
                  {newKeyProviderType === 'gemini' && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Gemini Key ကို ကွက်လပ်ချန်ထားပါက စနစ်၏ Built-in Environment Key ကို အသုံးပြုပါမည်
                    </p>
                  )}
                </div>

                {/* 5. Custom Endpoint Base URL if openai-compatible */}
                {newKeyProviderType === 'openai-compatible' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      ၅။ API Base URL Endpoint
                    </label>
                    <input
                      type="url"
                      value={newKeyBaseUrl}
                      onChange={(e) => setNewKeyBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1 သို့မဟုတ် https://api.together.xyz/v1"
                      className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                )}

                {/* CRUCIAL REQUIREMENT: Pre-Add Live Test Action */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestNewKey}
                    disabled={isTestingNewKey || (!newKeyApiKey.trim() && newKeyProviderType !== 'gemini')}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 hover:text-emerald-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isTestingNewKey ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>API Key အား တကယ်အလုပ်လုပ်လား စစ်ဆေးနေပါသည်...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                        <span>⚡ တကယ်အလုပ်လုပ်လား မထည့်သွင်းမီ စမ်းသပ်မည် (Test Before Add)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Live Test Result Banner */}
                {newKeyTestResult && (
                  <div
                    className={`p-4 rounded-xl border ${
                      newKeyTestResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/80 text-rose-200'
                    } space-y-2`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {newKeyTestResult.success ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      )}
                      <span>
                        {newKeyTestResult.success
                          ? 'စမ်းသပ်မှု အောင်မြင်ပါသည် (Key is Valid & Working)'
                          : 'စမ်းသပ်မှု မအောင်မြင်ပါ (Key Invalid or Connection Failed)'}
                      </span>
                      {newKeyTestResult.latencyMs && (
                        <span className="font-mono text-[11px] bg-slate-900/80 px-2 py-0.5 rounded text-cyan-300">
                          {newKeyTestResult.latencyMs} ms
                        </span>
                      )}
                    </div>

                    {newKeyTestResult.success && newKeyTestResult.output && (
                      <div className="text-xs bg-slate-950/80 p-3 rounded-lg border border-slate-700/60 font-sans text-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          မြန်မာဘာသာပြန် စမ်းသပ်မှု ရလဒ်:
                        </span>
                        {newKeyTestResult.output}
                      </div>
                    )}

                    {!newKeyTestResult.success && newKeyTestResult.error && (
                      <div className="text-xs bg-rose-950/80 p-2.5 rounded-lg border border-rose-900/80 font-mono text-rose-300">
                        {newKeyTestResult.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Modal Footer / Submit */}
                <div className="flex gap-2.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddKeyModal(false);
                      setNewKeyTestResult(null);
                    }}
                    className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    မလုပ်တော့ပါ (Cancel)
                  </button>

                  <button
                    type="submit"
                    disabled={Boolean(addingKey || (newKeyTestResult && !newKeyTestResult.success))}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>
                      {addingKey
                        ? 'ထည့်သွင်းနေပါသည်...'
                        : 'အတည်ပြုပြီး ထည့်သွင်းမည် (Verify & Save)'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
