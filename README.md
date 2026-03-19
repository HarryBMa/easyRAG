# Project Aether

> **Anesthesia protocol intelligence — ingest, structure, search, and harmonize clinical guidelines with a local medical AI stack.**
> Built for the PowerSync hackathon 2026.

---

## What it does

Project Aether ingests anesthesia protocols from any format (scanned PDFs, images, DOCX, plain text), structures them with a local medical LLM (MedGemma), cross-references them against PubMed, and makes them instantly searchable via pgvector semantic search.

| Feature | How |
|---|---|
| **Document ingestion** | Docling Serve (primary) → DeepSeek VL2 → pdf-parse / mammoth / Tesseract fallback chain |
| **Medical structuring** | MedGemma via Ollama — extracts title, category, drugs, steps, indications, contraindications |
| **Confidence scoring** | Auto-rates each guideline 0–1; flags low-quality protocols for peer review |
| **Vector indexing** | Full-section chunking → OpenAI embeddings → pgvector HNSW (LEANN in-memory layer for hot queries) |
| **PubMed verification** | Cross-references citations against NCBI E-utilities via Supabase Edge Function |
| **Crowd-sourced tricks** | Stack Overflow-style upvote system for anesthesia tips with auto-badges |
| **Research gaps** | Surfaces tips used at 5+ hospitals with zero published studies |
| **Knowledge base health** | Real-time ECG dashboard — confidence + flagged count drives heart rate and waveform |

---

## Quick start

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) with MedGemma: `ollama pull medgemma`
- A [Supabase](https://supabase.com) project (free tier works)
- OpenAI API key (for embeddings)

### 1. Clone & install

```bash
git clone https://github.com/HarryBMa/easyRAG.git
cd easyRAG
npm install
```

### 2. Start Ollama

```bash
ollama serve
# in another terminal:
ollama pull medgemma
```

### 3. Configure environment

```bash
cp .env.example .env
```

Minimum required:

```env
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
OPENAI_API_KEY=sk-...
OLLAMA_MODEL=medgemma
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=...
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
Browser (TanStack Start + React 19)
  └── REST API
        ├── /api/upload ──── OCR → MedGemma → Postgres + pgvector chunks
        ├── /api/guidelines ─ CRUD + trending / newest sort
        ├── /api/query ────── semantic search (LEANN → pgvector fallback)
        ├── /api/tricks ───── crowd tips + voting
        ├── /api/vote ──────── upvote / downvote
        ├── /api/trends ────── knowledge base stats + research gaps
        └── /api/citation-graph ─ Semantic Scholar paper relationships

Upload pipeline:
  File → extractText() ──────── Docling Serve / DeepSeek VL2 / Tesseract
       → splitIntoSections() ── markdown headers or fixed 3 000-char chunks
       → structureGuideline() ─ MedGemma (full section, num_ctx 4096)
       → evaluateGuideline() ── confidence scoring + flag detection
       → INSERT guidelines ──── Postgres
       → embedBatch() ─────────  OpenAI text-embedding-3-small (per chunk)
       → upsertChunks() ──────── protocol_chunks (pgvector HNSW)

Lib:
  lib/ocr.ts        Docling Serve → DeepSeek VL2 → pdf-parse / Tesseract
  lib/medllm.ts     Ollama → MedGemma structuring + categorization
  lib/scoring.ts    Confidence scoring + flag detection + badge system
  lib/turso.ts      Postgres client + schema migrations (guidelines, tricks, sources, votes)
  lib/milvus.ts     pgvector store + LEANN in-memory HNSW acceleration
  lib/leann.ts      hnswlib-node HNSW index (falls back to pgvector if unavailable)
  lib/embed.ts      OpenAI embeddings with chunk splitting (350-word windows, 50-word overlap)
  lib/literature.ts Multi-database literature search (PubMed, Semantic Scholar, OpenAlex)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start · React 19 · Tailwind CSS v4 |
| State / fetching | TanStack Query |
| Database | Supabase Postgres |
| Vector store | pgvector (HNSW cosine) + hnswlib-node in-memory layer |
| OCR | Docling Serve · DeepSeek VL2 (Ollama) · Tesseract.js 5 |
| Medical LLM | MedGemma via Ollama (local, no cloud required) |
| Embeddings | OpenAI text-embedding-3-small |
| Literature | PubMed NCBI · Semantic Scholar · OpenAlex |

---

## Environment variables

```env
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=eyJ...

# Ollama (defaults shown)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=medgemma

# Optional — Docling Serve for best PDF/DOCX extraction
DOCLING_URL=http://localhost:5001

# Optional — embedding dimension (match your model)
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
```

## Swapping models

- **Medical LLM**: set `OLLAMA_MODEL` — any Ollama model works (`llama3.2`, `mistral`, `phi4`)
- **OCR**: Docling Serve is the primary path; DeepSeek VL2 and Tesseract are automatic fallbacks
- **Embeddings**: set `EMBEDDING_MODEL` — any OpenAI-compatible embedding endpoint
