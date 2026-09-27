import { useEffect, useState } from 'react';
import POSPage from './pages/POSPage';
import InventoryPage from './pages/InventoryPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

type Page = 'pos' | 'inventory' | 'reports' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('pos');
  const [backupWarning, setBackupWarning] = useState(false);
  const hasPharmacyApi = typeof window !== 'undefined' && Boolean(window.pharmacy);

  useEffect(() => {
    if (!hasPharmacyApi) return;
    window.pharmacy.backup.needsWarning().then(setBackupWarning).catch(() => setBackupWarning(false));
  }, [hasPharmacyApi]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F2') {
        setPage('pos');
        setTimeout(() => document.getElementById('pos-search')?.focus(), 50);
      }
      if (event.key === 'F5') window.dispatchEvent(new CustomEvent('pos:new-invoice'));
      if (event.key === 'F8') window.dispatchEvent(new CustomEvent('pos:focus-discount'));
      if (event.key === 'F12') window.dispatchEvent(new CustomEvent('pos:complete-sale'));
      if (event.key === 'Escape') window.dispatchEvent(new CustomEvent('pos:cancel-invoice'));
      if (event.key === 'Delete') window.dispatchEvent(new CustomEvent('pos:delete-selected'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!hasPharmacyApi) {
    return (
      <main className="app-shell">
        <section className="page-card browser-warning">
          <h1>⚠️ تم فتح الواجهة من المتصفح فقط</h1>
          <p>
            هذا النظام تطبيق سطح مكتب بواسطة Electron، وليس موقع ويب عادي على الشبكة المحلية.
            رابط Vite مثل <code>http://localhost:5173</code> أو رابط <code>Network</code> يعرض الواجهة فقط بدون قاعدة البيانات.
          </p>
          <p>لذلك قد تظهر شاشة بيضاء أو لا تعمل الأزرار إذا فتحته من المتصفح.</p>
          <h2>طريقة التشغيل الصحيحة على Windows</h2>
          <ol>
            <li>افتح CMD داخل مجلد المشروع.</li>
            <li>نفذ: <code>npm install</code></li>
            <li>نفذ: <code>npm run dev</code></li>
            <li>انتظر نافذة Electron التي تفتح تلقائياً، واستخدمها هي فقط.</li>
          </ol>
          <p className="note">
            إذا كنت تريد نسخة تعمل من متصفح أي جهاز داخل الشبكة المحلية، فهذا يحتاج تحويل معماري إلى Server محلي + Web Client، وليس Electron فقط.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {backupWarning && <div className="backup-warning">⚠️ لم يتم إنشاء نسخة احتياطية خلال آخر 3 أيام. الرجاء عمل نسخة احتياطية من الإعدادات.</div>}

      <nav className="main-nav" aria-label="التنقل الرئيسي">
        <button className={page === 'pos' ? 'active' : ''} onClick={() => setPage('pos')}>💊 نقطة البيع</button>
        <button className={page === 'inventory' ? 'active' : ''} onClick={() => setPage('inventory')}>📦 المخزون</button>
        <button className={page === 'reports' ? 'active' : ''} onClick={() => setPage('reports')}>📊 التقارير</button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>⚙️ الإعدادات</button>
      </nav>

      <section className="page-card">
        {page === 'pos' && <POSPage />}
        {page === 'inventory' && <InventoryPage />}
        {page === 'reports' && <ReportsPage />}
        {page === 'settings' && <SettingsPage onBackupCreated={() => setBackupWarning(false)} />}
      </section>
    </main>
  );
}
