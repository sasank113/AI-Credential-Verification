
import json
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
OCR_PYTHON = BASE_DIR / "paddle_venv" / "Scripts" / "python.exe"
OCR_RUNNER = BASE_DIR / "ocr_runner.py"


def extract_certificate_fields(image_path: str) -> dict:
    image = Path(image_path).resolve()

    if not image.is_file():
        raise FileNotFoundError("Uploaded certificate image not found.")

    if not OCR_PYTHON.is_file():
        raise RuntimeError("PaddleOCR Python environment not found.")

    import os
    env = os.environ.copy()
    cache_dir = str((BASE_DIR / ".paddlex").resolve())
    os.makedirs(cache_dir, exist_ok=True)
    env["PADDLE_PDX_CACHE_HOME"] = cache_dir

    result = subprocess.run(
        [str(OCR_PYTHON), str(OCR_RUNNER), str(image)],
        capture_output=True,
        text=True,
        timeout=600,
        env=env
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"OCR process failed: {result.stderr[-1500:]}"
        )

    # The OCR library may print startup messages before the JSON.
    output_lines = result.stdout.strip().splitlines()

    json_line = next(
        (line for line in reversed(output_lines)
         if line.strip().startswith("{")),
        None
    )

    if not json_line:
        raise RuntimeError("OCR did not return valid JSON.")

    data = json.loads(json_line)

    if "error" in data:
        raise RuntimeError(data["error"])

    return data
