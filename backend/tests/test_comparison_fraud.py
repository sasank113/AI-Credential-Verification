import unittest
import re
from typing import Any

class TestCertificateComparisonLogic(unittest.TestCase):
    def test_name_matching(self):
        def _clean_str(val: Any) -> str:
            if val is None:
                return ""
            s = re.sub(r"[^\w\s]", " ", str(val).lower())
            return " ".join(s.split())

        def _match_student_name(val_a: Any, val_b: Any) -> bool:
            if not val_a or not val_b:
                return False
            raw_a = re.sub(r"\b(mr|ms|mrs|miss|dr|shri|smt)\b\.?", "", str(val_a), flags=re.IGNORECASE)
            raw_b = re.sub(r"\b(mr|ms|mrs|miss|dr|shri|smt)\b\.?", "", str(val_b), flags=re.IGNORECASE)
            ca = _clean_str(raw_a)
            cb = _clean_str(raw_b)
            if ca == cb:
                return True
            tokens_a = set(ca.split())
            tokens_b = set(cb.split())
            return bool(tokens_a and tokens_b and (tokens_a == tokens_b or tokens_a.issubset(tokens_b) or tokens_b.issubset(tokens_a)))

        self.assertTrue(_match_student_name("Mr. K. Sasank", "K Sasank"))
        self.assertTrue(_match_student_name("Sasank K", "K. Sasank"))
        self.assertTrue(_match_student_name("Alice Johnson", "Alice Johnson"))
        self.assertFalse(_match_student_name("Alice Johnson", "Bob Smith"))

    def test_degree_matching(self):
        def _match_degree(val_a: Any, val_b: Any) -> bool:
            if not val_a or not val_b:
                return False
            ca = re.sub(r"[^\w]", "", str(val_a).lower())
            cb = re.sub(r"[^\w]", "", str(val_b).lower())
            if ca == cb or ca in cb or cb in ca:
                return True
            degree_aliases = {
                "btech": ["bacheloroftechnology", "btech", "btechnol"],
                "be": ["bachelorofengineering", "be"],
                "bsc": ["bachelorofscience", "bsc"],
                "mtech": ["masteroftechnology", "mtech"],
            }
            for k, aliases in degree_aliases.items():
                if any(ca == a for a in aliases) and any(cb == a for a in aliases):
                    return True
            return False

        self.assertTrue(_match_degree("B.TECH.", "B.Tech"))
        self.assertTrue(_match_degree("B.Tech.", "Bachelor of Technology"))
        self.assertTrue(_match_degree("B.Sc", "Bachelor of Science"))
        self.assertFalse(_match_degree("B.Tech", "M.Tech"))

    def test_register_number_matching(self):
        def _match_register_number(val_a: Any, val_b: Any) -> bool:
            if not val_a or not val_b:
                return False
            clean_a = re.sub(r"[^a-zA-Z0-9]", "", str(val_a)).upper()
            clean_b = re.sub(r"[^a-zA-Z0-9]", "", str(val_b)).upper()
            return clean_a == clean_b

        self.assertTrue(_match_register_number("318126510001", "318126510001"))
        self.assertTrue(_match_register_number("reg-2024-001", "REG 2024 001"))
        self.assertFalse(_match_register_number("318126510001", "318126510002"))

if __name__ == "__main__":
    unittest.main()

