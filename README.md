# ProtocolSync AI

> **The self-correcting, crowd-powered anesthesia guideline harmonizer.**
> Built for the PowerSync hackathon 2026.

---

## What it does

ProtocolSync AI ingests anesthesia protocols from any format (scanned PDFs, images, DOCX, plain text), structures them with a local medical LLM, cross-references them against PubMed, and syncs everything offline-first across hospitals via PowerSync.

| Feature | How |
|---|---|
| **OCR extraction** | Tesseract.js (local WASM) — drop-in for DeepSeek-OCR-2 ONNX |
| **Medical structuring** | MedGemma via Ollama (local inference, no cloud required) |
| **Confidence scoring** | Auto-rates each guideline 0–1; flags low-quality for review |
| **PubMed verification** | Supabase Edge Function → NCBI E-utilities |
| **Crowd-sourced tricks** | Stack Overflow-style upvote system with auto-badges |
| **Research gaps** | Surfaces tricks used at 5+ hospitals with 0 studies |
| **Offline-first sync** | PowerSync + Supabase Postgres |
| **Vector search** | pgvector (HNSW cosine) for semantic guideline retrieval |

---

## Quick start

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) with MedGemma: `ollama pull medgemma`
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone & install

```bash
git clone <repo>
cd easyRAG
npm install
```

### 2. Start Ollama

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Minimum required:
#   DATABASE_URL   — Supabase Postgres connection string
#   OPENAI_API_KEY — for embeddings
#   SUPABASE_URL + SUPABASE_ANON_KEY — for PubMed edge function
```

### 4. Run

```bash
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
Browser (TanStack Start + React)
  ├── PowerSync ─────────────── offline-first Postgres sync
  └── REST API
        ├── /api/upload ──────── OCR → MedGemma → Supabase Postgres + pgvector
        ├── /api/guidelines ──── CRUD + trending sort
        ├── /api/tricks ─────── crowd tips + voting
        ├── /api/vote ────────── upvote / downvote
        └── /api/trends ─────── research gaps + stats

Lib:
  lib/ocr.ts        Tesseract.js (DeepSeek-OCR-2 swap-in)
  lib/medllm.ts     Ollama → MedGemma structuring + categorization
  lib/scoring.ts    Confidence scoring + trash detection + badges
  lib/turso.ts      Supabase Postgres client + schema init
  lib/milvus.ts     Vector store (HNSW cosine, pgvector)
  lib/embed.ts      OpenAI text-embedding-3-small (pluggable)
  lib/powersync.ts  Browser-side PowerSync client

Supabase Edge:
  verify-sources/   PubMed / NCBI E-utilities citation lookup
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start · React 19 · Tailwind CSS v4 |
| State | TanStack Query |
| Database | Supabase Postgres |
| Sync | PowerSync |
| Vector store | pgvector (HNSW cosine) |
| OCR | Tesseract.js 5 (local WASM) |
| Medical LLM | MedGemma via Ollama |
| Embeddings | OpenAI text-embedding-3-small |
| PubMed | Supabase Edge → NCBI E-utilities |

---

## Environment variables

See [`.env.example`](.env.example). Minimum for local dev:

```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
OPENAI_API_KEY=sk-...
OLLAMA_MODEL=medgemma
```

## Swapping models

- **LLM**: set `OLLAMA_MODEL` — any Ollama model works (`llama3.2`, `mistral`, `phi4`)
- **OCR**: replace `performOCR()` in `lib/ocr.ts` with your ONNX/DeepSeek call
- **Embeddings**: set `EMBEDDING_MODEL` — any OpenAI-compatible embedding endpoint

## PowerSync setup

1. Create project at [app.powersync.com](https://app.powersync.com)
2. Connect your Supabase Postgres database
3. Upload `sync-rules.yaml`
4. Set `VITE_POWERSYNC_URL` + `VITE_POWERSYNC_TOKEN` in `.env`

Without PowerSync the app works fully — guidelines load on demand instead of syncing in real-time.
