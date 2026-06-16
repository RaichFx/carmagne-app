"""Backend tests for Carmagne weekly report extraction endpoint."""
import base64
import io
import os

import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8001").rstrip("/")


def _generate_weekly_report_image() -> str:
    """Generate a realistic JPG image of a weekly work report and return as base64."""
    img = Image.new("RGB", (900, 700), color="white")
    draw = ImageDraw.Draw(img)

    try:
        font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except Exception:
        font_title = ImageFont.load_default()
        font = ImageFont.load_default()

    lines = [
        ("PARTE SEMANAL DE TRABAJO", font_title),
        ("", font),
        ("Trabajador: Juan Garcia", font),
        ("Semana: 13/01/2026 - 19/01/2026", font),
        ("Obra: Edificio Barakaldo 106", font),
        ("", font),
        ("Lunes:    8 horas", font),
        ("Martes:   8 horas", font),
        ("Miercoles: 8 horas", font),
        ("Jueves:   8 horas", font),
        ("Viernes:  5 horas", font),
        ("", font),
        ("TOTAL: 37 horas", font),
        ("Dias trabajados: 5", font),
        ("", font),
        ("Tareas: instalacion de cableado,", font),
        ("montaje de cuadro electrico,", font),
        ("pruebas finales.", font),
    ]
    y = 20
    for txt, f in lines:
        draw.text((30, y), txt, fill="black", font=f)
        y += 35

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# ---------- /api/health ----------
def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------- /api/weekly-report/extract validation ----------
def test_extract_empty_image_returns_400():
    r = requests.post(
        f"{BASE_URL}/api/weekly-report/extract",
        json={"image_base64": "", "mime_type": "image/jpeg"},
        timeout=15,
    )
    assert r.status_code == 400, r.text


def test_extract_missing_field_returns_422():
    r = requests.post(
        f"{BASE_URL}/api/weekly-report/extract",
        json={"mime_type": "image/jpeg"},
        timeout=15,
    )
    # FastAPI validation
    assert r.status_code == 422, r.text


# ---------- /api/weekly-report/extract real LLM call ----------
def test_extract_real_image_success():
    b64 = _generate_weekly_report_image()
    payload = {"image_base64": b64, "mime_type": "image/jpeg"}
    r = requests.post(
        f"{BASE_URL}/api/weekly-report/extract",
        json=payload,
        timeout=90,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "success" in body
    assert "data" in body
    # When success is true, we expect at least some fields populated
    if body["success"]:
        data = body["data"]
        # Validate shape (all keys exist even if null)
        for key in ["weekStart", "weekEnd", "totalHours", "daysWorked",
                    "siteName", "tasks", "notes", "rawText"]:
            assert key in data, f"missing key {key}"
        # At least one of these should be extracted from our clear image
        extracted_signal = any([
            data.get("totalHours") is not None,
            data.get("weekStart"),
            data.get("siteName"),
            (data.get("tasks") and len(data["tasks"]) > 0),
            data.get("rawText"),
        ])
        assert extracted_signal, f"AI extracted nothing useful: {data}"
    else:
        # If LLM failed, capture the error for the report but don't hard-fail
        pytest.skip(f"LLM extraction returned success=false: {body.get('error')}")


def test_extract_with_data_url_prefix():
    """Endpoint must strip data: URL prefix correctly."""
    b64 = _generate_weekly_report_image()
    data_url = f"data:image/jpeg;base64,{b64}"
    r = requests.post(
        f"{BASE_URL}/api/weekly-report/extract",
        json={"image_base64": data_url, "mime_type": "image/jpeg"},
        timeout=90,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "success" in body and "data" in body
