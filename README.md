# RAG Log Assistant

A local web app, API, and CLI for natural-language log analysis over Elasticsearch.

## Layout

```text
src/
  cli/         CLI entrypoint
  config/      Environment and runtime config
  scripts/     Project scripts such as seeding
  server/      HTTP server and static app hosting
  services/    Retrieval, Elasticsearch, RAG, and LLM logic
public/        Browser UI
tests/         Node tests
docs/          Setup and operations guides
scripts/       Helper shell/batch scripts
```

## Commands

```bash
powershell -ExecutionPolicy Bypass -File scripts/windows/start_elasticsearch.ps1
npm.cmd run seed
npm.cmd run dev
npm.cmd start -- "Why are payment services failing?"
node --test --test-isolation=none
```

## Required environment

Copy `.env.example` to `.env`.

```bash
OPENAI_API_KEY=...
ELASTIC_URL=http://localhost:9200
ELASTIC_AUTH_MODE=auto
ELASTIC_API_KEY=
ELASTIC_INDEX=logs
```

`ELASTIC_AUTH_MODE` supports:

- `auto`: use API key if present, otherwise connect without auth
- `api_key`: require `ELASTIC_API_KEY`
- `none`: always connect without auth

## Windows local run

Use the repo helper to start Elasticsearch. It keeps the demo self-contained by writing data and logs under `.runtime/elasticsearch` instead of the Elasticsearch install folder.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/start_elasticsearch.ps1
npm.cmd run seed
npm.cmd run dev
```

Open `http://localhost:3000` after the server starts.

If PowerShell blocks `npm`, use `npm.cmd` instead of `npm`.

Sample queries for the seeded Kibana-style dataset:

```text
Show validation errors for subscriber 89661
What failed in NotificationPayloadProcessorService?
Any timeout issues for subscriber 33218?
Why is subscriber 44770 failing in eCCCloudService?
```

Optional field mapping:

```bash
LOG_MESSAGE_FIELD=message
LOG_SERVICE_FIELD=service
LOG_LEVEL_FIELD=level
LOG_TIMESTAMP_FIELD=timestamp
LOG_SUBSCRIBER_FIELD=subscriberId
PORT=3000
TOP_K=12
```

## API

- `GET /api/health`
- `POST /api/retrieve`
- `POST /api/ask`

`/api/health` now separates:

- config validity
- Elasticsearch cluster connectivity
- target index readiness

That means local no-auth Elasticsearch can pass health checks without forcing an API key, while missing or unavailable indices are reported as `degraded` instead of looking like total app failure.

## Docs

- [Elasticsearch setup](docs/ELASTICSEARCH_SETUP.md)
- [Manual setup](docs/MANUAL_SETUP.md)
- [Quickstart](docs/QUICKSTART.md)
- [2GB guide](docs/SETUP_2GB_GUIDE.md)
