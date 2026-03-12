# easyRAG — Medical RAG System

> A multimodal medical RAG (Retrieval-Augmented Generation) system powered by [RAG-Anything](https://github.com/HKUDS/RAG-Anything), enabling medical specialists to query uploaded documents with AI-assisted answers and source citations.

---

## Features

- **Multimodal Document Processing** — Upload PDFs, Word documents, PowerPoint, Excel, images (JPEG, PNG, TIFF, BMP, GIF), Markdown, and plain text. All are processed via RAG-Anything for deep multimodal understanding.
- **Medical Specialist Roles** — Choose from 10 specialist personas (GP, Cardiologist, Neurologist, Radiologist, Pharmacist, Surgeon, Oncologist, Pediatrician, Psychiatrist, Emergency Medicine). Each persona shapes how the LLM frames its answers.
- **Real-Time Sync via PowerSync** — Document state and chat history sync in real time across clients using [PowerSync](https://www.powersync.com/).
- **Modern Frontend** — Built with React 19, Vite 6, [TanStack Router](https://tanstack.com/router) for file-based routing, and [TanStack Query](https://tanstack.com/query) for data fetching.
- **Source Citations** — Every answer includes references to the source documents and passages used by the RAG pipeline.
- **Drag & Drop Upload** — Intuitive upload interface with progress feedback and per-file status.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  React + Vite Frontend (apps/web)           │
│  TanStack Router / Query                    │
│  PowerSync Web SDK (real-time sync)         │
└──────────────────┬──────────────────────────┘
                   │ HTTP / REST
┌──────────────────▼──────────────────────────┐
│  FastAPI Backend (apps/api)                 │
│  RAG-Anything (multimodal RAG pipeline)     │
│  LightRAG (graph-based retrieval)           │
│  PowerSync JWT token service                │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Storage                                    │
│  ./uploads     — raw uploaded files         │
│  ./rag_storage — LightRAG working directory │
└─────────────────────────────────────────────┘
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| [Bun](https://bun.sh) | 1.x |
| OpenAI API key | — |
| PowerSync instance | — |

---

## Setup

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/easyRAG.git
cd easyRAG
cp .env.example .env
# Edit .env and fill in your OPENAI_API_KEY, POWERSYNC_URL, POWERSYNC_SECRET
```

### 2. Python API

```bash
cd apps/api

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Install dependencies
pip install -e .

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. React Web App

```bash
cd apps/web

# Install dependencies
bun install

# Start the dev server
bun run dev
```

The frontend is available at **http://localhost:5173**.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | — | OpenAI API key for LLM and embeddings |
| `OPENAI_BASE_URL` | ✅ | `https://api.openai.com/v1` | OpenAI-compatible base URL (supports local models) |
| `POWERSYNC_URL` | ✅ | — | Your PowerSync instance URL |
| `POWERSYNC_SECRET` | ✅ | — | Secret used to sign PowerSync JWT tokens |
| `RAG_STORAGE_DIR` | ❌ | `./rag_storage` | Directory for LightRAG graph storage |
| `UPLOAD_DIR` | ❌ | `./uploads` | Directory for raw uploaded files |
| `API_HOST` | ❌ | `0.0.0.0` | Bind host for uvicorn |
| `API_PORT` | ❌ | `8000` | Bind port for uvicorn |
| `CORS_ORIGINS` | ❌ | `http://localhost:5173` | Comma-separated allowed CORS origins |
| `VITE_POWERSYNC_URL` | ✅ (frontend) | — | PowerSync URL exposed to the Vite frontend |

> Set `VITE_POWERSYNC_URL` in `apps/web/.env` (or `apps/web/.env.local`).

---

## Usage

### Uploading Documents

1. Navigate to **Upload** in the top navigation.
2. Drag & drop files or click to browse.
3. Supported formats: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.txt`, `.md`.
4. Each file is uploaded to the API, saved to `UPLOAD_DIR`, and processed by RAG-Anything.

### Selecting a Specialist

1. Navigate to **Home / Chat**.
2. Choose a specialist role from the grid at the top (e.g., Cardiologist, Neurologist).
3. The selected specialist persona is sent with every query so the LLM answers in context.

### Querying

1. Type a medical question in the chat input.
2. The system queries LightRAG using `hybrid` mode by default (combines local entity-level and global graph-level retrieval).
3. The answer is displayed alongside source citations from your uploaded documents.

### Query Modes

| Mode | Description |
|------|-------------|
| `naive` | Simple vector similarity search |
| `local` | Entity-level local graph traversal |
| `global` | High-level global graph reasoning |
| `hybrid` | Combines local + global (recommended) |

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/documents` | Upload & process a document |
| `GET` | `/api/documents` | List processed documents |
| `DELETE` | `/api/documents/{doc_id}` | Remove a document |
| `POST` | `/api/query` | Query the RAG system |
| `GET` | `/api/query/modes` | List available query modes |
| `GET` | `/api/specialists` | List medical specialist roles |
| `GET` | `/api/powersync/token` | Generate PowerSync JWT token |

---

## License

MIT
