
import cv2
import numpy as np

# Load certificate
image = cv2.imread("sample_page.png")

if image is None:
    raise FileNotFoundError("sample_page.png not found")

# Detect edges
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

# Find outer contours
contours, _ = cv2.findContours(
    edges,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)

# Find the largest four-corner contour
certificate = None
image_area = image.shape[0] * image.shape[1]

for contour in sorted(contours, key=cv2.contourArea, reverse=True):
    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(
        contour, 0.02 * perimeter, True
    )

    if len(approx) == 4 and cv2.contourArea(contour) > image_area * 0.20:
        certificate = approx.reshape(4, 2).astype("float32")
        break

if certificate is None:
    raise ValueError("Could not detect certificate boundaries")

# Order corners: top-left, top-right, bottom-right, bottom-left
s = certificate.sum(axis=1)
diff = np.diff(certificate, axis=1).flatten()

ordered = np.array([
    certificate[np.argmin(s)],
    certificate[np.argmin(diff)],
    certificate[np.argmax(s)],
    certificate[np.argmax(diff)]
], dtype="float32")

# Normalize certificate dimensions
width, height = 1200, 1600

destination = np.array([
    [0, 0],
    [width - 1, 0],
    [width - 1, height - 1],
    [0, height - 1]
], dtype="float32")

matrix = cv2.getPerspectiveTransform(ordered, destination)

aligned = cv2.warpPerspective(
    image, matrix, (width, height)
)

cv2.imwrite("aligned_certificate.png", aligned)

print("Certificate alignment successful!")
print("Saved: aligned_certificate.png")
