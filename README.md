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
| **Offline-first sync** | PowerSync + Turso (libSQL) |
| **Vector search** | Milvus for semantic guideline retrieval |

---

## Quick start

### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) with MedGemma: `ollama pull medgemma`
- Docker (for Milvus)

### 1. Clone & install

```bash
git clone <repo>
cd easyRAG
npm install
```

### 2. Start Milvus + Ollama

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Minimum required:
#   OPENAI_API_KEY   — for embeddings
#   TURSO_DATABASE_URL defaults to file:data/protocolsync.db (no setup needed)
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
  ├── PowerSync ─────────────── offline-first SQLite sync
  └── REST API
        ├── /api/upload ──────── OCR → MedGemma → Turso + Milvus
        ├── /api/guidelines ──── CRUD + trending sort
        ├── /api/tricks ─────── crowd tips + voting
        ├── /api/vote ────────── upvote / downvote
        └── /api/trends ─────── research gaps + stats

Lib:
  lib/ocr.ts        Tesseract.js (DeepSeek-OCR-2 swap-in)
  lib/medllm.ts     Ollama → MedGemma structuring + categorization
  lib/scoring.ts    Confidence scoring + trash detection + badges
  lib/turso.ts      Turso / libSQL client + schema init
  lib/milvus.ts     Vector store (HNSW cosine, Milvus 2.4)
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
| Database | Turso (libSQL) |
| Sync | PowerSync |
| Vector store | Milvus v2.4 |
| OCR | Tesseract.js 5 (local WASM) |
| Medical LLM | MedGemma via Ollama |
| Embeddings | OpenAI text-embedding-3-small |
| PubMed | Supabase Edge → NCBI E-utilities |

---

## Environment variables

See [`.env.example`](.env.example). Minimum for local dev:

```
OPENAI_API_KEY=sk-...
TURSO_DATABASE_URL=file:data/protocolsync.db
OLLAMA_MODEL=medgemma
```

## Swapping models

- **LLM**: set `OLLAMA_MODEL` — any Ollama model works (`llama3.2`, `mistral`, `phi4`)
- **OCR**: replace `performOCR()` in `lib/ocr.ts` with your ONNX/DeepSeek call
- **Embeddings**: set `EMBEDDING_MODEL` — any OpenAI-compatible embedding endpoint

## PowerSync setup

1. Create project at [app.powersync.com](https://app.powersync.com)
2. Connect your Turso database
3. Upload `sync-rules.yaml`
4. Set `VITE_POWERSYNC_URL` + `VITE_POWERSYNC_TOKEN` in `.env`

Without PowerSync the app works fully — guidelines load on demand instead of syncing in real-time.
