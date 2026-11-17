import cv2
import io
import os
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import numpy as np
from PIL import Image, ImageChops, ImageEnhance

# Default path to reference assets
DEFAULT_ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
DEFAULT_LOGO_TEMPLATE = DEFAULT_ASSETS_DIR / "reference_university_logo.png"


def detect_logo_template(
    image: np.ndarray,
    template_path: Optional[Path] = None
) -> Dict[str, Any]:
    """
    Detect university logo/crest using multi-scale normalized cross-correlation
    against a reference logo template. If no template is provided or exists,
    falls back to header contour/crest feature detection.
    """
    h, w = image.shape[:2]
    # Header zone: top 40% of the certificate
    header_crop = image[0:int(h * 0.42), :]
    header_gray = cv2.cvtColor(header_crop, cv2.COLOR_BGR2GRAY)

    template_file = template_path or DEFAULT_LOGO_TEMPLATE

    # 1. Template Matching if reference logo is available
    if template_file and Path(template_file).is_file():
        template = cv2.imread(str(template_file))
        if template is not None:
            t_gray = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
            th, tw = t_gray.shape

            best_score = -1.0
            best_loc = (0, 0)
            best_scale = 1.0

            # Test multiple scale variations (0.75x to 1.25x)
            for scale in np.linspace(0.75, 1.25, 11):
                new_w = int(tw * scale)
                new_h = int(th * scale)
                if new_w >= header_gray.shape[1] or new_h >= header_gray.shape[0]:
                    continue
                resized_t = cv2.resize(t_gray, (new_w, new_h))
                res = cv2.matchTemplate(header_gray, resized_t, cv2.TM_CCOEFF_NORMED)
                _, max_val, _, max_loc = cv2.minMaxLoc(res)

                if max_val > best_score:
                    best_score = float(max_val)
                    best_loc = max_loc
                    best_scale = float(scale)

            detected = best_score >= 0.70
            status = "MATCHED_TEMPLATE" if detected else ("WEAK_MATCH" if best_score >= 0.55 else "MISSING_OR_ALTERED")

            matched_w = int(tw * best_scale)
            matched_h = int(th * best_scale)

            return {
                "detected": detected,
                "confidence": round(max(0.0, best_score), 3),
                "method": "template_matching",
                "scale": round(best_scale, 2),
                "bounding_box": {
                    "x": int(best_loc[0]),
                    "y": int(best_loc[1]),
                    "width": matched_w,
                    "height": matched_h
                },
                "status": status,
                "details": f"Template match confidence: {round(best_score * 100, 1)}% (status: {status})"
            }

    # 2. Fallback: Generic Crest/Emblem Contour Detection in Header Zone
    thresh = cv2.adaptiveThreshold(
        header_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 21, 5
    )
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    crest_candidates = []
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        area = cv2.contourArea(cnt)
        aspect = cw / float(ch) if ch > 0 else 0
        # Logo crests are typically centered, non-elongated, and of prominent area
        if area > 3000 and 0.6 <= aspect <= 1.8:
            is_horizontally_centered = (w * 0.15) < (x + cw / 2) < (w * 0.85)
            if is_horizontally_centered:
                crest_candidates.append({
                    "x": x, "y": y, "width": cw, "height": ch, "area": area, "aspect": round(aspect, 2)
                })

    if crest_candidates:
        best_candidate = max(crest_candidates, key=lambda c: c["area"])
        return {
            "detected": True,
            "confidence": 0.78,
            "method": "contour_crest_heuristic",
            "bounding_box": {
                "x": int(best_candidate["x"]),
                "y": int(best_candidate["y"]),
                "width": int(best_candidate["width"]),
                "height": int(best_candidate["height"])
            },
            "status": "GENERIC_CREST_DETECTED",
            "details": "Prominent graphical emblem / crest detected in header region."
        }

    return {
        "detected": False,
        "confidence": 0.0,
        "method": "contour_crest_heuristic",
        "bounding_box": None,
        "status": "NO_LOGO_DETECTED",
        "details": "No university logo or emblem was detected in the document header."
    }


