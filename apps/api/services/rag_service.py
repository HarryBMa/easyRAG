from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from config import settings

_METADATA_FILE = "documents_metadata.json"


def _metadata_path() -> Path:
    return Path(settings.rag_storage_dir) / _METADATA_FILE


def _load_metadata() -> list[dict[str, Any]]:
    path = _metadata_path()
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_metadata(docs: list[dict[str, Any]]) -> None:
    path = _metadata_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(docs, fh, indent=2, ensure_ascii=False)


class RAGService:
    """Singleton wrapper around RAGAnything."""

    _instance: "RAGService | None" = None
    _rag: Any = None
    _initialized: bool = False

    def __new__(cls) -> "RAGService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self) -> None:
        if self._initialized:
            return

        try:
            from raganything import RAGAnything, RAGAnythingConfig
            from lightrag import LightRAG
            from lightrag.llm.openai import openai_complete_if_cache, openai_embed
            from lightrag.utils import EmbeddingFunc
            import numpy as np

            async def llm_model_func(
                prompt: str,
                system_prompt: str | None = None,
                history_messages: list[dict] | None = None,
                **kwargs: Any,
            ) -> str:
                return await openai_complete_if_cache(
                    "gpt-4o-mini",
                    prompt,
                    system_prompt=system_prompt,
                    history_messages=history_messages or [],
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url,
                    **kwargs,
                )

            async def vision_model_func(
                prompt: str,
                system_prompt: str | None = None,
                history_messages: list[dict] | None = None,
                image_data: list[str] | None = None,
                **kwargs: Any,
            ) -> str:
                if image_data:
                    return await openai_complete_if_cache(
                        "gpt-4o",
                        prompt,
                        system_prompt=system_prompt,
                        history_messages=history_messages or [],
                        api_key=settings.openai_api_key,
                        base_url=settings.openai_base_url,
                        images=image_data,
                        **kwargs,
                    )
                return await llm_model_func(
                    prompt,
                    system_prompt=system_prompt,
                    history_messages=history_messages,
                    **kwargs,
                )

            async def embedding_func(texts: list[str]) -> np.ndarray:
                return await openai_embed(
                    texts,
                    model="text-embedding-3-small",
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url,
                )

            config = RAGAnythingConfig(
                working_dir=settings.rag_storage_dir,
            )

            self._rag = RAGAnything(
                config=config,
                llm_model_func=llm_model_func,
                vision_model_func=vision_model_func,
                embedding_func=EmbeddingFunc(
                    embedding_dim=1536,
                    max_token_size=8192,
                    func=embedding_func,
                ),
            )
            self._initialized = True
        except Exception as exc:
            raise RuntimeError(f"Failed to initialize RAGAnything: {exc}") from exc

    async def process_document(self, file_path: str, file_name: str) -> dict[str, Any]:
        await self.initialize()

        doc_id = str(uuid.uuid4())
        docs = _load_metadata()
        record: dict[str, Any] = {
            "id": doc_id,
            "name": file_name,
            "file_path": file_path,
            "status": "processing",
            "created_at": datetime.utcnow().isoformat(),
            "deleted": False,
        }
        docs.append(record)
        _save_metadata(docs)

        try:
            await self._rag.process_document_complete(
                file_path=file_path,
                output_dir=os.path.join(settings.rag_storage_dir, "parsed"),
            )
            record["status"] = "ready"
        except Exception as exc:
            record["status"] = "error"
            record["error"] = str(exc)

        # Persist updated status
        docs = _load_metadata()
        for i, d in enumerate(docs):
            if d["id"] == doc_id:
                docs[i] = record
                break
        _save_metadata(docs)

        return record

    async def query(
        self,
        question: str,
        mode: str = "hybrid",
        specialist_role: str | None = None,
    ) -> dict[str, Any]:
        await self.initialize()

        if specialist_role:
            system_prompt = (
                f"You are a {specialist_role} medical specialist. "
                "Answer based on the documents provided, always citing sources."
            )
            full_question = f"[System: {system_prompt}]\n\n{question}"
        else:
            full_question = question

        result = await self._rag.aquery(full_question, mode=mode)

        if isinstance(result, str):
            return {"answer": result, "sources": []}

        answer = getattr(result, "answer", str(result))
        sources: list[Any] = getattr(result, "sources", [])
        if hasattr(result, "context"):
            sources = result.context if isinstance(result.context, list) else [result.context]

        return {"answer": answer, "sources": sources}

    def get_documents(self) -> list[dict[str, Any]]:
        return [d for d in _load_metadata() if not d.get("deleted", False)]

    def delete_document(self, doc_id: str) -> bool:
        docs = _load_metadata()
        for doc in docs:
            if doc["id"] == doc_id and not doc.get("deleted", False):
                doc["deleted"] = True
                _save_metadata(docs)
                return True
        return False


rag_service = RAGService()
