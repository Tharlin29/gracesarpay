import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: 'AIzaSyBFSOzRe4c6Hd57z2VYou-IMfPQ7DiHNpg',
  authDomain: 'sarpay-f4547.firebaseapp.com',
  databaseURL: 'https://sarpay-f4547-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'sarpay-f4547',
  storageBucket: 'sarpay-f4547.firebasestorage.app',
  messagingSenderId: '405355268245',
  appId: '1:405355268245:web:a5e406b0fc92b85bd0f39c',
  measurementId: 'G-CNZ69H7TBG',
};

// Initialize Firebase App singleton
export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(firebaseApp);

export interface UserAccount {
  id: string; // e.g. "SP-92418"
  username: string;
  phone: string;
  password?: string;
  deviceId: string;
  coinBalance: number;
  timeRemainingSeconds: number; // in seconds
  role: 'user' | 'admin';
  createdAt: number;
  lastActive: number;
  lastReportSubmittedAt?: number;
}

export interface PaymentConfig {
  kpayNumber: string;
  kpayName: string;
  waveNumber: string;
  waveName: string;
  usdtAddress: string;
  usdtNetwork: string; // "BEP20 (BNB Smart Chain)"
  isUploadedByAdmin: boolean;
  updatedAt: number;
  adminNote?: string;
}

export interface TimePackage {
  id: string;
  title: string;
  durationValue: number;
  durationUnit: 'hours' | 'days' | 'minutes';
  seconds: number;
  costCoins: number;
  badge?: string;
  isActive: boolean;
  order: number;
}

export interface CoinTopUpRequest {
  id: string;
  userId: string;
  username: string;
  amountCoins: number;
  paymentMethod: 'kpay' | 'wave' | 'usdt';
  accountUsed: string;
  transactionId: string;
  senderPhone?: string;
  slipImage?: string; // Slip screenshot base64
  slipNote?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface CoinTransferRecord {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  amountCoins: number;
  createdAt: number;
}

export interface TranslationSegment {
  id: string;
  segmentIndex: number;
  title: string;
  pageRange: string;
  originalText: string;
  translatedText: string;
  status: 'pending' | 'translating' | 'completed' | 'failed';
  wordCount: number;
  durationSec?: number;
}

export interface TranslationHistoryItem {
  id: string;
  userId: string;
  title: string;
  type: 'small' | 'large';
  createdAt: number;
  originalWordCount: number;
  originalPageCount: number;
  modelUsed: string;
  isDeleted?: boolean; // For soft-delete and restore capability
  translatedContent: string; // Full text for small, or merged for large
  segments?: TranslationSegment[]; // For large books (20-page chunks)
  aiReview?: string; // AI Summary, Strengths, Weaknesses, Insights
}

// Device Fingerprint Helper
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'sarpay_device_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
}

// Local Storage Fallback Keys
const LOCAL_USERS_KEY = 'sarpay_local_users';
const LOCAL_SETTINGS_KEY = 'sarpay_local_payment_config';
const LOCAL_PACKAGES_KEY = 'sarpay_local_time_packages';
const LOCAL_REQUESTS_KEY = 'sarpay_local_topup_requests';
const LOCAL_TRANSFERS_KEY = 'sarpay_local_transfers';
const LOCAL_HISTORY_KEY = 'sarpay_local_history';

// Default standard time packages if none configured in Firebase
export const DEFAULT_TIME_PACKAGES: TimePackage[] = [
  {
    id: 'pkg-1hr',
    title: '၁ နာရီ အသုံးပြုခွင့်',
    durationValue: 1,
    durationUnit: 'hours',
    seconds: 3600,
    costCoins: 10,
    badge: 'Standard',
    isActive: true,
    order: 1,
  },
  {
    id: 'pkg-3hr',
    title: '၃ နာရီ အသုံးပြုခွင့်',
    durationValue: 3,
    durationUnit: 'hours',
    seconds: 10800,
    costCoins: 25,
    badge: 'Popular',
    isActive: true,
    order: 2,
  },
  {
    id: 'pkg-24hr',
    title: '၁ ရက် (၂၄ နာရီ) သက်တမ်း',
    durationValue: 24,
    durationUnit: 'hours',
    seconds: 86400,
    costCoins: 50,
    badge: 'Best Value',
    isActive: true,
    order: 3,
  },
  {
    id: 'pkg-7days',
    title: '၁ ပတ် (၇ ရက်) အကန့်အသတ်မဲ့',
    durationValue: 7,
    durationUnit: 'days',
    seconds: 604800,
    costCoins: 100,
    badge: 'Pro Studio',
    isActive: true,
    order: 4,
  },
];

