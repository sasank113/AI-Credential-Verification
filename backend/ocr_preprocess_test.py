
import cv2
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

# Load certificate image
image = cv2.imread("sample_page.png")

if image is None:
    raise FileNotFoundError("sample_page.png not found")

# Convert to grayscale
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

# Improve local contrast
clahe = cv2.createCLAHE(
    clipLimit=2.0,
    tileGridSize=(8, 8)
)

enhanced = clahe.apply(gray)

# Remove uneven background and improve text visibility
processed = cv2.adaptiveThreshold(
    enhanced,
    255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY,
    31,
    11
)

# Save processed image
cv2.imwrite("processed_certificate.png", processed)

# Extract English text
text = pytesseract.image_to_string(
    processed,
    lang="eng",
    config="--oem 3 --psm 6"
)

print("========== EXTRACTED TEXT ==========")
print(text)
print("====================================")
print("Characters recognized:", len(text))
