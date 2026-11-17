
import cv2
import pytesseract

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

image = cv2.imread("sample_page.png")

# Crop the student name region
name_crop = image[560:660, 150:1080]

# Convert to grayscale
gray = cv2.cvtColor(name_crop, cv2.COLOR_BGR2GRAY)

# Enlarge the cropped region
gray = cv2.resize(
    gray,
    None,
    fx=3,
    fy=3,
    interpolation=cv2.INTER_CUBIC
)

# Improve contrast
gray = cv2.threshold(
    gray, 0, 255,
    cv2.THRESH_BINARY + cv2.THRESH_OTSU
)[1]

cv2.imwrite("name_crop.png", gray)

text = pytesseract.image_to_string(
    gray,
    lang="eng",
    config="--oem 3 --psm 7"
)

print("Student name OCR result:")
print(text)
