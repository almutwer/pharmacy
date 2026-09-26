import os
import tempfile
import unittest
from pathlib import Path

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pharmacy_app.database import Database
from pharmacy_app.inventory import InventoryService
from pharmacy_app.sales import SalesService


class CoreDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "pharmacy.db"
        self.db = Database(self.db_path)
        self.db.initialize()
        self.db.load_sample_data()

    def tearDown(self):
        self.tmp.cleanup()

    def test_catalog_inventory_are_separate(self):
        catalog_count = self.db.query_one("SELECT COUNT(*) AS c FROM medicines_catalog")["c"]
        inventory_count = self.db.query_one("SELECT COUNT(*) AS c FROM pharmacy_inventory")["c"]
        self.assertEqual(catalog_count, 50)
        self.assertEqual(inventory_count, 10)

    def test_sale_deducts_stock_and_invoice_sequence(self):
        sales = SalesService(self.db)
        before = self.db.query_one(
            "SELECT quantity FROM pharmacy_inventory pi JOIN medicines_catalog mc ON mc.id=pi.catalog_id WHERE mc.barcode='6221000000011'"
        )["quantity"]
        item = sales.build_cart_item_from_inventory(1, 1)
        result = sales.complete_sale([item], payment_method="cash", username="test_user")
        self.assertTrue(result.invoice_number.startswith("INV-"))
        after = self.db.query_one("SELECT quantity FROM pharmacy_inventory WHERE id=1")["quantity"]
        self.assertEqual(after, before - 1)

    def test_cannot_sell_more_than_available(self):
        sales = SalesService(self.db)
        item = sales.build_cart_item_from_inventory(1, 1)
        too_many = type(item)(
            inventory_id=item.inventory_id,
            catalog_id=item.catalog_id,
            medicine_name=item.medicine_name,
            quantity=100000,
            unit_price=item.unit_price,
            unit_cost=item.unit_cost,
            batch_number=item.batch_number,
            expiry_date=item.expiry_date,
        )
        with self.assertRaises(Exception):
            sales.complete_sale([too_many], payment_method="cash", username="test_user")

    def test_add_stock_rejects_expired(self):
        inv = InventoryService(self.db)
        catalog = inv.find_catalog_by_barcode("6221000000011")
        with self.assertRaises(ValueError):
            inv.add_stock(catalog["id"], 1, 1.0, 2.0, "2020-01-01")


if __name__ == "__main__":
    unittest.main()
