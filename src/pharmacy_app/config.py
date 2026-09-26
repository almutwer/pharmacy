from __future__ import annotations

import os
from pathlib import Path

APP_FOLDER_NAME = "LocalPharmacy"


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resource_path(*parts: str) -> Path:
    return project_root().joinpath(*parts)


def user_data_dir() -> Path:
    override = os.environ.get("PHARMACY_DATA_DIR")
    if override:
        path = Path(override).expanduser()
    elif os.name == "nt":
        base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or str(Path.home())
        path = Path(base) / APP_FOLDER_NAME
    else:
        path = Path.home() / ".local" / "share" / APP_FOLDER_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def database_path() -> Path:
    override = os.environ.get("PHARMACY_DB_PATH")
    if override:
        path = Path(override).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    return user_data_dir() / "pharmacy.db"


def backup_dir() -> Path:
    override = os.environ.get("PHARMACY_BACKUP_DIR")
    path = Path(override).expanduser() if override else user_data_dir() / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def receipt_dir() -> Path:
    path = user_data_dir() / "receipts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def schema_sql_path() -> Path:
    return resource_path("db", "schema.sql")


def sample_sql_path() -> Path:
    return resource_path("db", "sample_data.sql")
