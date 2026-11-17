
from pathlib import Path
import cv2
import pytesseract

# Tesseract installation path
pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image_folder = Path("ocr_samples")

for image_path in image_folder.iterdir():
    if image_path.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
        continue

    print("\n" + "=" * 60)
    print("FILE:", image_path.name)
    print("=" * 60)

    image = cv2.imread(str(image_path))

    if image is None:
        print("Could not load image")
        continue

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    text = pytesseract.image_to_string(
        gray,
        lang="eng",
        config="--psm 6"
    )

    print(text)
