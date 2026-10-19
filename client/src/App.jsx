import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './context/AppContext.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import POS from './pages/POS.jsx';
import Sales from './pages/Sales.jsx';
import Purchases from './pages/Purchases.jsx';
import Inventory from './pages/Inventory.jsx';
import Catalog from './pages/Catalog.jsx';
import Expenses from './pages/Expenses.jsx';
import Reports from './pages/Reports.jsx';
import { Suppliers, Customers } from './pages/Parties.jsx';
import Settings from './pages/Settings.jsx';

function Guard({ role, children }) {
  const { can } = useApp();
  if (role && !can(role)) {
    return (
      <div className="card p-10 text-center">
        <p className="text-lg font-extrabold text-ink-800">لا تملك صلاحية الوصول لهذه الصفحة</p>
        <p className="mt-1 text-sm text-ink-400">يرجى مراجعة مدير النظام لمنحك الصلاحية المناسبة</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, booting } = useApp();

  if (booting) {
    return <div className="grid min-h-screen place-items-center bg-ink-50"><Loading label="جاري تهيئة النظام..." /></div>;
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/purchases" element={<Guard role="pharmacist"><Purchases /></Guard>} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/expenses" element={<Guard role="pharmacist"><Expenses /></Guard>} />
        <Route path="/reports" element={<Guard role="manager"><Reports /></Guard>} />
        <Route path="/suppliers" element={<Guard role="pharmacist"><Suppliers /></Guard>} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/settings" element={<Guard role="manager"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
