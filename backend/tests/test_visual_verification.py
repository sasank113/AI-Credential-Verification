import unittest
import numpy as np
import cv2
from pathlib import Path
from app.services.visual_verification_service import (
    verify_certificate_visual_features,
    detect_logo_template,
    detect_watermark,
    detect_stamps_and_seals,
    detect_tampering_ela
)

class TestVisualVerification(unittest.TestCase):
    def setUp(self):
        self.sample_dir = Path(__file__).resolve().parents[1] / "ocr_samples"
        self.sample_cert = self.sample_dir / "certificate1.jpeg"

    def test_genuine_certificate_features(self):
        if not self.sample_cert.is_file():
            self.skipTest("Sample certificate image not found")

        result = verify_certificate_visual_features(str(self.sample_cert))
        
        self.assertIn("visual_authenticity_score", result)
        self.assertGreaterEqual(result["visual_authenticity_score"], 0.75)
        self.assertEqual(result["visual_verdict"], "VERIFIED_AUTHENTIC_VISUALS")
        
        # Logo check
        self.assertTrue(result["logo"]["detected"])
        self.assertGreaterEqual(result["logo"]["confidence"], 0.70)
        
        # Watermark check
        self.assertTrue(result["watermark"]["detected"])
        self.assertEqual(result["watermark"]["status"], "GENUINE_WATERMARK_PRESENT")
        
        # Stamp/seal check
        self.assertTrue(result["stamp_seal"]["detected"])
        
        # ELA Tampering check
        self.assertEqual(result["tampering_ela"]["risk_level"], "LOW")
        self.assertFalse(result["tampering_ela"]["tamper_detected"])

    def test_synthetic_flat_fake_certificate(self):
        # Create a plain flat image mimicking a digitally forged degree
        fake_img = np.ones((1600, 1200, 3), dtype=np.uint8) * 255
        cv2.putText(fake_img, "FAKED DEGREE CERTIFICATE", (300, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
        
        temp_fake_path = self.sample_dir / "temp_fake_test.jpg"
        cv2.imwrite(str(temp_fake_path), fake_img)
        
        try:
            result = verify_certificate_visual_features(str(temp_fake_path))
            
            # Synthetic certificate must fail visual checks
            self.assertLess(result["visual_authenticity_score"], 0.60)
            self.assertEqual(result["visual_verdict"], "FAILED_VISUAL_SECURITY_CHECKS")
            self.assertFalse(result["logo"]["detected"])
            self.assertEqual(result["watermark"]["status"], "SUSPICIOUS_FLAT_BACKGROUND")
            self.assertFalse(result["stamp_seal"]["detected"])
            self.assertTrue(len(result["warning_flags"]) >= 2)
        finally:
            if temp_fake_path.exists():
                temp_fake_path.unlink()

if __name__ == "__main__":
    unittest.main()

