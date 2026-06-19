# Local development

This is the canonical guide for running Oiva locally. The site's "Get Started"
page links here.

> **Directory note:** `.env.example` and `compose.yaml` live at the repo root,
> but the npm scripts (`dev`, `db:migrate`) live in `src/agent/`. Run Docker
> commands from the root and npm commands from `src/agent/`.

## Prerequisites

- Docker (for the OTel Collector and Postgres)
- Node.js

## 1. Configure environment

From the repo root, create your `.env` from the example:

```bash
cp .env.example .env
```

Set the LLM provider API keys required by the configured agent models. Mastra
reads provider-standard environment variables automatically — `openai/...`
models use `OPENAI_API_KEY`, `anthropic/...` models use `ANTHROPIC_API_KEY`,
and `google/...` models use `GOOGLE_API_KEY`.

Give Oiva access to the GitHub repositories that define your observed app by
including a GitHub PAT in `.env`. Public repositories need no permissions. See
[GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token).

## 2. Start infrastructure (OTel Collector + Postgres)

From the repo root:

```bash
docker compose up
```

Local development uses split Postgres variables from `.env`; `DATABASE_URL` is
intentionally unsupported. The compose defaults are:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=oiva
POSTGRES_PASSWORD=oiva_dev
POSTGRES_DB=oiva
```

Reset the database:

```bash
docker compose down -v   # destroys all DB contents
npm run db:migrate       # from src/agent — recreates schema
docker compose up
```

## 3. Install dependencies

```bash
cd src/agent
npm install
```

If you hit errors installing `@mastra/otel-exporter`, retry with
`--legacy-peer-deps`:

```bash
npm install @mastra/otel-exporter --legacy-peer-deps
```

## 4. Run migrations

```bash
# from src/agent
npm run db:migrate
```

## 5. Start the dev server

```bash
# from src/agent
npm run dev
```

Open [http://localhost:4111](http://localhost:4111) for Mastra Studio — an
interactive UI for building and testing agents, plus a local REST API.