// Helper to get local time packages
export function getLocalTimePackages(): TimePackage[] {
  try {
    const raw = localStorage.getItem(LOCAL_PACKAGES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_TIME_PACKAGES;
}

export function saveLocalTimePackages(packages: TimePackage[]) {
  try {
    localStorage.setItem(LOCAL_PACKAGES_KEY, JSON.stringify(packages));
  } catch (e) {
    console.error('Failed to save local time packages', e);
  }
}

// Helper to get local data safely
export function getLocalUsers(): UserAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalUsers(users: UserAccount[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Failed to save local users', e);
  }
}

export function getLocalPaymentConfig(): PaymentConfig {
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    kpayNumber: '',
    kpayName: '',
    waveNumber: '',
    waveName: '',
    usdtAddress: '',
    usdtNetwork: 'BEP20 (BNB Smart Chain)',
    isUploadedByAdmin: false,
    updatedAt: Date.now(),
  };
}

export function saveLocalPaymentConfig(config: PaymentConfig) {
  try {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save payment config', e);
  }
}

export function getLocalRequests(): CoinTopUpRequest[] {
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRequests(reqs: CoinTopUpRequest[]) {
  try {
    localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(reqs));
  } catch (e) {
    console.error('Failed to save requests', e);
  }
}

export function getLocalHistory(): TranslationHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalHistory(items: TranslationHistoryItem[]) {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save history', e);
  }
}

// Check Device Registration Limit: One account per device
export async function checkDeviceRegistered(deviceId: string): Promise<UserAccount | null> {
  // Check local users first
  const localUsers = getLocalUsers();
  const existingLocal = localUsers.find((u) => u.deviceId === deviceId);
  if (existingLocal) return existingLocal;

  // Check Firestore
  try {
    const userDoc = await getDoc(doc(db, 'devices', deviceId));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return data as UserAccount;
    }
  } catch (e) {
    // Firestore might be unauthenticated or restricted, fallback to local
    console.warn('Firestore device check fallback:', e);
  }
  return null;
}

