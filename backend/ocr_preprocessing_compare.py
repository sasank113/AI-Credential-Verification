
from pathlib import Path
import cv2
import pytesseract
from pytesseract import Output
from statistics import mean

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image_folder = Path("ocr_samples")

def get_confidence(image):
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


for path in image_folder.iterdir():
    if path.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
        continue

    original = cv2.imread(str(path))

    if original is None:
        print(f"Could not load {path.name}")
        continue

    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)

    # Method 1: Grayscale
    grayscale = gray

    # Method 2: CLAHE
    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )
    clahe_image = clahe.apply(gray)

    # Method 3: Otsu thresholding
    _, otsu = cv2.threshold(
        gray, 0, 255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    methods = {
        "Grayscale": grayscale,
        "CLAHE": clahe_image,
        "Otsu": otsu
    }

    print(f"\n{'=' * 50}")
    print(f"Image: {path.name}")
    print(f"{'=' * 50}")

    for method_name, processed in methods.items():
        confidence = get_confidence(processed)

        print(
            f"{method_name:<12}: "
            f"{confidence:.2f}%"
        )
