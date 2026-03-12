from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

SPECIALISTS = [
    {"id": "general", "name": "General Practitioner", "icon": "🏥", "description": "General medicine and primary care"},
    {"id": "cardiologist", "name": "Cardiologist", "icon": "❤️", "description": "Heart and cardiovascular system"},
    {"id": "neurologist", "name": "Neurologist", "icon": "🧠", "description": "Brain and nervous system"},
    {"id": "radiologist", "name": "Radiologist", "icon": "🔬", "description": "Medical imaging interpretation"},
    {"id": "pharmacist", "name": "Pharmacist", "icon": "💊", "description": "Drug interactions and medications"},
    {"id": "surgeon", "name": "Surgeon", "icon": "🔪", "description": "Surgical procedures and interventions"},
    {"id": "oncologist", "name": "Oncologist", "icon": "🎗️", "description": "Cancer diagnosis and treatment"},
    {"id": "pediatrician", "name": "Pediatrician", "icon": "👶", "description": "Children's health and medicine"},
    {"id": "psychiatrist", "name": "Psychiatrist", "icon": "🧘", "description": "Mental health and psychiatric conditions"},
    {"id": "emergency", "name": "Emergency Medicine", "icon": "🚑", "description": "Acute and emergency care"},
]


@router.get("/")
async def list_specialists() -> list[dict]:
    """Return the available medical specialist roles."""
    return SPECIALISTS
