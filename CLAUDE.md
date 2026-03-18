# CLAUDE.md — AI Assistant Guide for easyRAG

## Project Overview

**easyRAG** is a Retrieval-Augmented Generation (RAG) system focused on document uploading and categorization, built during a PowerSync hackathon. The project is in early-stage development — the repository currently contains only foundational scaffolding with no implementation code yet committed.

**Key goal:** An improved RAG pipeline for ingesting, categorizing, and querying documents.

---

## Repository State (as of March 2026)

```
easyRAG/
├── README.md      # Minimal placeholder: "# easyRAG\npowersync hackathon"
└── CLAUDE.md      # This file
```

No source code, dependencies, tests, or configuration files exist yet. The project is in planning/setup phase.

---

## Development Branch

When contributing, always work on the correct feature branch. The current conventions:

- Main stable branch: `master`
- Feature branches: follow `claude/<description>-<id>` pattern for AI-assisted branches
- Never push directly to `master` or `main` without a pull request

---

## Intended Architecture (from PR history)

Based on commit messages and PR #1, the system aims to implement:

1. **Document uploading** — Accept various document formats (PDF, text, etc.)
2. **Categorization** — Automatically classify/tag uploaded documents
3. **RAG pipeline** — Index documents and enable semantic search/retrieval
4. **PowerSync integration** — Real-time sync capabilities for the document store

When implementing, prefer:
- A clear separation between ingestion, indexing, and retrieval layers
- Modular design so individual pipeline stages can be swapped or extended
- Lightweight dependencies where possible (this is a hackathon project)

---

## Development Workflows

### Setting Up (once dependencies are added)

```bash
# Clone the repo
git clone <repo-url>
cd easyRAG

# Install dependencies (update this section when a package manager is chosen)
# e.g., pip install -r requirements.txt  OR  npm install

# Copy and configure environment
cp .env.example .env  # fill in API keys, DB URLs, etc.
```

### Running the Application

```bash
# Update this section once an entry point exists
# e.g., python main.py  OR  npm run dev
```

### Running Tests

```bash
# Update this section once tests are added
# e.g., pytest  OR  npm test
```

### Git Workflow

```bash
# Create a feature branch
git checkout -b feature/your-feature-name

# Commit with descriptive messages
git add <files>
git commit -m "feat: short description of what was done"

# Push and open a PR
git push -u origin feature/your-feature-name
```

---

## Conventions for AI Assistants

### What to do

- **Read before editing** — Always read existing files before modifying them.
- **Minimal changes** — Only change what is requested; avoid refactoring unrelated code.
- **No speculative features** — Don't add logging, error handling, or abstractions that aren't needed yet.
- **No new files without reason** — Prefer editing existing files over creating new ones.
- **Descriptive commits** — Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

### What to avoid

- Do not push to `master`/`main` directly.
- Do not delete or overwrite files without confirming with the user.
- Do not introduce secrets, API keys, or credentials into committed files.
- Do not add emoji to code comments or documentation unless explicitly requested.

### Technology choices (TBD)

The stack has not been finalized. When the user specifies a language/framework, update this section. Likely candidates given the hackathon context:

- **Language:** Python (common for RAG/ML pipelines) or TypeScript/Node.js
- **Vector store:** Likely a lightweight option (e.g., FAISS, Chroma, pgvector)
- **LLM / embeddings:** To be determined (OpenAI, Anthropic, or open-source)
- **PowerSync:** Real-time offline-first sync layer — see [PowerSync docs](https://docs.powersync.com)

Update this file as the stack solidifies.

---

## Key Contacts / Context

- **Repo owner:** HarryBMa
- **Origin:** PowerSync hackathon project
- **PR #1:** "[WIP] Add improved RAG system for document uploading and categorization"

---

## Updating This File

Keep CLAUDE.md current as the project grows:

- Add new sections when major components are implemented (API routes, DB schema, auth, etc.)
- Update the directory tree whenever the structure changes significantly
- Document any non-obvious conventions or gotchas discovered during development
