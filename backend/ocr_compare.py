
import cv2
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image = cv2.imread("aligned_certificate.png")
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(8, 8)
)
enhanced = clahe.apply(gray)

adaptive = cv2.adaptiveThreshold(
    enhanced, 255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY, 31, 11
)

otsu = cv2.threshold(
    enhanced, 0, 255,
    cv2.THRESH_BINARY + cv2.THRESH_OTSU
)[1]

images = {
    "Grayscale": gray,
    "CLAHE": enhanced,
    "Adaptive": adaptive,
    "Otsu": otsu
}

for name, processed in images.items():
    text = pytesseract.image_to_string(
        processed,
        lang="eng",
        config="--oem 3 --psm 6"
    )

    print(f"\n{name}: {len(text)} characters")
    print(text[:350])
