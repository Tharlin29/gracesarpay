import React from 'react';
import { UserAccount } from '../lib/firebase';
import {
  User,
  Shield,
  Menu,
} from 'lucide-react';

interface TopNavProps {
  user: UserAccount | null;
  isAdmin: boolean;
  timeRemainingSeconds?: number;
  onOpenProfileSideMenu: () => void;
  onOpenCoinTopUp?: () => void;
  onOpenAdminPanel?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  user,
  isAdmin,
  onOpenProfileSideMenu,
  onOpenAdminPanel,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo and Brand with 📖 icon instead of SP */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center text-xl shadow-md shadow-blue-500/20 select-none">
            📖
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                SarPay AI
              </span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden xs:block">
              မြန်မာဘာသာပြန်နှင့် စာအုပ် Studio
            </p>
          </div>
        </div>

        {/* Action Widgets */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Admin shortcut if logged in as Admin */}
          {isAdmin && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin Panel</span>
            </button>
          )}

          {/* User Profile Icon Button (Placed where coin balance / timer were, clicking opens Sidemenu) */}
          {user && (
            <button
              type="button"
              onClick={onOpenProfileSideMenu}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-200/80 text-blue-950 text-xs font-bold transition shadow-2xs cursor-pointer group hover:shadow-sm"
              title="User Profile Menu ကိုဖွင့်ပါ (Sidemenu)"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs uppercase shadow-inner relative">
                {user.username ? user.username.charAt(0) : <User className="w-3.5 h-3.5" />}
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white"></span>
              </div>
              <div className="text-left">
                <div className="font-extrabold text-slate-900 leading-tight flex items-center gap-1">
                  <span>{user.username}</span>
                  <span className="text-[10px] text-blue-600 font-normal hidden sm:inline">(Profile)</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono hidden md:block">{user.id}</div>
              </div>
              <Menu className="w-4 h-4 text-blue-600 group-hover:text-blue-800 ml-1" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
