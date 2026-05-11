# Mike

Open-source release containing the Mike frontend and backend.

## Contents

- `frontend/` - Next.js application
- `backend/` - Express API, Supabase access, document processing, and database schema
- `backend/schema.sql` - Supabase schema for fresh databases

## Setup

For the simplest local self-hosted run, use Docker:

```bash
cp .env.docker.example .env
docker compose up --build
```

Open `http://localhost:3000`.

This starts the frontend, backend, local Supabase-compatible Auth/PostgREST/Postgres services, MinIO storage, schema setup, and a storage bucket. To reset the local instance:

```bash
docker compose down -v
```

Model access is configured after signup in `Settings -> Models & API Keys`.
Mike supports three common setups:

- Public cloud providers: add Anthropic, Google Gemini, or OpenAI API keys under
  `Public Models`.
- Enterprise managed endpoints: add Microsoft Foundry / Azure OpenAI, or any
  other OpenAI-compatible managed endpoint, under `Managed Models`.
- Local/self-hosted models: add LM Studio, Ollama, or another
  OpenAI-compatible `/v1` runtime under `Managed Models`.

The Docker stack does not install or run a model server by default. You can boot
Mike first, create an account, and then connect whichever model provider your
firm wants to use.

For a model server running on the host machine while Mike runs in Docker, use a
backend-reachable URL such as:

```text
http://host.docker.internal:1234/v1
```

Do not use `127.0.0.1` or `localhost` for host services when the backend runs
inside Docker; that points at the backend container itself.
The Docker compose file maps `host.docker.internal` to the host gateway for
Linux Docker as well as Docker Desktop.

The older server-configured local provider is still available as an optional
default. Most users should prefer `Managed Models` in the UI; use this env-based
mode only when you want the deployment itself to expose one fixed local model to
all users. To show the `Local model` provider in the UI from environment config,
edit `.env` and point these values at any OpenAI-compatible `/v1` endpoint you
self-host:

```env
ENABLE_LOCAL_LLM=true
LOCAL_LLM_BASE_URL=http://host.docker.internal:1234/v1
LOCAL_LLM_MODEL=<model-id>
LOCAL_LLM_LABEL=Local model
LOCAL_LLM_SUPPORTS_TOOLS=false
```

Keep `LOCAL_LLM_SUPPORTS_TOOLS=false` unless that runtime has been explicitly
tested with Mike's tool-calling workflows.

Manual setup is still available for development:

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

## Model Configuration

Mike separates public provider models from managed models.

### Public Models

Public models are configured in `Settings -> Models & API Keys -> Public
Models`. Add the provider key for whichever public catalog you want to use:

- Anthropic for Claude models
- Google Gemini for Gemini models
- OpenAI for public OpenAI models

Public OpenAI keys must be OpenAI platform keys. Microsoft Foundry / Azure
OpenAI keys belong in Managed Models, not in the public OpenAI key field.

### Managed Models

Managed Models are user-configured OpenAI-compatible model endpoints. Each
record has its own display name, provider type, base URL, model/deployment name,
optional API key, enabled state, and capability flags.

Supported managed providers:

- Microsoft Foundry / Azure OpenAI
- Local OpenAI-compatible runtimes such as LM Studio

Foundry example:

```text
Provider: Microsoft Foundry
Display name: MS-FOUNDRY-gpt5mini
Base URL: https://<resource>.openai.azure.com/openai/v1
Model name: gpt-5-mini
API key: paste the Foundry key in the managed model form
Supports streaming: on
Supports tools: on only if the deployment works with OpenAI-style tool calls
Supports reasoning: on only if the deployment supports it
```

LM Studio example when Mike runs in Docker and LM Studio runs on the host:

```text
Provider: Local OpenAI-compatible
Display name: LM Studio
Base URL: http://host.docker.internal:1234/v1
Model name: <model-id-from-lm-studio>
API key: leave blank unless your runtime requires one
Supports streaming: on
Supports tools: off by default
Supports reasoning: off by default
```

Keep local model tools disabled unless you have tested that the selected model
emits valid OpenAI-style tool calls and can continue after tool results. With
tools disabled, normal chat can work, but document-reading and editing workflows
cannot use that model to inspect documents.

Saved managed model API keys are encrypted by the backend and are never returned
to the browser after save.

## Server-Configured Local LLMs

Self-hosted deployments can expose a server-configured local model through an
OpenAI-compatible `/v1/chat/completions` endpoint. The backend calls this
endpoint directly; the browser only sees a selectable `local:server` model.

Managed Models are preferred for normal self-hosting because they let each admin
configure their own endpoint and model in Settings.

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
