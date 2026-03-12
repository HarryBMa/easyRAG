from __future__ import annotations

import os
import uuid

import aiofiles
from fastapi import APIRouter, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from typing import Any

from config import settings
from services.rag_service import rag_service

router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".pptx", ".xlsx",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff",
    ".txt", ".md",
}


class DocumentResponse(BaseModel):
    id: str
    name: str
    status: str
    created_at: str


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload and begin processing a document."""
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{ext}' is not supported. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    save_name = f"{uuid.uuid4()}_{filename}"
    save_path = os.path.join(settings.upload_dir, save_name)

    os.makedirs(settings.upload_dir, exist_ok=True)
    async with aiofiles.open(save_path, "wb") as out_file:
        content = await file.read()
        await out_file.write(content)

    record = await rag_service.process_document(save_path, filename)
    return record


@router.get("/")
async def list_documents() -> list[dict[str, Any]]:
    """Return all non-deleted documents."""
    return rag_service.get_documents()


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str) -> None:
    """Soft-delete a document from the metadata store."""
    deleted = rag_service.delete_document(doc_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )
