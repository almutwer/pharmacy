/**
 * عميل الاتصال بواجهة الخادم
 */
const TOKEN_KEY = 'pharmacy_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/login')) window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error || 'تعذر تنفيذ الطلب', res.status, data?.details);
  return data;
}

const qs = (params = {}) => {
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return clean.length ? `?${new URLSearchParams(clean)}` : '';
};

/** تنزيل ملف (Excel / JSON) مع إرفاق رمز الدخول */
export async function downloadFile(path, filename, params) {
  const res = await fetch(`/api${path}${qs(params)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    let message = 'تعذر تنزيل الملف';
    try { message = (await res.json())?.error || message; } catch { /* ملف غير نصي */ }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** قراءة ملف من جهاز المستخدم كسلسلة base64 */
export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
  reader.readAsDataURL(file);
});

/** قراءة ملف JSON من جهاز المستخدم */
export const readJsonFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    try { resolve(JSON.parse(String(reader.result))); } catch { reject(new Error('الملف ليس بصيغة JSON صالحة')); }
  };
  reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
  reader.readAsText(file);
});

export const api = {
  get: (path, params) => request('GET', `${path}${qs(params)}`),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path),
};

export default api;