// Register User
export async function registerUserAccount(data: {
  username: string;
  phone: string;
  password: string;
}): Promise<{ user: UserAccount; error?: string }> {
  const deviceId = getOrCreateDeviceId();

  // Check if device already has an account
  const deviceCheck = await checkDeviceRegistered(deviceId);
  if (deviceCheck) {
    return {
      user: deviceCheck,
      error: 'ဤဖုန်း/စက်ပစ္စည်းတွင် အကောင့်တစ်ခု ဖွင့်ထားပြီးဖြစ်ပါသည်။ ဖုန်းတစ်လုံးလျှင် အကောင့်တစ်ခုသာ ဖွင့်ခွင့်ရှိပါသည်။ (Device limit: 1 account per device)',
    };
  }

  // Generate unique User ID
  const randomSuffix = Math.floor(10000 + Math.random() * 90000);
  const userId = `SP-${randomSuffix}`;

  const newUser: UserAccount = {
    id: userId,
    username: data.username.trim(),
    phone: data.phone.trim(),
    password: data.password,
    deviceId,
    coinBalance: 25, // Initial welcome bonus coins
    timeRemainingSeconds: 15 * 60, // 15 minutes initial free trial
    role: 'user',
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  // Save to local
  const localUsers = getLocalUsers();
  localUsers.push(newUser);
  saveLocalUsers(localUsers);

  // Sync to Firestore
  try {
    await setDoc(doc(db, 'users', userId), newUser);
    await setDoc(doc(db, 'devices', deviceId), {
      userId,
      registeredAt: Date.now(),
    });
  } catch (e) {
    console.warn('Firestore sync user warning (fallback active):', e);
  }

  return { user: newUser };
}

// User Login
export async function loginUserAccount(
  phoneOrId: string,
  pass: string
): Promise<{ user?: UserAccount; error?: string }> {
  const localUsers = getLocalUsers();
  const found = localUsers.find(
    (u) =>
      (u.phone.trim() === phoneOrId.trim() || u.id.trim() === phoneOrId.trim()) &&
      u.password === pass
  );

  if (found) {
    found.lastActive = Date.now();
    saveLocalUsers(localUsers);
    return { user: found };
  }

  // Try fetching from Firestore
  try {
    const qSnap = await getDocs(collection(db, 'users'));
    for (const d of qSnap.docs) {
      const u = d.data() as UserAccount;
      if (
        (u.phone?.trim() === phoneOrId.trim() || u.id?.trim() === phoneOrId.trim()) &&
        u.password === pass
      ) {
        // Cache to local
        if (!localUsers.some((x) => x.id === u.id)) {
          localUsers.push(u);
          saveLocalUsers(localUsers);
        }
        return { user: u };
      }
    }
  } catch (e) {
    console.warn('Firestore login fallback:', e);
  }

  return { error: 'ဖုန်းနံပါတ်/ID သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်။ (Invalid credentials)' };
}

// Update User's coin or time
export async function updateUserAccount(
  userId: string,
  updates: Partial<UserAccount>
): Promise<UserAccount | null> {
  const localUsers = getLocalUsers();
  const idx = localUsers.findIndex((u) => u.id === userId);
  let updatedUser: UserAccount | null = null;

  if (idx !== -1) {
    localUsers[idx] = { ...localUsers[idx], ...updates, lastActive: Date.now() };
    updatedUser = localUsers[idx];
    saveLocalUsers(localUsers);
  }

  try {
    const ref = doc(db, 'users', userId);
    await updateDoc(ref, updates as any);
  } catch (e) {
    console.warn('Firestore update fallback:', e);
  }

  return updatedUser;
}

// Transfer coins between users
export async function transferCoins(
  fromUserId: string,
  toUserIdOrPhone: string,
  amount: number
): Promise<{ success: boolean; error?: string; updatedSender?: UserAccount }> {
  if (amount <= 0) {
    return { success: false, error: 'လွှဲပြောင်းမည့် Coin ပမာဏ အနည်းဆုံး ၁ ဖြစ်ရပါမည်။' };
  }

  const localUsers = getLocalUsers();
  const sender = localUsers.find((u) => u.id === fromUserId);
  if (!sender) return { success: false, error: 'ပေးပို့သူ အကောင့်ရှာမတွေ့ပါ။' };
  if (sender.coinBalance < amount) {
    return {
      success: false,
      error: `သင့်တွင် Coin မလုံလောက်ပါ။ လက်ကျန် Coin: ${sender.coinBalance}`,
    };
  }

  const recipient = localUsers.find(
    (u) =>
      (u.id.toLowerCase() === toUserIdOrPhone.toLowerCase() ||
        u.phone.trim() === toUserIdOrPhone.trim()) &&
      u.id !== fromUserId
  );

  if (!recipient) {
    return {
      success: false,
      error: 'လက်ခံမည့် User ID သို့မဟုတ် ဖုန်းနံပါတ် ရှာမတွေ့ပါ။ မှန်ကန်စွာ ရိုက်ထည့်ပါ။',
    };
  }

  // Execute transfer
  sender.coinBalance -= amount;
  recipient.coinBalance += amount;
  saveLocalUsers(localUsers);

  // Record transfer log
  const transferLog: CoinTransferRecord = {
    id: 'TRF-' + Date.now().toString(36).toUpperCase(),
    fromUserId: sender.id,
    fromUsername: sender.username,
    toUserId: recipient.id,
    toUsername: recipient.username,
    amountCoins: amount,
    createdAt: Date.now(),
  };

  try {
    await setDoc(doc(db, 'transfers', transferLog.id), transferLog);
    await updateDoc(doc(db, 'users', sender.id), { coinBalance: sender.coinBalance });
    await updateDoc(doc(db, 'users', recipient.id), { coinBalance: recipient.coinBalance });
  } catch (e) {
    console.warn('Firestore transfer fallback:', e);
  }

  return { success: true, updatedSender: sender };
}

// Submit Coin Top-up Request
export async function submitTopUpRequest(request: Omit<CoinTopUpRequest, 'id' | 'status' | 'createdAt'>): Promise<CoinTopUpRequest> {
  const newReq: CoinTopUpRequest = {
    ...request,
    id: 'REQ-' + Math.floor(1000 + Math.random() * 9000) + '-' + Date.now().toString(36).toUpperCase(),
    status: 'pending',
    createdAt: Date.now(),
  };

  const localReqs = getLocalRequests();
  localReqs.unshift(newReq);
  saveLocalRequests(localReqs);

  // Record report timestamp for 5-hour limit
  saveLastReportTime(request.userId, newReq.createdAt);
  const localUsers = getLocalUsers();
  const u = localUsers.find((x) => x.id === request.userId);
  if (u) {
    u.lastReportSubmittedAt = newReq.createdAt;
    saveLocalUsers(localUsers);
  }

  try {
    await setDoc(doc(db, 'topup_requests', newReq.id), newReq);
  } catch (e) {
    console.warn('Firestore topup req fallback:', e);
  }

  return newReq;
}

// 5 Hours Cooldown Limit for Payment Reports (5 hours = 18,000,000 ms)
export const REPORT_COOLDOWN_MS = 5 * 60 * 60 * 1000;

export function getLastReportTime(userId: string): number | null {
  try {
    const raw = localStorage.getItem(`sarpay_last_report_${userId}`);
    if (raw) {
      const val = parseInt(raw, 10);
      if (!isNaN(val)) return val;
    }
  } catch {}
  return null;
}

export function saveLastReportTime(userId: string, timestamp: number = Date.now()) {
  try {
    localStorage.setItem(`sarpay_last_report_${userId}`, timestamp.toString());
  } catch {}
}

// Admin approves topup request -> credits coins to user
export async function processTopUpRequest(
  requestId: string,
  action: 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  const localReqs = getLocalRequests();
  const req = localReqs.find((r) => r.id === requestId);
  if (!req) return { success: false, error: 'Request not found' };

  req.status = action;
  saveLocalRequests(localReqs);

  if (action === 'approved') {
    // Add coins to user
    const localUsers = getLocalUsers();
    const user = localUsers.find((u) => u.id === req.userId);
    if (user) {
      user.coinBalance += req.amountCoins;
      saveLocalUsers(localUsers);
      try {
        await updateDoc(doc(db, 'users', user.id), { coinBalance: user.coinBalance });
      } catch {}
    }
  }

  try {
    await updateDoc(doc(db, 'topup_requests', requestId), { status: action });
  } catch {}

  return { success: true };
}

// Admin direct coin top up
export async function adminDirectCoinTopUp(
  userId: string,
  amount: number
): Promise<{ success: boolean; error?: string; updatedUser?: UserAccount }> {
  const localUsers = getLocalUsers();
  const user = localUsers.find((u) => u.id === userId);
  if (!user) return { success: false, error: 'အသုံးပြုသူ ရှာမတွေ့ပါ။' };

  user.coinBalance = Math.max(0, user.coinBalance + amount);
  saveLocalUsers(localUsers);

  try {
    await updateDoc(doc(db, 'users', userId), { coinBalance: user.coinBalance });
  } catch {}

  return { success: true, updatedUser: user };
}

// Save Payment Details uploaded by Admin
export async function savePaymentSettings(config: PaymentConfig): Promise<void> {
  const hasAccounts = Boolean(
    (config.kpayNumber && config.kpayNumber.trim() !== '') ||
    (config.waveNumber && config.waveNumber.trim() !== '') ||
    (config.usdtAddress && config.usdtAddress.trim() !== '')
  );

  const updated: PaymentConfig = {
    ...config,
    isUploadedByAdmin: hasAccounts || config.isUploadedByAdmin,
    updatedAt: Date.now(),
  };
  saveLocalPaymentConfig(updated);

  try {
    await setDoc(doc(db, 'settings', 'payments'), updated);
  } catch (e) {
    console.warn('Firestore save payment settings fallback:', e);
  }
}

// Load Payment Details
export async function loadPaymentSettings(): Promise<PaymentConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'payments'));
    if (snap.exists()) {
      const data = snap.data() as PaymentConfig;
      saveLocalPaymentConfig(data);
      return data;
    }
  } catch (e) {
    console.warn('Firestore load payment settings fallback:', e);
  }
  return getLocalPaymentConfig();
}

