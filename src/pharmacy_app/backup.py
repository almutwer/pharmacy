from __future__ import annotations

import hashlib
import shutil
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .config import backup_dir
from .database import Database


class BackupService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create_backup(self, backup_type: str = "manual", destination_dir: str | Path | None = None, username: str = "admin") -> Path:
        if backup_type not in {"auto", "manual", "usb", "cloud", "restore"}:
            raise ValueError("نوع النسخة الاحتياطية غير صحيح")
        dest_dir = Path(destination_dir) if destination_dir else backup_dir()
        dest_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        dest_path = dest_dir / f"pharmacy_{stamp}.db"

        source = sqlite3.connect(str(self.db.path))
        try:
            target = sqlite3.connect(str(dest_path))
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()

        checksum = _sha256_file(dest_path)
        size = dest_path.stat().st_size
        with self.db.transaction(username=username, screen="backup") as conn:
            conn.execute(
                """
                INSERT INTO backup_history (
                    backup_type, backup_file_name, backup_path, database_size_bytes,
                    checksum, status, created_by
                ) VALUES (?, ?, ?, ?, ?, 'success', ?)
                """,
                (backup_type, dest_path.name, str(dest_path), size, checksum, username),
            )
        return dest_path

    def copy_latest_to_usb(self, usb_path: str | Path, username: str = "admin") -> Path:
        backups = self.list_backups()
        if not backups:
            latest = self.create_backup("manual", username=username)
        else:
            latest = Path(backups[0]["backup_path"])
        destination = Path(usb_path)
        destination.mkdir(parents=True, exist_ok=True)
        copied = destination / latest.name
        shutil.copy2(latest, copied)
        with self.db.transaction(username=username, screen="usb_backup") as conn:
            conn.execute(
                """
                INSERT INTO backup_history (backup_type, backup_file_name, backup_path, database_size_bytes, checksum, status, created_by)
                VALUES ('usb', ?, ?, ?, ?, 'success', ?)
                """,
                (copied.name, str(copied), copied.stat().st_size, _sha256_file(copied), username),
            )
        return copied

    def list_backups(self) -> list[dict[str, Any]]:
        rows = self.db.query_all(
            "SELECT * FROM backup_history WHERE status = 'success' AND is_active = 1 ORDER BY backup_date DESC"
        )
        return [dict(r) for r in rows]

    def days_since_last_backup(self) -> int | None:
        row = self.db.query_one(
            "SELECT backup_date FROM backup_history WHERE status='success' AND backup_type IN ('auto','manual','usb') ORDER BY backup_date DESC LIMIT 1"
        )
        if not row:
            return None
        try:
            last = datetime.strptime(row["backup_date"], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            last = datetime.fromisoformat(row["backup_date"])
        return (datetime.now() - last).days

    def needs_backup_warning(self, warning_days: int = 3) -> bool:
        days = self.days_since_last_backup()
        return days is None or days >= warning_days

    def restore_backup(self, backup_path: str | Path, username: str = "admin") -> None:
        """Restore selected DB file.

        The GUI should call this only after confirming the app will restart.
        """
        source = Path(backup_path)
        if not source.exists():
            raise FileNotFoundError(source)
        self.create_backup("restore", username=username)
        shutil.copy2(source, self.db.path)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
