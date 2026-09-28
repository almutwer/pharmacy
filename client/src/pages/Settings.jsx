import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings as SettingsIcon, Save, Users, Plus, Pencil, Trash2, Activity, Download,
  Building2, KeyRound, ShieldCheck,
} from 'lucide-react';
import api, { getToken } from '../api.js';
import { useApp } from '../context/AppContext.jsx';
import {
  PageHeader, Card, CardHeader, Tabs, Field, Input, Select, Table, Badge, Modal,
  useToast, ConfirmDialog, Loading, EmptyState,
} from '../components/ui.jsx';
import { fmtDateTime, ROLE_LABELS } from '../lib/format.js';

export default function Settings() {
  const [tab, setTab] = useState('general');
  const { can } = useApp();

  return (
    <div>
      <PageHeader title="الإعدادات" subtitle="بيانات الصيدلية، المستخدمون، الأمان والنسخ الاحتياطي" icon={SettingsIcon} />
      <Tabs
        value={tab} onChange={setTab}
        tabs={[
          { value: 'general', label: 'بيانات الصيدلية', icon: Building2 },
          ...(can('admin') ? [{ value: 'users', label: 'المستخدمون', icon: Users }] : []),
          { value: 'security', label: 'الحساب والأمان', icon: KeyRound },
          { value: 'activity', label: 'سجل النشاط', icon: Activity },
        ]}
      />
      {tab === 'general' && <GeneralSettings />}
      {tab === 'users' && <UsersSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'activity' && <ActivityLog />}
    </div>
  );
}

