# [Client Side RAG](https://github.com/europanite/client_side_rag "Client Side RAG")

[![CI](https://github.com/europanite/client_side_rag/actions/workflows/ci.yml/badge.svg)](https://github.com/europanite/client_side_rag/actions/workflows/ci.yml)
[![docker](https://github.com/europanite/client_side_rag/actions/workflows/docker.yml/badge.svg)](https://github.com/europanite/client_side_rag/actions/workflows/docker.yml)
[![GitHub Pages](https://github.com/europanite/client_side_rag/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/europanite/client_side_rag/actions/workflows/deploy-pages.yml)

!["web_ui"](./assets/images/web_ui.png)

[PlayGround](https://europanite.github.io/client_side_rag/)

Client-side, browser-based Retrieval-Augmented Generation (RAG) playground.

Everything runs in the browser using Expo / React Native for Web with an optional local LLM powered by WebLLM (WebGPU). No custom backend service is required; the RAG index is served as static JSON. 

---

## Features

- ⚡ **Pure client-side RAG**
  - Retrieval runs entirely in the browser against a static JSON index (`corpus_chunks.json` and optional `corpus_embeddings.json`). 
- 🤖 **Optional local LLM via WebLLM**
  - If WebGPU is available, the app initializes WebLLM in the browser and uses it to generate answers conditioned on retrieved context.
  - If initialization fails or WebGPU is missing, the UI switches to a fallback mode and shows only retrieved chunks. :contentReference[oaicite:4]{index=4}
- 📦 **Static hosting on GitHub Pages**
  - The app is built with `expo export -p web` and published as static assets. :contentReference[oaicite:5]{index=5}
- 🐳 **Docker-first local workflow**
  - `docker-compose.yml` and `docker-compose.test.yml` are provided for consistent local runs and tests. 
- ✅ **Jest tests & CI**
  - GitHub Actions workflows run Jest tests, export the web build, run Docker-based tests, and deploy Pages. 
- 🔐 **No custom backend**
  - There is no application server: only static hosting. Any API base env vars are for compatibility with other setups.

---

## RAG Data

The RAG corpus lives under:

frontend/app/public/rag/corpus_chunks.json

optionally, frontend/app/public/rag/corpus_embeddings.json

corpus_chunks.json

This is a JSON array of chunks:
```json
[
  {
    "id": "doc1",
    "text": "This project is a client-side RAG playground. It runs on React Native for Web and GitHub Pages without any backend.",
    "source": "README"
  },
  {
    "id": "doc2",
    "text": "RAG stands for Retrieval Augmented Generation. The app retrieves relevant chunks from local JSON files and optionally uses a local LLM.",
    "source": "docs"
  }
]
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Docker Compose](https://docs.docker.com/compose/)

### 2. Build and start all services:

```bash
# set environment variables:
export REACT_NATIVE_PACKAGER_HOSTNAME=${YOUR_HOST}

# Build the image
docker compose build

# Run the container
docker compose up
```

### 3. Test:
```bash
docker compose \
-f docker-compose.test.yml up \
--build --exit-code-from \
frontend_test
```

---

# License
- Apache License 2.0