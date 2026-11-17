
import cv2
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image = cv2.imread("aligned_certificate.png")

if image is None:
    raise FileNotFoundError("Aligned image not found")

gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(8, 8)
)

enhanced = clahe.apply(gray)

processed = cv2.adaptiveThreshold(
    enhanced,
    255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY,
    31,
    11
)

cv2.imwrite("aligned_processed.png", processed)

text = pytesseract.image_to_string(
    processed,
    lang="eng",
    config="--oem 3 --psm 6"
)

print("========== ALIGNED OCR RESULT ==========")
print(text)
print("Characters recognized:", len(text))