def detect_watermark(image: np.ndarray) -> Dict[str, Any]:
    """
    Detect background watermark, security pattern, or paper grain in the document body.
    Authentic certificates contain faint background emblems or security patterns behind text.
    Fabricated / synthetic certificates often have flat pure-white backgrounds (zero texture)
    or uneven digital brush marks.
    """
    h, w = image.shape[:2]
    # Center 50% of the certificate (where main watermark/body is)
    center_crop = image[int(h * 0.25):int(h*0.75), int(w * 0.15):int(w * 0.85)]
    gray = cv2.cvtColor(center_crop, cv2.COLOR_BGR2GRAY)

    # Separate dark text pixels from background paper
    _, text_mask = cv2.threshold(gray, 130, 255, cv2.THRESH_BINARY_INV)
    kernel = np.ones((5, 5), np.uint8)
    text_mask_dilated = cv2.dilate(text_mask, kernel, iterations=2)

    bg_mask = (text_mask_dilated == 0)
    bg_pixels = gray[bg_mask]

    if len(bg_pixels) < 1000:
        return {
            "detected": False,
            "status": "INSUFFICIENT_BACKGROUND",
            "watermark_score": 0.0,
            "details": "Could not isolate enough background to evaluate watermark."
        }

    bg_mean = float(bg_pixels.mean())
    bg_std = float(bg_pixels.std())

    # Enhance background using CLAHE and compute Laplacian texture variance
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    lap = cv2.Laplacian(enhanced, cv2.CV_64F)
    bg_lap_var = float(lap[bg_mask].var())

    # Evaluation:
    # - Completely flat digital canvas: bg_std < 2.0 and bg_lap_var < 50
    # - Authentic watermark / security grain: bg_std >= 5.0 and bg_lap_var >= 150
    is_flat_synthetic = (bg_std < 2.5 and bg_lap_var < 80.0)
    has_watermark = (bg_std >= 4.5 and bg_lap_var >= 120.0)

    if is_flat_synthetic:
        status = "SUSPICIOUS_FLAT_BACKGROUND"
        score = 0.15
        details = "Background is artificially flat; lacks genuine paper texture or security watermark."
    elif has_watermark:
        status = "GENUINE_WATERMARK_PRESENT"
        score = min(1.0, round(0.5 + (bg_lap_var / 2500.0) * 0.5, 3))
        details = f"Natural security watermark / background pattern detected (texture energy: {round(bg_lap_var, 1)})."
    else:
        status = "WEAK_TEXTURE"
        score = 0.50
        details = "Subtle background texture detected, but watermark pattern is faint."

    return {
        "detected": has_watermark,
        "watermark_score": score,
        "background_std": round(bg_std, 2),
        "texture_variance": round(bg_lap_var, 2),
        "background_mean_intensity": round(bg_mean, 1),
        "status": status,
        "details": details
    }

def detect_faint_visual_patterns(image: np.ndarray) -> Dict[str, Any]:
    """
    Analyze faint and repeated visual patterns in a certificate.
    This is a screening indicator, not definitive watermark verification.
    """

    h, w = image.shape[:2]

    # Analyze the central certificate region
    crop = image[
        int(h * 0.15):int(h * 0.85),
        int(w * 0.10):int(w * 0.90)
    ]

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

    # Improve visibility of faint background patterns
    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    enhanced = clahe.apply(gray)

    # Estimate large-scale background illumination
    background = cv2.GaussianBlur(
        enhanced,
        (0, 0),
        sigmaX=15
    )

    # Extract subtle details from the background
    detail = cv2.absdiff(enhanced, background)

    # Measure visual variation
    texture_std = float(np.std(detail))

    # Detect prominent diagonal line structures
    edges = cv2.Canny(detail, 40, 120)

    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=50,
        minLineLength=max(30, int(w * 0.08)),
        maxLineGap=15
    )

    diagonal_count = 0

    if lines is not None:
        for line in lines:
            coordinates = np.asarray(line).reshape(-1)

            if len(coordinates) != 4:
              continue

            x1, y1, x2, y2 = coordinates

            angle = abs(
                np.degrees(
                    np.arctan2(y2 - y1, x2 - x1)
                )
            )

            if 15 <= angle <= 75 or 105 <= angle <= 165:
                diagonal_count += 1

    # Report measurements without declaring authenticity
    return {
        "analyzed": True,
        "texture_variation": round(texture_std, 2),
        "diagonal_line_count": diagonal_count,
        "possible_visual_pattern": (
            texture_std > 5.0 or diagonal_count >= 3
        ),
        "status": "VISUAL_PATTERN_REQUIRES_REVIEW",
        "details": (
            "Visual texture and diagonal structures were analyzed. "
            "These measurements alone cannot establish whether a "
            "watermark is genuine or fraudulent."
        )
    }


