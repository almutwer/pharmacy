from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pharmacy_app.database import Database  # noqa: E402

if __name__ == "__main__":
    db = Database(sys.argv[1] if len(sys.argv) > 1 else None)
    db.initialize()
    db.load_sample_data()
    print(f"Sample data loaded into {db.path}")
