
from pathlib import Path
import cv2
import pytesseract
from pytesseract import Output
from statistics import mean

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image_folder = Path("ocr_samples")


def calculate_confidence(image):
    data = pytesseract.image_to_data(
        image,
        lang="eng",
        config="--psm 6",
        output_type=Output.DICT
    )

    scores = [
        float(conf)
        for word, conf in zip(data["text"], data["conf"])
        if word.strip() and float(conf) >= 0
    ]

    return mean(scores) if scores else 0

def calculate_field_score(text):
    text = text.upper()

    important_fields = [
        "BACHELOR OF TECHNOLOGY",
        "COMPUTER SCIENCE",
        "FIRST CLASS",
        "DISTINCTION",
        "ANIL NEERUKONDA",
        "FACULTY OF ENGINEERING",
        "THIS IS TO CERTIFY"
    ]

    detected = sum(
        1 for field in important_fields
        if field in text
    )

    return detected
import re

def extract_student_name(text):
    lines = text.upper().splitlines()

    ignored_words = {
        "SS", "BEL", "PY", "BS", "GIR",
        "ID", "MS", "MR", "SD", "SE", "OE",
        "THIS", "IS", "TO", "CERTIFY", "THAT",
        "HAS", "BEEN", "DULY", "ADMITTED",
        "THE", "DEGREE", "SON", "DAUGHTER",
        "OF", "BACHELOR", "TECHNOLOGY",
        "COMPUTER", "SCIENCE", "ENGINEERING",
        "BRANCH", "UNIVERSITY", "EXAMINATION"
    }

    for i, line in enumerate(lines):
        if "THIS IS TO CERTIFY" not in line:
            continue

        for next_line in lines[i + 1:i + 9]:

            if "BEEN DULY ADMITTED" in next_line:
                break

            words = re.findall(r"[A-Z]+", next_line)

            words = [
                word for word in words
                if len(word) >= 3
                and word not in ignored_words
            ]

            if len(words) >= 2:
                return " ".join(words)

    return None
def extract_register_number(text):
    matches = re.findall(r"\b\d{10,12}\b", text)

    for number in matches:
        if len(number) == 12:
            return {
                "value": number,
                "status": "VALID_FORMAT"
            }

    if matches:
        return {
            "value": matches[0],
            "status": "NEEDS_REVIEW"
        }

    return {
        "value": None,
        "status": "NOT_DETECTED"
    }
def create_preprocessed_images(gray):
    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    clahe_image = clahe.apply(gray)

    _, otsu_image = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    return {
        "Grayscale": gray,
        "CLAHE": clahe_image,
        "Otsu": otsu_image
    }


for image_path in image_folder.iterdir():

    if image_path.suffix.lower() not in [
        ".jpg", ".jpeg", ".png"
    ]:
        continue

    image = cv2.imread(str(image_path))

    if image is None:
        print(f"Cannot load {image_path.name}")
        continue

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY
    )

    candidates = create_preprocessed_images(gray)

    best_method = None
    best_total_score = -1
    best_confidence = -1
    best_text = ""

    for method, processed_image in candidates.items():

        confidence = calculate_confidence(processed_image)

        text = pytesseract.image_to_string(
            processed_image,
            lang="eng",
            config="--psm 6"
        )

        print(
            f"{image_path.name} | "
            f"{method}: {confidence:.2f}%"
        )
        field_score = calculate_field_score(text)

        total_score = confidence + (field_score * 10)

        print(f"Field Score: {field_score}/7")
        print(f"Total Score: {total_score:.2f}")

        if total_score > best_total_score:
           best_total_score = total_score
           best_confidence = confidence
           best_text = text
           best_method = method

    print("\n" + "=" * 55)
    print("IMAGE:", image_path.name)
    print("SELECTED METHOD:", best_method)
    print("TOTAL SCORE:", best_total_score)
    print("OCR CONFIDENCE:", best_confidence)
    print("=" * 55)
    print(best_text)
    student_name = extract_student_name(best_text)

    print("EXTRACTED STUDENT NAME:", student_name)
    register_result = extract_register_number(best_text)

    print("REGISTER NUMBER:", register_result["value"])
    print("REGISTER STATUS:", register_result["status"])
