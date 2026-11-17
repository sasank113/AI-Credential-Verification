import pytesseract
from PIL import Image

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

img = Image.open("sample_page.png")

for psm in [3, 4, 6, 11, 12]:
    text = pytesseract.image_to_string(
        img,
        lang="eng",
        config=f"--psm {psm}"
    )

    print(f"\nPSM: {psm}")
    print("Characters recognized:", len(text))
    print(text[:500])