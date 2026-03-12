from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from services.rag_service import rag_service

router = APIRouter()

VALID_MODES = {"naive", "local", "global", "hybrid"}


class QueryRequest(BaseModel):
    question: str
    mode: str = "hybrid"
    specialist_role: str | None = None


class QueryResponse(BaseModel):
    answer: str
    sources: list[Any]


@router.post("/", response_model=QueryResponse)
async def query_rag(body: QueryRequest) -> QueryResponse:
    """Query the RAG system with optional specialist framing."""
    if body.mode not in VALID_MODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid mode '{body.mode}'. Choose from: {sorted(VALID_MODES)}",
        )
    if not body.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question must not be empty.",
        )

    result = await rag_service.query(
        question=body.question,
        mode=body.mode,
        specialist_role=body.specialist_role,
    )
    return QueryResponse(**result)


@router.get("/modes")
async def list_modes() -> dict[str, list[dict[str, str]]]:
    """Return the available RAG query modes."""
    return {
        "modes": [
            {"id": "naive", "name": "Naive", "description": "Simple vector similarity search"},
            {"id": "local", "name": "Local", "description": "Entity-level local graph traversal"},
            {"id": "global", "name": "Global", "description": "High-level global graph reasoning"},
            {"id": "hybrid", "name": "Hybrid", "description": "Combines local + global (recommended)"},
        ]
    }