def detect_suspicious_watermark_text(ocr_texts: List[str]) -> Dict[str, Any]:
    """
    Detect explicit sample, demo, duplicate, or invalid markings
    using text already extracted by PaddleOCR.
    """

    suspicious_phrases = [
        "SAMPLE DATA",
        "SAMPLE",
        "SPECIMEN",
        "NOT VALID",
        "NOT OFFICIAL",
        "DEMO",
        "DUPLICATE"
    ]

    # Combine OCR text boxes because watermark words may be
    # detected in separate boxes.
    combined_text = " ".join(str(text) for text in ocr_texts)

    # Normalize by removing spaces and punctuation.
    normalized_text = "".join(
        char for char in combined_text.upper()
        if char.isalnum()
    )

    detected_terms = []

    for phrase in suspicious_phrases:
        normalized_phrase = "".join(
            char for char in phrase.upper()
            if char.isalnum()
        )

        if normalized_phrase in normalized_text:
            detected_terms.append(phrase)

    detected = len(detected_terms) > 0

    return {
        "detected": detected,
        "matched_terms": detected_terms,
        "status": (
            "SUSPICIOUS_WATERMARK_TEXT_DETECTED"
            if detected
            else "NO_SUSPICIOUS_WATERMARK_TEXT"
        ),
        "details": (
            "Suspicious watermark text detected: "
            + ", ".join(detected_terms)
            if detected
            else "No configured suspicious watermark phrases detected by OCR."
        )
    }

def detect_stamps_and_seals(image: np.ndarray) -> Dict[str, Any]:
    """
    Detect colored official seals, ink stamps, and embossed certification stamps.
    Official certificates typically use distinct non-monochrome ink (red, purple, blue, gold).
    """
    h, w = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]

    # Mask saturated colored ink (saturation > 50)
    colored_pixels = int(np.count_nonzero(sat > 50))
    total_pixels = h * w
    color_ratio = (colored_pixels / total_pixels) * 100.0

    # Red/Maroon stamp mask
    lower_red1 = np.array([0, 50, 40])
    upper_red1 = np.array([12, 255, 255])
    lower_red2 = np.array([168, 50, 40])
    upper_red2 = np.array([180, 255, 255])
    red_mask = cv2.inRange(hsv, lower_red1, upper_red1) | cv2.inRange(hsv, lower_red2, upper_red2)
    red_count = int(cv2.countNonZero(red_mask))

    # Blue/Navy ink stamp mask
    lower_blue = np.array([95, 50, 40])
    upper_blue = np.array([135, 255, 255])
    blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)
    blue_count = int(cv2.countNonZero(blue_mask))

    # Purple/Violet ink mask
    lower_purple = np.array([136, 40, 40])
    upper_purple = np.array([167, 255, 255])
    purple_mask = cv2.inRange(hsv, lower_purple, upper_purple)
    purple_count = int(cv2.countNonZero(purple_mask))

    # Circular stamp detection via Hough Circles (lower half of certificate)
    lower_half = image[int(h * 0.5):, :]
    gray_lower = cv2.cvtColor(lower_half, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray_lower, (9, 9), 2)

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=100,
        param1=100,
        param2=65,
        minRadius=30,
        maxRadius=180
    )

    circle_stamps_found = len(circles[0]) if circles is not None else 0

    has_colored_seal = color_ratio >= 1.5 or (red_count > 1000 or blue_count > 1000 or purple_count > 1000)
    detected = has_colored_seal or (circle_stamps_found > 0)

    ink_colors_present = []
    if red_count > 2000:
        ink_colors_present.append("Red/Maroon")
    if blue_count > 2000:
        ink_colors_present.append("Blue/Navy")
    if purple_count > 2000:
        ink_colors_present.append("Purple/Violet")

    status = "STAMP_SEAL_DETECTED" if detected else "NO_COLORED_STAMP_FOUND"

    return {
        "detected": detected,
        "color_ink_percentage": round(color_ratio, 2),
        "circular_stamps_found": circle_stamps_found,
        "ink_colors_detected": ink_colors_present,
        "status": status,
        "details": (
            f"Detected security ink ({round(color_ratio, 1)}% colored ink, "
            f"colors: {', '.join(ink_colors_present) or 'monochrome'})."
            if detected else "No prominent colored ink stamps or circular seals detected."
        )
    }


