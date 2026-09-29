/** الهيكل العام: الشريط الجانبي + الشريط العلوي */
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Receipt, Package, BookOpen, Truck, Users,
  Wallet, TrendingUp, Settings as SettingsIcon, LogOut, Menu, X, Pill,
  ShoppingBag, Boxes, ChevronDown, UserCircle2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { cn, ROLE_LABELS } from '../lib/format.js';

const NAV = [
  { to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard, end: true },
  { to: '/pos', label: 'نقطة البيع', icon: ShoppingCart },
  { to: '/sales', label: 'فواتير المبيعات', icon: Receipt },
  { to: '/purchases', label: 'المشتريات', icon: ShoppingBag, role: 'pharmacist' },
  { to: '/inventory', label: 'المخزون', icon: Boxes },
  { to: '/catalog', label: 'دليل الأدوية', icon: BookOpen },
  { to: '/expenses', label: 'المصروفات', icon: Wallet, role: 'pharmacist' },
  { to: '/reports', label: 'التقارير والأرباح', icon: TrendingUp, role: 'manager' },
  { to: '/suppliers', label: 'الموردون', icon: Truck, role: 'pharmacist' },
  { to: '/customers', label: 'العملاء', icon: Users },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon, role: 'manager' },
];

export default function Layout({ children }) {
  const { user, logout, settings, can } = useApp();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setOpen(false); setMenu(false); }, [location.pathname]);

  const items = NAV.filter((n) => !n.role || can(n.role));
  const current = items.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-950">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="rounded-xl bg-brand-600 p-2 text-white"><Pill className="h-6 w-6" /></div>
        <div className="min-w-0">
          <p className="truncate font-extrabold text-white">{settings.pharmacy_name || 'نظام الصيدلية'}</p>
          <p className="text-[11px] font-bold text-ink-400">نظام إدارة الصيدليات</p>
        </div>
        <button className="mr-auto text-ink-400 lg:hidden" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-extrabold text-white">
            {(user?.full_name || '؟').trim().charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-white">{user?.full_name}</p>
            <p className="text-[11px] text-ink-400">{ROLE_LABELS[user?.role]}</p>
          </div>
          <button onClick={logout} title="تسجيل الخروج" className="rounded-lg p-1.5 text-ink-400 transition hover:bg-rose-500/15 hover:text-rose-400">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="hidden w-64 shrink-0 lg:block no-print">
        <div className="fixed inset-y-0 right-0 w-64">{sidebar}</div>
      </aside>

      {/* الشريط الجانبي — الجوال */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-72 shadow-pop animate-fade-in">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* الشريط العلوي */}
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur no-print">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button className="rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="truncate font-extrabold text-ink-900">{current?.label || 'نظام إدارة الصيدليات'}</h2>
              <p className="hidden text-[11px] text-ink-400 sm:block">
                {new Date().toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <div className="mr-auto flex items-center gap-2">
              <button className="btn-primary btn-sm hidden sm:inline-flex" onClick={() => navigate('/pos')}>
                <ShoppingCart className="h-4 w-4" /> بيع جديد
              </button>
              <div className="relative">
                <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 rounded-xl border border-ink-200 px-2.5 py-1.5 text-sm font-bold text-ink-700 transition hover:bg-ink-50">
                  <UserCircle2 className="h-5 w-5 text-ink-400" />
                  <span className="hidden max-w-[120px] truncate sm:block">{user?.full_name?.split(' ')[0]}</span>
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                </button>
                {menu && (
                  <div className="absolute left-0 mt-2 w-52 overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-pop animate-fade-in">
                    <div className="border-b border-ink-100 px-3 py-2">
                      <p className="truncate text-sm font-extrabold">{user?.full_name}</p>
                      <p className="text-[11px] text-ink-400">{ROLE_LABELS[user?.role]} · {user?.username}</p>
                    </div>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-sm font-bold text-ink-600 hover:bg-ink-50" onClick={() => navigate('/settings')}>
                      <SettingsIcon className="h-4 w-4" /> الإعدادات والحساب
                    </button>
                    <button className="flex w-full items-center gap-2 px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50" onClick={logout}>
                      <LogOut className="h-4 w-4" /> تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>

        <footer className="border-t border-ink-100 bg-white px-6 py-3 text-center text-[11px] font-bold text-ink-400 no-print">
          {settings.pharmacy_name || 'نظام إدارة الصيدليات'} · جميع الحقوق محفوظة © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
