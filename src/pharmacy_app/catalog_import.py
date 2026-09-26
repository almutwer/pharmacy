from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .database import Database
from .file_readers import read_tabular_file

CATALOG_FIELDS = [
    "barcode",
    "trade_name",
    "active_ingredient",
    "dosage_form",
    "strength",
    "manufacturer",
    "official_price",
    "category",
    "requires_prescription",
    "is_active",
]

REQUIRED_FIELDS = ["barcode", "trade_name"]


@dataclass(frozen=True)
class ImportValidationError:
    row_number: int
    error_type: str
    error_message: str
    raw_row: dict[str, str]


@dataclass(frozen=True)
class CatalogPreview:
    headers: list[str]
    rows: list[dict[str, str]]
    total_rows: int


@dataclass(frozen=True)
class CatalogImportResult:
    import_job_id: int
    total_rows: int
    valid_rows: int
    inserted_rows: int
    duplicate_rows: int
    missing_required_rows: int
    errors: list[ImportValidationError]


class CatalogImportService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def load_preview(self, file_path: str | Path, limit: int = 20) -> CatalogPreview:
        headers, rows = read_tabular_file(file_path)
        return CatalogPreview(headers=headers, rows=rows[:limit], total_rows=len(rows))

    def validate_rows(
        self,
        rows: list[dict[str, str]],
        column_mapping: dict[str, str],
    ) -> tuple[list[dict[str, Any]], list[ImportValidationError]]:
        """Validate catalog data after the user maps source columns to schema fields.

        mapping format: {"barcode": "Barcode Column", "trade_name": "Name Column", ...}
        """
        errors: list[ImportValidationError] = []
        valid: list[dict[str, Any]] = []
        seen_barcodes: set[str] = set()

        for row_index, row in enumerate(rows, start=2):  # header is row 1
            record: dict[str, Any] = {}
            for target_field, source_column in column_mapping.items():
                if not source_column:
                    continue
                record[target_field] = str(row.get(source_column, "")).strip()

            missing = [field for field in REQUIRED_FIELDS if not str(record.get(field, "")).strip()]
            if missing:
                errors.append(
                    ImportValidationError(
                        row_number=row_index,
                        error_type="missing_required",
                        error_message="حقول مطلوبة ناقصة: " + ", ".join(missing),
                        raw_row=row,
                    )
                )
                continue

            barcode = str(record["barcode"]).strip()
            if barcode in seen_barcodes:
                errors.append(
                    ImportValidationError(
                        row_number=row_index,
                        error_type="duplicate_barcode",
                        error_message=f"باركود مكرر داخل الملف: {barcode}",
                        raw_row=row,
                    )
                )
                continue
            seen_barcodes.add(barcode)

            try:
                record["official_price"] = _parse_nullable_float(record.get("official_price"))
            except ValueError:
                errors.append(
                    ImportValidationError(
                        row_number=row_index,
                        error_type="invalid_price",
                        error_message="السعر الرسمي غير صحيح",
                        raw_row=row,
                    )
                )
                continue
            try:
                record["requires_prescription"] = _parse_bool(record.get("requires_prescription"), default=False)
                record["is_active"] = _parse_bool(record.get("is_active"), default=True)
            except ValueError:
                errors.append(
                    ImportValidationError(
                        row_number=row_index,
                        error_type="invalid_boolean",
                        error_message="قيمة نعم/لا غير صحيحة",
                        raw_row=row,
                    )
                )
                continue

            for field in CATALOG_FIELDS:
                record.setdefault(field, None)
            valid.append(record)
        return valid, errors

    def import_catalog(
        self,
        file_path: str | Path,
        column_mapping: dict[str, str],
        username: str = "admin",
    ) -> CatalogImportResult:
        path = Path(file_path)
        headers, rows = read_tabular_file(path)
        file_type = path.suffix.lower().replace(".", "")
        file_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        valid_records, validation_errors = self.validate_rows(rows, column_mapping)

        missing_required_rows = sum(1 for e in validation_errors if e.error_type == "missing_required")
        duplicate_rows = sum(1 for e in validation_errors if e.error_type == "duplicate_barcode")
        inserted_rows = 0

        with self.db.transaction(username=username, screen="catalog_import") as conn:
            self.db.set_context(
                username=username,
                screen="catalog_import",
                catalog_write_enabled=True,
                catalog_write_reason=f"catalog_import:{path.name}",
                conn=conn,
            )
            cur = conn.execute(
                """
                INSERT INTO catalog_import_jobs (
                    file_name, file_type, file_hash, mapping_json, total_rows, valid_rows,
                    duplicate_rows, missing_required_rows, status, imported_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?)
                """,
                (
                    path.name,
                    file_type,
                    file_hash,
                    json.dumps(column_mapping, ensure_ascii=False),
                    len(rows),
                    len(valid_records),
                    duplicate_rows,
                    missing_required_rows,
                    username,
                ),
            )
            job_id = int(cur.lastrowid)

            for err in validation_errors:
                error_type = {
                    "missing_required": "missing_barcode" if "barcode" in err.error_message else "missing_trade_name",
                    "duplicate_barcode": "duplicate_barcode",
                    "invalid_price": "invalid_price",
                    "invalid_boolean": "invalid_boolean",
                }.get(err.error_type, "unknown_error")
                conn.execute(
                    """
                    INSERT INTO catalog_import_errors (import_job_id, row_number, error_type, error_message, raw_row_json)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (job_id, err.row_number, error_type, err.error_message, json.dumps(err.raw_row, ensure_ascii=False)),
                )

            for record in valid_records:
                try:
                    conn.execute(
                        """
                        INSERT INTO medicines_catalog (
                            barcode, trade_name, active_ingredient, dosage_form, strength,
                            manufacturer, official_price, category, requires_prescription,
                            is_active, source_import_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            record["barcode"],
                            record["trade_name"],
                            record.get("active_ingredient"),
                            record.get("dosage_form"),
                            record.get("strength"),
                            record.get("manufacturer"),
                            record.get("official_price"),
                            record.get("category"),
                            int(record.get("requires_prescription") or 0),
                            int(record.get("is_active") if record.get("is_active") is not None else 1),
                            job_id,
                        ),
                    )
                    inserted_rows += 1
                except Exception as exc:  # duplicate existing barcode or constraint failure
                    duplicate_rows += 1
                    conn.execute(
                        """
                        INSERT INTO catalog_import_errors (import_job_id, row_number, error_type, error_message, raw_row_json)
                        VALUES (?, ?, 'duplicate_barcode', ?, ?)
                        """,
                        (
                            job_id,
                            0,
                            f"لم يتم إدخال الباركود {record['barcode']}: {exc}",
                            json.dumps(record, ensure_ascii=False),
                        ),
                    )

            status = "imported" if inserted_rows > 0 else "failed"
            conn.execute(
                """
                UPDATE catalog_import_jobs
                SET inserted_rows = ?, duplicate_rows = ?, status = ?, finished_at = datetime('now')
                WHERE id = ?
                """,
                (inserted_rows, duplicate_rows, status, job_id),
            )
            self.db.set_context(
                username=username,
                screen="catalog_import",
                catalog_write_enabled=False,
                catalog_write_reason=None,
                conn=conn,
            )

        return CatalogImportResult(
            import_job_id=job_id,
            total_rows=len(rows),
            valid_rows=len(valid_records),
            inserted_rows=inserted_rows,
            duplicate_rows=duplicate_rows,
            missing_required_rows=missing_required_rows,
            errors=validation_errors,
        )

    def search_catalog(self, query: str, limit: int = 50) -> list[dict[str, Any]]:
        q = f"%{query.strip()}%"
        rows = self.db.query_all(
            """
            SELECT * FROM medicines_catalog
            WHERE is_active = 1
              AND (barcode = ? OR trade_name LIKE ? OR active_ingredient LIKE ?)
            ORDER BY CASE WHEN barcode = ? THEN 0 ELSE 1 END, trade_name
            LIMIT ?
            """,
            (query.strip(), q, q, query.strip(), limit),
        )
        return [dict(r) for r in rows]


def _parse_nullable_float(value: Any) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    parsed = float(str(value).strip().replace(",", "."))
    if parsed < 0:
        raise ValueError("negative")
    return parsed


def _parse_bool(value: Any, default: bool = False) -> int:
    if value is None or str(value).strip() == "":
        return 1 if default else 0
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "نعم", "صح", "مطلوب"}:
        return 1
    if normalized in {"0", "false", "no", "n", "لا", "خطأ", "غير مطلوب"}:
        return 0
    raise ValueError(normalized)
