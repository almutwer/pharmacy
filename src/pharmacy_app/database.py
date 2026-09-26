from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator

from .config import database_path, sample_sql_path, schema_sql_path


class DatabaseError(RuntimeError):
    pass


class Database:
    """Small SQLite helper used by all application services.

    SQLite is intentionally the only required database engine.  Core operations are
    local, ACID, and wrapped in explicit transactions for sales.
    """

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else database_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(schema_sql_path().read_text(encoding="utf-8"))

    def load_sample_data(self) -> None:
        with self.connect() as conn:
            conn.executescript(sample_sql_path().read_text(encoding="utf-8"))

    def set_context(
        self,
        username: str = "system",
        screen: str | None = None,
        catalog_write_enabled: bool | None = None,
        catalog_write_reason: str | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> None:
        owns_conn = conn is None
        if owns_conn:
            conn = self.connect()
        assert conn is not None
        try:
            if catalog_write_enabled is None:
                conn.execute(
                    """
                    UPDATE app_context
                    SET current_username = ?, current_screen = ?, updated_at = datetime('now')
                    WHERE id = 1
                    """,
                    (username, screen),
                )
            else:
                conn.execute(
                    """
                    UPDATE app_context
                    SET current_username = ?, current_screen = ?,
                        catalog_write_enabled = ?, catalog_write_reason = ?,
                        updated_at = datetime('now')
                    WHERE id = 1
                    """,
                    (username, screen, 1 if catalog_write_enabled else 0, catalog_write_reason),
                )
        finally:
            if owns_conn:
                conn.close()

    @contextmanager
    def transaction(self, username: str = "system", screen: str | None = None) -> Iterator[sqlite3.Connection]:
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            self.set_context(username=username, screen=screen, conn=conn)
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def query_all(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self.connect() as conn:
            return list(conn.execute(sql, tuple(params)).fetchall())

    def query_one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        with self.connect() as conn:
            return conn.execute(sql, tuple(params)).fetchone()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> int:
        with self.connect() as conn:
            cur = conn.execute(sql, tuple(params))
            return cur.lastrowid
