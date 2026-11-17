
from pathlib import Path
import cv2
import pytesseract
from pytesseract import Output
from statistics import mean

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image_folder = Path("ocr_samples")

for image_path in image_folder.iterdir():
    if image_path.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
        continue

    image = cv2.imread(str(image_path))

    if image is None:
        print(f"Could not load: {image_path.name}")
        continue

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    data = pytesseract.image_to_data(
        gray,
        lang="eng",
        config="--psm 6",
        output_type=Output.DICT
    )

    confidences = [
        float(conf)
        for text, conf in zip(data["text"], data["conf"])
        if text.strip() and float(conf) >= 0
    ]

    average = mean(confidences) if confidences else 0

    print(f"\nImage: {image_path.name}")
    print(f"Words detected: {len(confidences)}")
    print(f"Average OCR confidence: {average:.2f}%")
