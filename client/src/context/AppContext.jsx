/** سياق التطبيق: المستخدم الحالي + الإعدادات */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { getToken, setToken } from '../api.js';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const ROLE_RANK = { cashier: 1, pharmacist: 2, manager: 3, admin: 4 };

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({});
  const [booting, setBooting] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data || {});
    } catch { /* تجاهل */ }
  }, []);

  const bootstrap = useCallback(async () => {
    if (!getToken()) { setBooting(false); return; }
    try {
      const res = await api.get('/auth/me');
      setUser(res.user);
      await loadSettings();
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setBooting(false);
    }
  }, [loadSettings]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setToken(res.token);
    setUser(res.user);
    await loadSettings();
    return res.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    settings,
    currency: settings.currency || 'ر.س',
    booting,
    login,
    logout,
    reloadSettings: loadSettings,
    setSettings,
    can: (minRole) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[minRole],
  }), [user, settings, booting, loadSettings]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
