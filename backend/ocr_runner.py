
import sys
import json
import re
import cv2
import numpy as np
import tempfile
from pathlib import Path
from paddleocr import PaddleOCR


def extract_diagonal_watermark_text(ocr, image_path):
    """
    Perform additional OCR passes on the central certificate region
    to improve detection of diagonal watermark text.
    """
    image = cv2.imread(str(image_path))

    if image is None:
        return []

    height, width = image.shape[:2]

    # Crop the central region of the certificate
    crop = image[
        int(height * 0.15):int(height * 0.85),
        int(width * 0.10):int(width * 0.90)
    ]

    detected_texts = []

    # Try different angles to recognize diagonal watermark text
    for angle in [0, -20, 20, -35, 35, -45, 45, -60, 60]:

        crop_height, crop_width = crop.shape[:2]

        center = (crop_width // 2, crop_height // 2)

        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

        rotated = cv2.warpAffine(
            crop,
            matrix,
            (crop_width, crop_height),
            borderMode=cv2.BORDER_REPLICATE
        )
        # Improve contrast and resolution for faint watermark text
        gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)

        # Enlarge image to make faint letters easier to recognize
        gray = cv2.resize(
           gray,
           None,
           fx=2,
           fy=2,
           interpolation=cv2.INTER_CUBIC
        )

        # Improve local contrast
        clahe = cv2.createCLAHE(
          clipLimit=3.0,
          tileGridSize=(8, 8)
        )

        enhanced = clahe.apply(gray)

        # Reduce image noise while preserving text edges
        enhanced = cv2.GaussianBlur(
          enhanced,
          (3, 3),
          0
          )
        # Save temporary image for PaddleOCR
        temp_path = None

        try:
            with tempfile.NamedTemporaryFile(
                suffix=".jpg", delete=False
            ) as temp_file:
                temp_path = temp_file.name

            cv2.imwrite(temp_path, enhanced)

            result = ocr.predict(temp_path)

            for page in result:
                extracted = page.json["res"]
                detected_texts.extend(
                    extracted.get("rec_texts", [])
                )

        finally:
            if temp_path and Path(temp_path).exists():
                Path(temp_path).unlink()

    return detected_texts

def extract_student_name(texts, scores, boxes):
    label_index = None

    for i, text in enumerate(texts):
        normalized = text.lower().replace(".", "").replace("/", "").replace(" ", "")

        if "mr" in normalized or "ms" in normalized:
            label_index = i
            break

    if label_index is None:
        return None, "LABEL_NOT_FOUND"

    lx1, ly1, lx2, ly2 = map(int, boxes[label_index])
    candidates = []

    for i, (text, score, box) in enumerate(zip(texts, scores, boxes)):
        if i == label_index:
            continue

        x1, y1, x2, y2 = map(int, box)

        if x1 <= lx2:
            continue

        vertical_overlap = min(ly2, y2) - max(ly1, y1)

        if vertical_overlap > 0:
            candidates.append((x1 - lx2, text, score))

    if not candidates:
        return None, "NAME_NOT_FOUND"

    candidates.sort(key=lambda item: item[0])
    _, name, confidence = candidates[0]

    if confidence < 0.75:
        return name, "NEEDS_REVIEW"

    return name, "EXTRACTED"