// Subscribe in real-time to Payment Settings from Firebase Firestore
export function subscribeToPaymentSettings(
  callback: (config: PaymentConfig) => void
): () => void {
  try {
    const unsub = onSnapshot(
      doc(db, 'settings', 'payments'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PaymentConfig;
          saveLocalPaymentConfig(data);
          callback(data);
        } else {
          callback(getLocalPaymentConfig());
        }
      },
      (error) => {
        console.warn('Firestore payment listener warning:', error);
        callback(getLocalPaymentConfig());
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Firestore payment listener fallback:', e);
    callback(getLocalPaymentConfig());
    return () => {};
  }
}

// Subscribe in real-time to TopUp Requests from Firebase Firestore
export function subscribeToTopUpRequests(
  callback: (requests: CoinTopUpRequest[]) => void
): () => void {
  try {
    const unsub = onSnapshot(
      collection(db, 'topup_requests'),
      (snap) => {
        const list: CoinTopUpRequest[] = [];
        snap.forEach((d) => {
          list.push(d.data() as CoinTopUpRequest);
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        if (list.length > 0) {
          saveLocalRequests(list);
          callback(list);
        } else {
          callback(getLocalRequests());
        }
      },
      (error) => {
        console.warn('Firestore requests listener warning:', error);
        callback(getLocalRequests());
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Firestore requests listener fallback:', e);
    callback(getLocalRequests());
    return () => {};
  }
}

// -------------------------------------------------------------
// Time Packages & Pricing Firestore Sync (Admin Edit & User Load)
// -------------------------------------------------------------

// Save Time Packages & Pricing edited by Admin to Firebase
export async function saveTimePackages(packages: TimePackage[]): Promise<void> {
  saveLocalTimePackages(packages);

  try {
    await setDoc(doc(db, 'settings', 'time_packages'), {
      packages,
      updatedAt: Date.now(),
    });
    console.log('[Firebase] Time packages saved successfully');
  } catch (e) {
    console.warn('Firestore save time packages fallback:', e);
  }
}

// Load Time Packages & Pricing from Firebase
export async function loadTimePackages(): Promise<TimePackage[]> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'time_packages'));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data?.packages) && data.packages.length > 0) {
        saveLocalTimePackages(data.packages);
        return data.packages as TimePackage[];
      }
    }
  } catch (e) {
    console.warn('Firestore load time packages fallback:', e);
  }
  return getLocalTimePackages();
}

