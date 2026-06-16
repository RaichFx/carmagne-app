import os
import json
import logging
import uuid
import re
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Carmagne Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractRequest(BaseModel):
    image_base64: str  # data URL or raw base64
    mime_type: Optional[str] = "image/jpeg"


class ExtractedReport(BaseModel):
    weekStart: Optional[str] = None
    weekEnd: Optional[str] = None
    totalHours: Optional[float] = None
    daysWorked: Optional[int] = None
    siteName: Optional[str] = None
    tasks: Optional[List[str]] = None
    notes: Optional[str] = None
    rawText: Optional[str] = None


class ExtractResponse(BaseModel):
    success: bool
    data: ExtractedReport
    error: Optional[str] = None


def _strip_data_url(b64: str) -> str:
    if b64.startswith("data:"):
        idx = b64.find(",")
        if idx != -1:
            return b64[idx + 1:]
    return b64


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/weekly-report/extract", response_model=ExtractResponse)
async def extract_weekly_report(req: ExtractRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurada")

    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 requerido")

    cleaned_b64 = _strip_data_url(req.image_base64)

    system_msg = (
        "Eres un asistente experto en extraer datos de partes semanales de trabajo "
        "(hojas de horas / time sheets) en español. Extrae la información estructurada. "
        "Responde SIEMPRE en JSON puro, sin texto adicional ni markdown."
    )

    prompt = (
        "Analiza esta imagen de un parte semanal de trabajo y extrae los datos en JSON "
        "con las siguientes claves exactas:\n"
        "- weekStart: fecha de inicio de la semana (formato YYYY-MM-DD) o null\n"
        "- weekEnd: fecha de fin de la semana (formato YYYY-MM-DD) o null\n"
        "- totalHours: total de horas trabajadas en la semana (número) o null\n"
        "- daysWorked: número de días trabajados (entero) o null\n"
        "- siteName: nombre de la obra/proyecto o null\n"
        "- tasks: array de tareas/trabajos realizados (strings) o []\n"
        "- notes: observaciones o comentarios adicionales o null\n"
        "- rawText: transcripción del texto principal visible (máx 500 caracteres)\n\n"
        "Si no puedes determinar un valor, usa null. Devuelve SOLO el JSON, sin markdown."
    )

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"weekly-{uuid.uuid4()}",
            system_message=system_msg,
        ).with_model("openai", "gpt-4o")

        image = ImageContent(image_base64=cleaned_b64)
        user_msg = UserMessage(text=prompt, file_contents=[image])

        result_text = await chat.send_message(user_msg)
        logger.info(f"Raw LLM output: {result_text[:300]}")

        # Extract JSON
        text = result_text.strip()
        # Remove markdown code blocks if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # try to find first {...} block
            match = re.search(r"\{[\s\S]*\}", text)
            if match:
                parsed = json.loads(match.group(0))
            else:
                parsed = {"rawText": result_text[:500]}

        data = ExtractedReport(**{k: v for k, v in parsed.items() if k in ExtractedReport.model_fields})
        return ExtractResponse(success=True, data=data)

    except Exception as e:
        logger.exception("Error extracting weekly report")
        return ExtractResponse(
            success=False,
            data=ExtractedReport(),
            error=str(e),
        )
