# Mike

Open-source release containing the Mike frontend and backend.

## Contents

- `frontend/` - Next.js application
- `backend/` - Express API, Supabase access, document processing, and database schema
- `backend/schema.sql` - Supabase schema for fresh databases

## Setup

Install dependencies:

```bash
npm install --prefix backend
npm install --prefix frontend
```

Create local env files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Run `backend/schema.sql` in the Supabase SQL editor for a fresh database.

Start the backend:

```bash
npm run dev --prefix backend
```

Start the frontend:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:3000`.

## Required Services

- Supabase Auth and Postgres
- S3-compatible object storage, such as Cloudflare R2
- At least one supported model provider key, depending on which models you enable
- LibreOffice for DOC/DOCX to PDF conversion

## Self-Hosted Local LLMs

Self-hosted deployments can expose a server-configured local model through an
OpenAI-compatible `/v1/chat/completions` endpoint. The backend calls this
endpoint directly; the browser only sees a selectable `local:server` model.

Ollama example:

```env
ENABLE_LOCAL_LLM=true
LOCAL_LLM_BASE_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_LABEL=Local Llama 3.1
LOCAL_LLM_SUPPORTS_TOOLS=false
```

LM Studio example:

```env
ENABLE_LOCAL_LLM=true
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=<model-id-from-lm-studio>
LOCAL_LLM_LABEL=LM Studio Local Model
LOCAL_LLM_SUPPORTS_TOOLS=false
```

Local mode is configured by backend environment variables, not normal user
account settings. Mike does not automatically fall back to cloud models when
`local:server` is selected. Tool-dependent workflows such as document editing,
DOCX generation, workflows, and tabular review extraction stay gated unless
local tool support is explicitly enabled and tested for the selected runtime.

## Checks

```bash
npm test --prefix backend
npm run build --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```

## License

AGPL-3.0-only. See `LICENSE`.
