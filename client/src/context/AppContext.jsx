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
  const [license, setLicense] = useState(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data || {});
    } catch { /* تجاهل */ }
  }, []);

  const checkLicense = useCallback(async () => {
    try {
      const res = await api.get('/license/status');
      setLicense(res);
      return res;
    } catch {
      setLicense(null);
      return null;
    }
  }, []);

  const bootstrap = useCallback(async () => {
    const lic = await checkLicense();
    if (lic && lic.enforced && !lic.active) { setBooting(false); return; }
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
  }, [loadSettings, checkLicense]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const onExpired = () => setUser(null);
    const onLicense = () => { checkLicense(); setUser(null); };
    window.addEventListener('auth:expired', onExpired);
    window.addEventListener('license:required', onLicense);
    return () => {
      window.removeEventListener('auth:expired', onExpired);
      window.removeEventListener('license:required', onLicense);
    };
  }, [checkLicense]);

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
    license,
    licenseBlocked: !!(license && license.enforced && !license.active),
    recheckLicense: checkLicense,
    settings,
    currency: settings.currency || 'ر.س',
    booting,
    login,
    logout,
    reloadSettings: loadSettings,
    setSettings,
    can: (minRole) => !!user && ROLE_RANK[user.role] >= ROLE_RANK[minRole],
  }), [user, license, settings, booting, loadSettings, checkLicense]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