/* ================== بيانات الصيدلية ================== */
function GeneralSettings() {
  const { settings, reloadSettings } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/settings', form);
      await reloadSettings();
      toast.success('تم حفظ الإعدادات');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const backup = async () => {
    try {
      const res = await fetch('/api/settings/backup', { headers: { Authorization: `Bearer ${getToken()}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pharmacy-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل النسخة الاحتياطية');
    } catch { toast.error('تعذر إنشاء النسخة الاحتياطية'); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="بيانات الصيدلية" subtitle="تظهر في الفواتير والتقارير" icon={Building2} />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <Field label="اسم الصيدلية" className="sm:col-span-2"><Input value={form.pharmacy_name || ''} onChange={set('pharmacy_name')} /></Field>
          <Field label="رقم الهاتف"><Input value={form.pharmacy_phone || ''} onChange={set('pharmacy_phone')} /></Field>
          <Field label="البريد الإلكتروني"><Input value={form.pharmacy_email || ''} onChange={set('pharmacy_email')} /></Field>
          <Field label="العنوان" className="sm:col-span-2"><Input value={form.pharmacy_address || ''} onChange={set('pharmacy_address')} /></Field>
          <Field label="الرقم الضريبي"><Input value={form.tax_number || ''} onChange={set('tax_number')} /></Field>
          <Field label="رمز العملة"><Input value={form.currency || ''} onChange={set('currency')} placeholder="ر.س / ر.ي / ج.م" /></Field>
          <Field label="تذييل الفاتورة" className="sm:col-span-2"><Input value={form.invoice_footer || ''} onChange={set('invoice_footer')} /></Field>
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="إعدادات التشغيل" subtitle="الضريبة والتنبيهات" icon={SettingsIcon} />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="نسبة الضريبة %" hint="0 لتعطيل الضريبة"><Input type="number" step="0.01" value={form.tax_rate || '0'} onChange={set('tax_rate')} /></Field>
            <Field label="حد المخزون المنخفض" hint="يُستخدم عند عدم تحديد حد للصنف"><Input type="number" value={form.low_stock_level || '10'} onChange={set('low_stock_level')} /></Field>
            <Field label="تنبيه الصلاحية (يوم)"><Input type="number" value={form.expiry_alert_days || '90'} onChange={set('expiry_alert_days')} /></Field>
            <Field label="السماح بالبيع بالسالب">
              <Select value={form.allow_negative_stock || '0'} onChange={set('allow_negative_stock')}>
                <option value="0">لا (موصى به)</option><option value="1">نعم</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3.5">
            <button className="btn-primary" onClick={save} disabled={busy}><Save className="h-4 w-4" /> حفظ الإعدادات</button>
          </div>
        </Card>

        <Card>
          <CardHeader title="النسخ الاحتياطي" subtitle="تنزيل نسخة كاملة من البيانات بصيغة JSON" icon={Download} />
          <div className="flex items-center justify-between p-5">
            <p className="text-sm text-ink-500">يُنصح بأخذ نسخة احتياطية دورية وحفظها خارج الجهاز.</p>
            <button className="btn-outline" onClick={backup}><Download className="h-4 w-4" /> تنزيل نسخة</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================== المستخدمون ================== */
function UsersSettings() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api.get('/users')).data); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (form.id) { await api.put(`/users/${form.id}`, form); toast.success('تم تحديث المستخدم'); }
      else { await api.post('/users', form); toast.success('تمت إضافة المستخدم'); }
      setForm(null); load();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async () => {
    try { const r = await api.del(`/users/${deleteId}`); toast.success(r.message || 'تم الحذف'); setDeleteId(null); load(); }
    catch (err) { toast.error(err.message); setDeleteId(null); }
  };

  return (
    <Card>
      <CardHeader
        title="مستخدمو النظام" subtitle="إدارة الحسابات والصلاحيات" icon={Users}
        action={<button className="btn-primary btn-sm" onClick={() => setForm({ username: '', full_name: '', password: '', role: 'cashier', phone: '', active: 1 })}>
          <Plus className="h-4 w-4" /> مستخدم جديد
        </button>}
      />
      <Table
        loading={loading}
        columns={['المستخدم', 'الاسم', 'الصلاحية', 'الجوال', 'آخر دخول', 'الحالة', '']}
        rows={rows}
        renderRow={(u) => (
          <tr key={u.id}>
            <td className="font-extrabold">{u.username}</td>
            <td>{u.full_name}</td>
            <td><Badge tone={u.role === 'admin' ? 'red' : u.role === 'manager' ? 'violet' : 'brand'}>{ROLE_LABELS[u.role]}</Badge></td>
            <td className="num text-ink-500">{u.phone || '—'}</td>
            <td className="text-xs text-ink-400">{u.last_login ? fmtDateTime(u.last_login) : 'لم يسجل بعد'}</td>
            <td>{u.active ? <Badge tone="green">نشط</Badge> : <Badge tone="gray">موقوف</Badge>}</td>
            <td>
              <div className="flex gap-1">
                <button className="btn-outline btn-sm" onClick={() => setForm({ ...u, password: '' })}><Pencil className="h-3.5 w-3.5" /></button>
                <button className="btn-outline btn-sm text-rose-600" onClick={() => setDeleteId(u.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </td>
          </tr>
        )}
      />

      <Modal
        open={!!form} onClose={() => setForm(null)} size="sm"
        title={form?.id ? `تعديل: ${form.username}` : 'إضافة مستخدم'}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>إلغاء</button>
          <button className="btn-primary" onClick={save}>حفظ</button></>}
      >
        {form && (
          <div className="space-y-3">
            <Field label="اسم المستخدم" required><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="الاسم الكامل" required><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label={form.id ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'} required={!form.id}>
              <Input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="الصلاحية" required>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="رقم الجوال"><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="الحالة">
              <Select value={form.active} onChange={(e) => setForm({ ...form, active: Number(e.target.value) })}>
                <option value={1}>نشط</option><option value={0}>موقوف</option>
              </Select>
            </Field>
            <div className="rounded-xl bg-ink-50 p-3 text-[11px] leading-6 text-ink-500">
              <p className="font-extrabold text-ink-700"><ShieldCheck className="ml-1 inline h-3.5 w-3.5" /> صلاحيات الأدوار:</p>
              <p>• كاشير: البيع والمرتجعات وعرض المخزون والعملاء.</p>
              <p>• صيدلي: إضافة الأصناف والأدوية والمشتريات والمصروفات.</p>
              <p>• مدير الصيدلية: كل ما سبق + التقارير والحذف والإعدادات.</p>
              <p>• مدير النظام: صلاحيات كاملة + إدارة المستخدمين.</p>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={remove} danger
        title="حذف المستخدم" confirmLabel="حذف"
        message="سيتم حذف المستخدم نهائياً إن لم تكن له عمليات مسجلة، وإلا سيتم إيقافه."
      />
    </Card>
  );
}

/* ================== الأمان ================== */
function SecuritySettings() {
  const { user } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: form.current_password, new_password: form.new_password });
      toast.success('تم تغيير كلمة المرور');
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="بيانات الحساب" icon={Users} />
        <div className="space-y-3 p-5 text-sm">
          <Row label="الاسم" value={user.full_name} />
          <Row label="اسم المستخدم" value={user.username} />
          <Row label="الصلاحية" value={ROLE_LABELS[user.role]} />
        </div>
      </Card>
      <Card>
        <CardHeader title="تغيير كلمة المرور" icon={KeyRound} />
        <form onSubmit={submit} className="space-y-3 p-5">
          <Field label="كلمة المرور الحالية" required>
            <Input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
          </Field>
          <Field label="كلمة المرور الجديدة" required>
            <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
          </Field>
          <Field label="تأكيد كلمة المرور" required>
            <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={busy}><Save className="h-4 w-4" /> حفظ كلمة المرور</button>
        </form>
      </Card>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between border-b border-dashed border-ink-100 pb-2">
    <span className="text-ink-500">{label}</span>
    <span className="font-extrabold text-ink-800">{value}</span>
  </div>
);

/* ================== سجل النشاط ================== */
function ActivityLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/settings/activity', { limit: 200 }).then((r) => setRows(r.data)).finally(() => setLoading(false)); }, []);

  const ACTIONS = {
    login: 'تسجيل دخول', create: 'إنشاء', update: 'تعديل', delete: 'حذف', cancel: 'إلغاء',
    return: 'مرتجع', adjust: 'تسوية', payment: 'دفعة', import: 'استيراد', dispose: 'إتلاف',
    change_password: 'تغيير كلمة مرور',
  };

  if (loading) return <Loading />;

  return (
    <Card>
      <CardHeader title="سجل النشاط" subtitle="آخر 200 عملية في النظام" icon={Activity} />
      <Table
        columns={['التاريخ', 'المستخدم', 'العملية', 'الجهة', 'التفاصيل']}
        rows={rows}
        empty={<EmptyState title="لا يوجد نشاط مسجل" icon={Activity} />}
        renderRow={(a) => (
          <tr key={a.id}>
            <td className="text-xs text-ink-500">{fmtDateTime(a.created_at)}</td>
            <td className="font-bold">{a.user_name || '—'}</td>
            <td><Badge tone="brand">{ACTIONS[a.action] || a.action}</Badge></td>
            <td className="text-xs text-ink-400">{a.entity || '—'}{a.entity_id ? `#${a.entity_id}` : ''}</td>
            <td className="max-w-[320px] truncate text-xs text-ink-500">{a.details || '—'}</td>
          </tr>
        )}
      />
    </Card>
  );
}
