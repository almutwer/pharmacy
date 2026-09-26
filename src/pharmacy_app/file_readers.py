from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


class FileReadError(RuntimeError):
    pass


def _normalize_cell(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def read_tabular_file(path: str | Path) -> tuple[list[str], list[dict[str, str]]]:
    """Read CSV, JSON, XLSX, or XLS as a list of dict rows.

    The first row in spreadsheets/CSV is treated as column headers.  JSON must be
    a list of objects or an object with a top-level "rows" list.
    """
    file_path = Path(path)
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return read_csv(file_path)
    if suffix == ".json":
        return read_json(file_path)
    if suffix == ".xlsx":
        return read_xlsx(file_path)
    if suffix == ".xls":
        return read_xls(file_path)
    raise FileReadError("صيغة الملف غير مدعومة. استخدم CSV أو Excel أو JSON.")


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        headers = [h.strip() for h in (reader.fieldnames or []) if h]
        rows = [{h: _normalize_cell(row.get(h)) for h in headers} for row in reader]
    return headers, rows


def read_json(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict):
        rows_raw = payload.get("rows") or payload.get("data") or []
    else:
        rows_raw = payload
    if not isinstance(rows_raw, list):
        raise FileReadError("ملف JSON يجب أن يحتوي على قائمة بيانات.")
    headers: list[str] = []
    for row in rows_raw:
        if isinstance(row, dict):
            for key in row.keys():
                if key not in headers:
                    headers.append(str(key))
    rows = [{h: _normalize_cell(row.get(h)) if isinstance(row, dict) else "" for h in headers} for row in rows_raw]
    return headers, rows


def read_xlsx(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    try:
        import openpyxl  # type: ignore
    except ImportError as exc:
        raise FileReadError("قراءة Excel تحتاج تثبيت openpyxl: pip install openpyxl") from exc
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return [], []
    headers = [_normalize_cell(cell) or f"Column {idx + 1}" for idx, cell in enumerate(header_row)]
    rows: list[dict[str, str]] = []
    for raw in rows_iter:
        rows.append({headers[idx]: _normalize_cell(raw[idx]) if idx < len(raw) else "" for idx in range(len(headers))})
    return headers, rows


def read_xls(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    try:
        import xlrd  # type: ignore
    except ImportError as exc:
        raise FileReadError("قراءة ملفات .xls تحتاج تثبيت xlrd: pip install xlrd") from exc
    book = xlrd.open_workbook(str(path))
    sheet = book.sheet_by_index(0)
    if sheet.nrows == 0:
        return [], []
    headers = [_normalize_cell(sheet.cell_value(0, col)) or f"Column {col + 1}" for col in range(sheet.ncols)]
    rows: list[dict[str, str]] = []
    for r in range(1, sheet.nrows):
        rows.append({headers[c]: _normalize_cell(sheet.cell_value(r, c)) for c in range(sheet.ncols)})
    return headers, rows