def extract_certificate_details(texts):
    details = {
        "father_name": None,
        "degree": None,
        "branch": None,
        "month": None,
        "year": None,
        "result": None,
        "college_name": None
    }

    # Combine OCR text to handle fields split across text boxes
    combined_text = " ".join(texts)
    combined_text = re.sub(r"\s+", " ", combined_text)

    for i, text in enumerate(texts):
        normalized = text.strip().lower()

        # Father name
        if "son/daughter of" in normalized:
            candidate_indexes = [
              i + 1,
              i - 1,
              i + 2,
              i - 2
            ]

            for candidate_index in candidate_indexes:
                if candidate_index < 0 or candidate_index >= len(texts):
                   continue

                candidate = texts[candidate_index].strip()
                candidate = re.sub(r"[^A-Za-z\s]", "", candidate)
                words = candidate.split()

                # A father's name should normally contain 2–6 name parts.
                # Certificate names are generally printed in uppercase.
                if (
                   2 <= len(words) <= 6
                   and all(word.isalpha() for word in words)
                   and sum(word.isupper() for word in words) >= len(words) - 1
                ):
                   details["father_name"] = candidate
                   break

        # Degree and branch
        if "degree of" in normalized:
            if i + 1 < len(texts):
                details["degree"] = texts[i + 1].strip()

            # Skip the word "in" and find the branch
            for j in range(i + 2, min(i + 6, len(texts))):
                candidate = texts[j].strip()

                if candidate.lower() in ("in", "branch"):
                    continue

                if candidate:
                    details["branch"] = candidate
                    break

        # College name
        if "college of engineering" in normalized:
            for j in range(i + 1, min(i + 4, len(texts))):
                candidate = texts[j].strip()

                if "ANIL NEERUKONDA" in candidate.upper():
                    college_name = re.sub(
                        r",?\s*Sangivalasa\s*$",
                        "",
                        candidate,
                        flags=re.IGNORECASE
                    )

                    details["college_name"] = college_name.strip()
                    break
    # Extract examination month and year
    date_match = re.search(
        r"\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(20\d{2})\b",
        combined_text,
        re.IGNORECASE
    )

    if date_match:
        details["month"] = date_match.group(1).upper()
        details["year"] = date_match.group(2)

    # Extract result / classification
    result_patterns = [
        (r"\bFIRST CLASS WITH DISTINCTION\b", "First Class with Distinction"),
        (r"\bSECOND CLASS WITH DISTINCTION\b", "Second Class with Distinction"),
        (r"\bTHIRD CLASS WITH DISTINCTION\b", "Third Class with Distinction"),
        (r"\bFIRST CLASS\b", "First Class"),
        (r"\bSECOND CLASS\b", "Second Class"),
        (r"\bTHIRD CLASS\b", "Third Class"),
        (r"\bDISTINCTION\b", "Distinction"),
    ]

    for pattern, value in result_patterns:
        if re.search(pattern, combined_text, re.IGNORECASE):
            details["result"] = value
            break

    # PASS / FAIL only when explicitly present as a separate OCR text line
    if details["result"] is None:
        for text in texts:
            normalized = text.strip().upper()

            if normalized in ("FAIL", "FAILED"):
                details["result"] = "FAIL"
                break
            elif normalized in ("PASS", "PASSED"):
                details["result"] = "PASS"
                break

    return details

def main():
    if len(sys.argv) != 2:
        raise ValueError("Usage: ocr_runner.py <image_path>")

    image_path = Path(sys.argv[1])

    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    ocr = PaddleOCR(
        lang="en",
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True
    )

    result = ocr.predict(str(image_path))

    all_texts = []
    all_scores = []
    all_boxes = []

    for page in result:
        extracted = page.json["res"]

        all_texts.extend(extracted["rec_texts"])
        all_scores.extend(extracted["rec_scores"])
        all_boxes.extend(extracted["rec_boxes"])
    # Additional OCR passes for diagonal watermark detection
    # Temporarily disable repeated diagonal watermark OCR
    watermark_texts = []

    all_ocr_texts = all_texts
    student_name, name_status = extract_student_name(
        all_texts, all_scores, all_boxes
    )
    certificate_details = extract_certificate_details(all_texts)
    register_number = None

    for text in all_texts:
        match = re.search(r"\b\d{12}\b", text)

        if match:
            register_number = match.group()
            break

    output = {
        "student_name": student_name,
        "name_status": name_status,
        "register_number": register_number,
        "register_status": (
            "EXTRACTED" if register_number else "NOT_FOUND"
        ),
        "father_name": certificate_details["father_name"],
        "degree": certificate_details["degree"],
        "branch": certificate_details["branch"],
        "month": certificate_details["month"],
        "year": certificate_details["year"],
        "result": certificate_details["result"],
        "college_name": certificate_details["college_name"],
        "ocr_text": all_ocr_texts
    }

    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