// Subscribe in real-time to Time Packages & Pricing from Firebase Firestore
export function subscribeToTimePackages(
  callback: (packages: TimePackage[]) => void
): () => void {
  try {
    const unsub = onSnapshot(
      doc(db, 'settings', 'time_packages'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data?.packages) && data.packages.length > 0) {
            saveLocalTimePackages(data.packages);
            callback(data.packages as TimePackage[]);
            return;
          }
        }
        callback(getLocalTimePackages());
      },
      (error) => {
        console.warn('Firestore time packages listener warning:', error);
        callback(getLocalTimePackages());
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Firestore time packages listener fallback:', e);
    callback(getLocalTimePackages());
    return () => {};
  }
}

// -------------------------------------------------------------
// API Key Rotation & Multi-Provider Backend Proxy Configuration
// -------------------------------------------------------------

export interface CustomApiKeyEntry {
  id: string;
  label: string;
  providerType: 'groq' | 'gemini' | 'openrouter' | 'deepseek' | 'openai-compatible';
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  isTestedWorking: boolean;
  lastTestedAt?: number;
  testLatencyMs?: number;
  createdAt: number;
  successCount?: number;
  errorCount?: number;
  lastError?: string;
  cooldownUntil?: number;
  apiKeyMasked?: string;
}

