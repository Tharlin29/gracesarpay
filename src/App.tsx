import React, { useState, useEffect, useRef } from 'react';
import {
  UserAccount,
  PaymentConfig,
  loadPaymentSettings,
  subscribeToPaymentSettings,
  updateUserAccount,
  getLocalUsers,
  TranslationHistoryItem,
} from './lib/firebase';
import { ParsedDocument } from './lib/fileParser';
import { TopNav } from './components/TopNav';
import { SideMenu } from './components/SideMenu';
import { AuthModal } from './components/AuthModal';
import { CoinTopUpModal } from './components/CoinTopUpModal';
import { CoinTransferModal } from './components/CoinTransferModal';
import { TimePurchaseModal } from './components/TimePurchaseModal';
import { TimeExpiredLockout } from './components/TimeExpiredLockout';
import { AdminPanel } from './components/AdminPanel';
import { DocumentTranslator } from './components/DocumentTranslator';
import { LargeBookStudio } from './components/LargeBookStudio';
import { HistoryModal } from './components/HistoryModal';
import { BookOpen, Sparkles, Shield, AlertTriangle } from 'lucide-react';

const CURRENT_USER_KEY = 'sarpay_current_user';
const IS_ADMIN_KEY = 'sarpay_is_admin';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem(IS_ADMIN_KEY) === 'true';
  });

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(!currentUser && !isAdmin);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [showCoinTopUp, setShowCoinTopUp] = useState(false);
  const [showCoinTransfer, setShowCoinTransfer] = useState(false);
  const [showTimePurchase, setShowTimePurchase] = useState(false);
  const [historyModalState, setHistoryModalState] = useState<{
    isOpen: boolean;
    tab: 'small' | 'large';
  }>({ isOpen: false, tab: 'small' });

  // Large book studio state
  const [activeLargeBook, setActiveLargeBook] = useState<ParsedDocument | null>(null);

  // Payment configuration (uploaded by admin)
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    kpayNumber: '',
    kpayName: '',
    waveNumber: '',
    waveName: '',
    usdtAddress: '',
    usdtNetwork: 'BEP20 (BNB Smart Chain)',
    isUploadedByAdmin: false,
    updatedAt: Date.now(),
  });

  // Load and subscribe to payment configuration from Firebase in real-time
  useEffect(() => {
    loadPaymentSettings().then((config) => {
      setPaymentConfig(config);
    });

    const unsubscribe = subscribeToPaymentSettings((config) => {
      setPaymentConfig(config);
    });

    return () => unsubscribe();
  }, []);

  // Timer countdown: 1 second decrements when user is active
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      setCurrentUser((prev) => {
        if (!prev) return null;
        if (prev.timeRemainingSeconds <= 0) {
          return { ...prev, timeRemainingSeconds: 0 };
        }
        const updated = {
          ...prev,
          timeRemainingSeconds: prev.timeRemainingSeconds - 1,
        };
        // Periodically sync
        if (updated.timeRemainingSeconds % 10 === 0) {
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
          updateUserAccount(updated.id, {
            timeRemainingSeconds: updated.timeRemainingSeconds,
          });
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const handleUserLoginSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    setIsAdmin(false);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    localStorage.setItem(IS_ADMIN_KEY, 'false');
    setShowAuthModal(false);
  };

  const handleAdminLogin = () => {
    setIsAdmin(true);
    localStorage.setItem(IS_ADMIN_KEY, 'true');
    setShowAuthModal(false);
    setShowAdminPanel(true);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsAdmin(false);
    setShowAdminPanel(false);
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(IS_ADMIN_KEY);
    setShowAuthModal(true);
  };

  const handleOpenLargeStudio = (doc: ParsedDocument) => {
    setActiveLargeBook(doc);
  };

  const isTimeExpired = (currentUser?.timeRemainingSeconds ?? 1) <= 0;

  // View: Admin Panel
  if (showAdminPanel) {
    return (
      <AdminPanel
        paymentConfig={paymentConfig}
        onPaymentConfigUpdated={(newCfg) => setPaymentConfig(newCfg)}
        onBackToApp={() => setShowAdminPanel(false)}
        onAdminLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-800 flex flex-col">
      {/* 1. Top Navigation Bar (Noti Bar) */}
      <TopNav
        user={currentUser}
        isAdmin={isAdmin}
        timeRemainingSeconds={currentUser?.timeRemainingSeconds || 0}
        onOpenProfileSideMenu={() => setShowSideMenu(true)}
        onOpenCoinTopUp={() => setShowCoinTopUp(true)}
        onOpenAdminPanel={isAdmin ? () => setShowAdminPanel(true) : undefined}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Banner Welcome Info */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-semibold text-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Gemini 3.5 Flash Model Cascade AI စနစ်</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              စာအုပ်နှင့် စာရွက်စာတမ်း မြန်မာဘာသာပြန် Studio
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
              PDF, Word (.docx) နှင့် စာအုပ်ကြီးများကို သဘာဝကျသော မြန်မာစာအရေးအသားဖြင့် ပြန်ဆိုနိုင်ပါသည်။ စာမျက်နှာ ၅ မျက်နှာကျော်ပါက သီးသန့် အပိုင်းခွဲ Studio ဖြင့် ၅ မျက်နှာစီ စနစ်တကျ ပြန်ဆိုနိုင်ပါသည်။
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowAdminPanel(true)}
                className="py-3 px-5 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                <span>Admin Panel ဖွင့်မည်</span>
              </button>
            </div>
          )}
        </div>

        {/* Studio Switch: If large book active, render LargeBookStudio */}
        {activeLargeBook ? (
          <LargeBookStudio
            userId={currentUser?.id || 'guest'}
            bookTitle={activeLargeBook.fileName}
            originalPageCount={activeLargeBook.pageCount}
            originalWordCount={activeLargeBook.wordCount}
            initialSegments={activeLargeBook.segments}
            onBack={() => setActiveLargeBook(null)}
          />
        ) : (
          /* Document Translator with upload area directly under noti bar */
          <DocumentTranslator
            userId={currentUser?.id || 'guest'}
            onOpenLargeStudio={handleOpenLargeStudio}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/80 bg-white/80 py-4 px-6 text-center text-xs text-slate-500">
        <p>SarPay AI • မြန်မာဘာသာပြန်နှင့် စာအုပ် Studio • Firebase Synchronized</p>
      </footer>

      {/* 2. Side Menu (Drawer triggered from User Profile click) */}
      {currentUser && (
        <SideMenu
          isOpen={showSideMenu}
          onClose={() => setShowSideMenu(false)}
          user={currentUser}
          isAdmin={isAdmin}
          timeRemainingSeconds={currentUser.timeRemainingSeconds}
          onOpenCoinTopUp={() => setShowCoinTopUp(true)}
          onOpenCoinTransfer={() => setShowCoinTransfer(true)}
          onOpenTimePurchase={() => setShowTimePurchase(true)}
          onOpenHistory={(tab) => setHistoryModalState({ isOpen: true, tab })}
          onOpenAdminPanel={isAdmin ? () => setShowAdminPanel(true) : undefined}
          onLogout={handleLogout}
        />
      )}

      {/* 3. Authentication Modal (Login / Register with 1 Account per Phone Limit / Admin Login) */}
      <AuthModal
        isOpen={showAuthModal}
        onSuccess={handleUserLoginSuccess}
        onAdminLogin={handleAdminLogin}
      />

      {/* 4. Coin Top Up Modal (KPay / Wave / USDT BEP-20) */}
      {currentUser && (
        <CoinTopUpModal
          isOpen={showCoinTopUp}
          onClose={() => setShowCoinTopUp(false)}
          user={currentUser}
          paymentConfig={paymentConfig}
          onRequestSubmitted={() => {
            // Refresh local user state if needed
            const fresh = getLocalUsers().find((u) => u.id === currentUser.id);
            if (fresh) setCurrentUser(fresh);
          }}
        />
      )}

      {/* 5. Coin Transfer Modal (User to user) */}
      {currentUser && (
        <CoinTransferModal
          isOpen={showCoinTransfer}
          onClose={() => setShowCoinTransfer(false)}
          user={currentUser}
          onTransferSuccess={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
          }}
        />
      )}

      {/* 6. Time Purchase Modal (Exchange coins for time) */}
      {currentUser && (
        <TimePurchaseModal
          isOpen={showTimePurchase}
          onClose={() => setShowTimePurchase(false)}
          user={currentUser}
          onTimePurchased={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
          }}
        />
      )}

      {/* 7. Translation History Modal (Small & Large books history) */}
      <HistoryModal
        isOpen={historyModalState.isOpen}
        initialTab={historyModalState.tab}
        onClose={() => setHistoryModalState({ isOpen: false, tab: 'small' })}
        userId={currentUser?.id || 'guest'}
      />

      {/* 8. Time Expired Lockout (Locks Apk/App when time expires as requested) */}
      {currentUser && isTimeExpired && !isAdmin && (
        <TimeExpiredLockout
          user={currentUser}
          onOpenTimePurchase={() => setShowTimePurchase(true)}
          onOpenCoinTopUp={() => setShowCoinTopUp(true)}
        />
      )}
    </div>
  );
}
