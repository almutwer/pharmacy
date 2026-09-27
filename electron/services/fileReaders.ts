import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { FilePreview } from '../types';

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export function readTabularFile(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return readJson(filePath);
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return readSpreadsheet(filePath);
  throw new Error('صيغة الملف غير مدعومة. استخدم Excel أو CSV أو JSON.');
}

function readSpreadsheet(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = (matrix[0] || []).map((cell, index) => normalizeCell(cell) || `Column ${index + 1}`);
  const rows = matrix.slice(1).map((line) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = normalizeCell(line[index]);
    });
    return row;
  });
  return { headers, rows };
}

function readJson(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  const rawRows: unknown[] = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && Array.isArray((payload as any).rows)
      ? (payload as any).rows
      : typeof payload === 'object' && payload !== null && Array.isArray((payload as any).data)
        ? (payload as any).data
        : [];
  const headers: string[] = [];
  for (const row of rawRows) {
    if (row && typeof row === 'object') {
      Object.keys(row as Record<string, unknown>).forEach((key) => {
        if (!headers.includes(key)) headers.push(key);
      });
    }
  }
  const rows = rawRows.map((row) => {
    const object = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const normalized: Record<string, string> = {};
    headers.forEach((header) => {
      normalized[header] = normalizeCell(object[header]);
    });
    return normalized;
  });
  return { headers, rows };
}

export function createPreview(filePath: string, limit = 20): FilePreview {
  const { headers, rows } = readTabularFile(filePath);
  return {
    filePath,
    fileName: path.basename(filePath),
    headers,
    rows: rows.slice(0, limit),
    totalRows: rows.length,
  };
}

export function sha256File(filePath: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}
