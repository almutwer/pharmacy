/**
 * طبقة التعامل مع ملفات Excel (تصدير / استيراد)
 * تعتمد على مكتبة exceljs وتنتج ملفات .xlsx بتنسيق عربي (RTL) جاهز للطباعة
 */
import ExcelJS from 'exceljs';
import { HttpError } from './helpers.js';

const BRAND = 'FF0F766E';      // أخضر النظام
const BRAND_LIGHT = 'FFE6F4F1';
const GRAY = 'FFF1F5F9';

/** أنواع الأعمدة المدعومة */
const FORMATS = {
  money: '#,##0.00',
  int: '#,##0',
  number: '#,##0.##',
  date: 'yyyy-mm-dd',
  text: '@',
};

/** تطبيع نص العنوان للمقارنة عند الاستيراد */
function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/[\u064B-\u065F\u0670]/g, '')   // حذف التشكيل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[_*():.\-#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** تحويل قيمة خلية إلى قيمة بسيطة */
function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if (v.text !== undefined) return v.text;                 // hyperlink / rich text
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result !== undefined) return v.result;             // formula
    if (v.error) return null;
  }
  return v;
}

/** تحويل قيمة إلى النوع المطلوب */
function coerce(value, col) {
  if (value === null || value === undefined || value === '') {
    return col.type === 'number' || col.type === 'money' || col.type === 'int' ? null : null;
  }
  switch (col.type) {
    case 'int':
    case 'number':
    case 'money': {
      const n = Number(String(value).replace(/[^\d.\-]/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'bool': {
      const s = String(value).trim().toLowerCase();
      if (['نعم', 'yes', 'true', '1', 'نشط', 'مفعل', 'y'].includes(s)) return 1;
      if (['لا', 'no', 'false', '0', 'موقوف', 'معطل', 'n'].includes(s)) return 0;
      return null;
    }
    case 'date': {
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      const s = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [d, m, y] = s.split('/');
        return `${y}-${m}-${d}`;
      }
      const parsed = new Date(s);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    }
    default:
      return String(value).trim();
  }
}

/**
 * إنشاء ورقة عمل منسّقة
 * columns: [{ key, header, width, type, hint, readOnly }]
 */
export function addSheet(workbook, { name, columns, rows = [], title, note }) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: title ? 3 : 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  let headerRowIndex = 1;

  if (title) {
    const titleRow = sheet.addRow([title]);
    titleRow.height = 26;
    titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: BRAND } };
    titleRow.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.mergeCells(1, 1, 1, columns.length);
    const infoRow = sheet.addRow([note || `تم التصدير في ${new Date().toLocaleString('ar-EG')} — عدد السجلات: ${rows.length}`]);
    infoRow.font = { name: 'Arial', size: 10, color: { argb: 'FF64748B' } };
    infoRow.alignment = { horizontal: 'right' };
    sheet.mergeCells(2, 1, 2, columns.length);
    headerRowIndex = 3;
  }

  const header = sheet.addRow(columns.map((c) => c.header));
  header.height = 22;
  header.eachCell((cell, i) => {
    const col = columns[i - 1];
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.readOnly ? 'FF64748B' : BRAND } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    if (col.hint) cell.note = col.hint;
  });

  columns.forEach((col, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = col.width || 18;
    column.alignment = {
      horizontal: col.type && col.type !== 'text' ? 'center' : 'right',
      vertical: 'middle',
    };
    if (FORMATS[col.type]) column.numFmt = FORMATS[col.type];
  });

  rows.forEach((row, idx) => {
    const line = sheet.addRow(columns.map((c) => {
      const v = row[c.key];
      if (c.type === 'bool') return v ? 'نعم' : 'لا';
      if (v === null || v === undefined) return null;
      return v;
    }));
    line.font = { name: 'Arial', size: 11 };
    if (idx % 2 === 1) {
      line.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } };
      });
    }
  });

  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: columns.length },
  };

  return sheet;
}

/** ورقة تعليمات الاستخدام (تُضاف لقوالب الاستيراد) */
export function addGuideSheet(workbook, { columns, title, lines = [] }) {
  const sheet = workbook.addWorksheet('التعليمات', { views: [{ rightToLeft: true }] });
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 70;

  const t = sheet.addRow([title]);
  t.font = { name: 'Arial', size: 14, bold: true, color: { argb: BRAND } };
  sheet.mergeCells(1, 1, 1, 3);
  sheet.addRow([]);

  lines.forEach((line) => {
    const r = sheet.addRow([line]);
    r.font = { name: 'Arial', size: 11, color: { argb: 'FF334155' } };
    sheet.mergeCells(r.number, 1, r.number, 3);
  });
  sheet.addRow([]);

  const head = sheet.addRow(['العمود', 'إلزامي؟', 'الشرح']);
  head.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { horizontal: 'center' };
  });

  columns.forEach((col) => {
    const r = sheet.addRow([col.header, col.required ? 'نعم' : 'لا', col.hint || '—']);
    r.font = { name: 'Arial', size: 11 };
    r.alignment = { horizontal: 'right', wrapText: true };
    if (col.readOnly) {
      r.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } }; });
    }
  });
  return sheet;
}

export function createWorkbook(creator = 'نظام إدارة الصيدليات') {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();
  wb.views = [{ x: 0, y: 0, width: 20000, height: 20000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  return wb;
}

/** إرسال المصنّف كملف للتنزيل */
export async function sendWorkbook(res, workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  // اسم الملف العربي يُرسل مُرمّزاً (RFC 5987) مع بديل لاتيني للمتصفحات القديمة
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'export.xlsx';
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Length', buffer.byteLength);
  res.end(Buffer.from(buffer));
}

/** تحويل محتوى base64 قادم من الواجهة إلى Buffer */
export function decodeUpload(file) {
  if (!file || typeof file !== 'string') throw new HttpError(400, 'لم يتم إرسال أي ملف');
  const base64 = file.includes(',') ? file.slice(file.indexOf(',') + 1) : file;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) throw new HttpError(400, 'الملف فارغ أو تالف');
  if (buffer.length > 15 * 1024 * 1024) throw new HttpError(413, 'حجم الملف يتجاوز 15 ميجابايت');
  return buffer;
}

/** تقسيم سطر CSV مع دعم علامات الاقتباس */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
    } else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * قراءة ملف Excel أو CSV وتحويله إلى صفوف مطابقة لتعريف الأعمدة
 * يعيد: { rows: [{ __row, ...values }], headers, matched, unknown }
 */
export async function readSheetRows(buffer, columns, filename = '') {
  const aliasMap = new Map();
  columns.forEach((col) => {
    [col.header, col.key, ...(col.aliases || [])].forEach((a) => {
      if (a) aliasMap.set(normalizeHeader(a), col);
    });
  });

  let matrix = [];

  if (/\.csv$/i.test(filename)) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    matrix = text.split(/\r?\n/).filter((l) => l.trim()).map(splitCsvLine);
  } else {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer);
    } catch {
      throw new HttpError(400, 'تعذر قراءة الملف — تأكد أنه بصيغة Excel ‏(.xlsx) أو CSV');
    }
    const sheet = wb.worksheets.find((s) => s.name !== 'التعليمات' && s.actualRowCount > 0) || wb.worksheets[0];
    if (!sheet) throw new HttpError(400, 'الملف لا يحتوي على أي ورقة عمل');
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => { values[colNumber - 1] = cellValue(cell); });
      matrix.push(values);
    });
  }

  if (!matrix.length) throw new HttpError(400, 'الملف لا يحتوي على بيانات');

  // إيجاد صف العناوين: أول صف تتطابق فيه خليتان على الأقل مع الأعمدة المعروفة
  let headerIndex = -1;
  for (let i = 0; i < Math.min(matrix.length, 10); i += 1) {
    const hits = matrix[i].filter((c) => aliasMap.has(normalizeHeader(c))).length;
    if (hits >= 2) { headerIndex = i; break; }
  }
  if (headerIndex === -1) {
    throw new HttpError(
      400,
      'تعذر التعرف على صف العناوين في الملف. نزّل القالب الجاهز واستخدم نفس أسماء الأعمدة.',
    );
  }

  const headerCells = matrix[headerIndex];
  const mapping = [];
  const unknown = [];
  headerCells.forEach((cell, i) => {
    const col = aliasMap.get(normalizeHeader(cell));
    if (col) mapping.push({ index: i, col });
    else if (String(cell ?? '').trim()) unknown.push(String(cell).trim());
  });

  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const raw = matrix[i];
    if (!raw || raw.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const item = { __row: i + 1 };
    mapping.forEach(({ index, col }) => { item[col.key] = coerce(raw[index], col); });
    rows.push(item);
  }

  return {
    rows,
    headers: headerCells.filter(Boolean).map(String),
    matched: mapping.map((m) => m.col.header),
    unknown,
  };
}

export default { createWorkbook, addSheet, addGuideSheet, sendWorkbook, readSheetRows, decodeUpload };
