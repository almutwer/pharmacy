from __future__ import annotations

import argparse
import sys

from .database import Database


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local Pharmacy Desktop Application")
    parser.add_argument("--init-db", action="store_true", help="Initialize the SQLite database and exit")
    parser.add_argument("--load-sample-data", action="store_true", help="Load sample catalog/inventory/sales data")
    parser.add_argument("--db", help="Override SQLite database path")
    args = parser.parse_args(argv)

    db = Database(args.db)
    db.initialize()
    if args.load_sample_data:
        db.load_sample_data()
    if args.init_db:
        print(f"Database initialized at: {db.path}")
        return 0

    from .ui.main_window import run_app

    return run_app(db)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
