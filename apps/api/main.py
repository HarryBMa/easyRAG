from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import documents, query, specialists
from routers import powersync as powersync_router

app = FastAPI(
    title="easyRAG API",
    description="Medical RAG system powered by RAG-Anything",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(query.router, prefix="/api/query", tags=["query"])
app.include_router(specialists.router, prefix="/api/specialists", tags=["specialists"])
app.include_router(powersync_router.router, prefix="/api/powersync", tags=["powersync"])


@app.on_event("startup")
async def startup_event() -> None:
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.rag_storage_dir, exist_ok=True)


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "easyRAG API"}
