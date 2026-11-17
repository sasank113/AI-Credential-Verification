from pathlib import Path
from paddleocr import PaddleOCR
def extract_student_name(texts, scores, boxes):
    # Find the Mr./Ms. label
    label_index = None

    for i, text in enumerate(texts):
        normalized = text.lower().replace(".", "").replace("/", "").replace(" ", "")

        if "mr" in normalized or "ms" in normalized:
            label_index = i
            break

    if label_index is None:
        return None, "LABEL_NOT_FOUND"

    label_box = boxes[label_index]
    lx1, ly1, lx2, ly2 = map(int, label_box)

    candidates = []

    for i, (text, score, box) in enumerate(zip(texts, scores, boxes)):
        if i == label_index:
            continue

        x1, y1, x2, y2 = map(int, box)

        # Candidate must be to the right of the label
        if x1 <= lx2:
            continue

        # Candidate must overlap vertically with the label
        vertical_overlap = min(ly2, y2) - max(ly1, y1)

        if vertical_overlap > 0:
            horizontal_gap = x1 - lx2
            candidates.append((horizontal_gap, text, score))

    if not candidates:
        return None, "NAME_NOT_FOUND"

    # Select the closest text on the same row
    candidates.sort(key=lambda item: item[0])

    _, name, confidence = candidates[0]

    if confidence < 0.75:
        return name, "NEEDS_REVIEW"

    return name, "EXTRACTED"
ocr = PaddleOCR(
    lang="en",
    use_doc_orientation_classify=True,
    use_doc_unwarping=True,
    use_textline_orientation=True
)

image_folder = Path("ocr_samples")

for image_path in sorted(image_folder.glob("*.jpeg")):

    print(f"\n\n{'=' * 60}")
    print(f"IMAGE: {image_path.name}")
    print("=" * 60)

    result = ocr.predict(str(image_path))

    for page in result:
        data = page.json
        extracted = data["res"]

        for text, score, box in zip(
          extracted["rec_texts"],
          extracted["rec_scores"],
          extracted["rec_boxes"]
        ):
           print(f"{text} | Confidence: {score:.3f}")
        student_name, status = extract_student_name(
            extracted["rec_texts"],
            extracted["rec_scores"],
            extracted["rec_boxes"]
        )

        print("\nSTUDENT NAME:", student_name)
        print("STATUS:", status)