export interface ProxyProviderItem {
  id: 'groq' | 'gemini' | 'openrouter' | 'deepseek';
  name: string;
  model: string;
  enabled: boolean;
  priority: number;
  dailyLimitReached?: boolean;
  lastError?: string;
  successCount?: number;
  failCount?: number;
  lastUsedAt?: number;
}

export interface ApiProxyConfig {
  groqApiKey: string;
  openRouterApiKey: string;
  deepSeekApiKey: string;
  rotationStrategy: 'round-robin' | 'priority-fallback';
  activeProviderIndex: number;
  updatedAt: number;
  providers: ProxyProviderItem[];
  customKeys?: CustomApiKeyEntry[];
}

export const DEFAULT_PROXY_CONFIG: ApiProxyConfig = {
  groqApiKey: '',
  openRouterApiKey: '',
  deepSeekApiKey: '',
  rotationStrategy: 'round-robin',
  activeProviderIndex: 0,
  updatedAt: Date.now(),
  customKeys: [],
  providers: [
    {
      id: 'groq',
      name: 'Groq (High-Speed Llama / GPT-OSS)',
      model: 'openai/gpt-oss-120b',
      enabled: true,
      priority: 1,
      successCount: 0,
      failCount: 0,
    },
    {
      id: 'gemini',
      name: 'Google Gemini (Flash Cascade)',
      model: 'gemini-3.5-flash',
      enabled: true,
      priority: 2,
      successCount: 0,
      failCount: 0,
    },
    {
      id: 'openrouter',
      name: 'OpenRouter (Multi-Model Pool)',
      model: 'google/gemma-4-26b-a4b-it:free',
      enabled: true,
      priority: 3,
      successCount: 0,
      failCount: 0,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek AI (DeepSeek-V3)',
      model: 'deepseek-chat',
      enabled: true,
      priority: 4,
      successCount: 0,
      failCount: 0,
    },
  ],
};

const LOCAL_PROXY_CONFIG_KEY = 'sarpay_local_api_proxy_config';

export function getLocalProxyConfig(): ApiProxyConfig {
  try {
    const raw = localStorage.getItem(LOCAL_PROXY_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.groqApiKey) return parsed;
    }
  } catch {}
  return DEFAULT_PROXY_CONFIG;
}

export function saveLocalProxyConfig(config: ApiProxyConfig) {
  try {
    localStorage.setItem(LOCAL_PROXY_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save local proxy config', e);
  }
}

export async function saveApiProxyConfig(config: ApiProxyConfig): Promise<void> {
  saveLocalProxyConfig(config);

  // Sync to backend proxy endpoint
  try {
    await fetch('/api/proxy/update-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch (e) {
    console.warn('Backend proxy sync warning:', e);
  }

  // Sync to Firebase Firestore
  try {
    await setDoc(doc(db, 'settings', 'api_keys_proxy'), {
      ...config,
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.warn('Firestore save api proxy config fallback:', e);
  }
}

export async function loadApiProxyConfig(): Promise<ApiProxyConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'api_keys_proxy'));
    if (snap.exists()) {
      const data = snap.data() as ApiProxyConfig;
      if (data && data.groqApiKey) {
        saveLocalProxyConfig(data);
        return data;
      }
    }
  } catch (e) {
    console.warn('Firestore load api proxy config fallback:', e);
  }
  return getLocalProxyConfig();
}

export function subscribeToApiProxyConfig(
  callback: (config: ApiProxyConfig) => void
): () => void {
  try {
    const unsub = onSnapshot(
      doc(db, 'settings', 'api_keys_proxy'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ApiProxyConfig;
          if (data && data.groqApiKey) {
            saveLocalProxyConfig(data);
            callback(data);
            return;
          }
        }
        callback(getLocalProxyConfig());
      },
      (error) => {
        console.warn('Firestore api proxy listener warning:', error);
        callback(getLocalProxyConfig());
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Firestore api proxy listener fallback:', e);
    callback(getLocalProxyConfig());
    return () => {};
  }
}