def detect_tampering_ela(image_path: str, quality: int = 90) -> Dict[str, Any]:
    """
    Error Level Analysis (ELA) for detecting digital image manipulation / splicing.
    When an image is modified (e.g. Photoshop clone tool, pasted text/logos),
    the modified regions have different JPEG compression error levels compared to original areas.
    """
    try:
        im = Image.open(image_path).convert('RGB')
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=quality)
        buf.seek(0)
        resaved = Image.open(buf)

        diff = ImageChops.difference(im, resaved)
        extrema = diff.getextrema()
        max_diff = max([ex[1] for ex in extrema])

        scale = 255.0 / max_diff if max_diff > 0 else 1.0
        diff_enhanced = ImageEnhance.Brightness(diff).enhance(scale)
        diff_np = np.array(diff_enhanced)

        ela_mean = float(diff_np.mean())
        ela_std = float(diff_np.std())

        # Unusually high ELA variance or localized spikes indicate composite/spliced imagery
        is_tampered = (ela_std > 35.0 or max_diff > 120)
        risk_level = "HIGH" if (ela_std > 35.0) else ("MEDIUM" if ela_std > 25.0 else "LOW")

        return {
            "tamper_detected": is_tampered,
            "risk_level": risk_level,
            "ela_variance": round(ela_std, 2),
            "max_compression_error": max_diff,
            "status": "SUSPICIOUS_MANIPULATION" if is_tampered else "CLEAN_COMPRESSION_PROFILE",
            "details": (
                f"ELA analysis shows consistent compression profile (risk: {risk_level}, variance: {round(ela_std, 1)})."
                if not is_tampered else
                f"Suspicious compression discrepancies detected (risk: {risk_level}, variance: {round(ela_std, 1)})."
            )
        }
    except Exception as exc:
        return {
            "tamper_detected": False,
            "risk_level": "UNKNOWN",
            "ela_variance": 0.0,
            "status": "ANALYSIS_FAILED",
            "details": f"ELA analysis could not be completed: {str(exc)}"
        }


def verify_certificate_visual_features(
    image_path: str,
    reference_logo_path: Optional[str] = None,
    ocr_texts: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Master visual verification entry point.
    Runs comprehensive multi-modal visual inspection:
      1. University logo / crest detection and template matching.
      2. Security background and watermark detection.
      3. Colored stamp, seal, and circular geometry verification.
      4. Error Level Analysis (ELA) for digital splicing / tampering.
    """
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image file at {image_path}")

    # Run all visual inspections
    logo_res = detect_logo_template(
        image,
        Path(reference_logo_path) if reference_logo_path else None
    )
    watermark_res = detect_watermark(image)
    visual_pattern_res = detect_faint_visual_patterns(image)
    suspicious_text_res = detect_suspicious_watermark_text(
        ocr_texts or []
    )
    seal_res = detect_stamps_and_seals(image)
    tamper_res = detect_tampering_ela(image_path)

    # Compute composite Visual Authenticity Score (0.0 to 1.0)
    score_weights = {
        "logo": 0.35,
        "watermark": 0.25,
        "seal": 0.20,
        "tamper": 0.20
    }

    logo_score = logo_res.get("confidence", 0.0)
    watermark_score = watermark_res.get("watermark_score", 0.0)
    seal_score = 1.0 if seal_res.get("detected") else 0.4
    tamper_score = 1.0 if tamper_res.get("risk_level") == "LOW" else (0.5 if tamper_res.get("risk_level") == "MEDIUM" else 0.0)

    visual_authenticity_score = round(
        (logo_score * score_weights["logo"]) +
        (watermark_score * score_weights["watermark"]) +
        (seal_score * score_weights["seal"]) +
        (tamper_score * score_weights["tamper"]),
        3
    )

    # Determine verdict and warning flags
    warning_flags: List[str] = []
    if suspicious_text_res.get("detected"):
        warning_flags.append(
           "Suspicious watermark text detected: "
           + ", ".join(suspicious_text_res.get("matched_terms", []))
        )
    if not logo_res.get("detected"):
        warning_flags.append("Missing or unverified university logo/crest.")
    if watermark_res.get("status") == "SUSPICIOUS_FLAT_BACKGROUND":
        warning_flags.append("Artificially flat background; missing authentic paper watermark.")
    if not seal_res.get("detected"):
        warning_flags.append("No official stamp or colored security seal detected.")
    if tamper_res.get("tamper_detected"):
        warning_flags.append(f"Image splicing / digital tampering detected by ELA ({tamper_res.get('risk_level')} risk).")

    if (
        visual_authenticity_score >= 0.75
        and not tamper_res.get("tamper_detected")
        and not suspicious_text_res.get("detected")
    ):
        verdict = "VERIFIED_AUTHENTIC_VISUALS"
    elif visual_authenticity_score >= 0.50:
        verdict = "SUSPICIOUS_REQUIRES_REVIEW"
    else:
        verdict = "FAILED_VISUAL_SECURITY_CHECKS"

    return {
        "visual_authenticity_score": visual_authenticity_score,
        "visual_verdict": verdict,
        "warning_flags": warning_flags,
        "logo": logo_res,
        "watermark": watermark_res,
        "visual_pattern_analysis": visual_pattern_res,
        "suspicious_watermark_text": suspicious_text_res,
        "stamp_seal": seal_res,
        "tampering_ela": tamper_res
    }

