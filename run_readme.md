# TaiseChat Run Guide

TaiseChat is currently a LibreChat v0.8.5 fork in the `TaiseChat/` directory. Most package names, Docker image names, container names, and default UI strings still say `LibreChat`, so this guide calls out where to override the visible local app name.

## What Was Reviewed

- `TaiseChat/package.json` is an npm workspaces monorepo.
- The backend runs on `http://localhost:3080` by default.
- The Vite frontend dev server runs on `http://localhost:3090` by default and proxies `/api` and `/oauth` to the backend.
- `npm run backend` and `npm run backend:dev` expect the React client to have been built at least once because the backend reads `client/dist/index.html`.
- `docker-compose.yml` starts the app, MongoDB, Meilisearch, pgvector, and the RAG API.
- `taise-external-docker-compose.yml` starts only MongoDB, Meilisearch, pgvector, and the RAG API so you can run the app code locally with npm.
- Docker uses upstream LibreChat images by default unless you add a local build override.

## Prerequisites

Install these before running locally:

- Node.js `20.19.0+`, `22.12.0+`, or newer.
- npm. The repo declares `npm@11.10.0`.
- MongoDB for native local runs.
- Docker and Docker Compose for Docker runs.

All commands below assume you start from the workspace root:

```bash
cd TaiseChat
```

## Environment Setup

Create the local env file:

```bash
cp .env.example .env
```

Edit `.env` before starting the app.

For a simple single-server local run on port `3080`, keep:

```env
HOST=localhost
PORT=3080
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
APP_TITLE=TaiseChat
```

For split frontend/backend development, use:

```env
HOST=localhost
PORT=3080
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
DOMAIN_CLIENT=http://localhost:3090
DOMAIN_SERVER=http://localhost:3080
APP_TITLE=TaiseChat
```

Replace the example secrets before sharing or deploying this environment:

```env
JWT_SECRET=<random-64-hex-string>
JWT_REFRESH_SECRET=<random-64-hex-string>
CREDS_KEY=<random-64-hex-string>
CREDS_IV=<random-32-hex-string>
MEILI_MASTER_KEY=<random-secret>
```

Helpful generator commands:

```bash
openssl rand -hex 32
openssl rand -hex 16
```

Add at least one AI provider key, or keep the `user_provided` values if you want users to enter their own provider keys in the UI:

```env
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_KEY=...
```

Optional custom app config:

```bash
cp librechat.example.yaml librechat.yaml
```

The backend automatically looks for `librechat.yaml` in `TaiseChat/`. You can also point to another config with `CONFIG_PATH=/path/to/config.yaml`.

## Run Locally

Install dependencies:

```bash
npm ci
```

Start MongoDB. Use your local MongoDB service, or run MongoDB with Docker:

```bash
docker run --name taisechat-mongodb -p 27017:27017 -v taisechat-mongodb:/data/db -d mongo:8.0.20 mongod --noauth
```

If you want message/conversation search locally, run Meilisearch too. Set `MEILI_HOST=http://127.0.0.1:7700` in `.env`, and use the same `MEILI_MASTER_KEY` value in both `.env` and the Docker command:

```bash
docker run --name taisechat-meilisearch -p 7700:7700 -e MEILI_MASTER_KEY=change-this-value -e MEILI_NO_ANALYTICS=true -v taisechat-meili:/meili_data -d getmeili/meilisearch:v1.35.1
```

Build the app once:

```bash
npm run frontend
```

Start the backend:

```bash
npm run backend
```

Open:

```text
http://localhost:3080
```

## Local Development With Hot Reload

After `npm ci` and the one-time `npm run frontend` build, start the backend watcher in one terminal:

```bash
npm run backend:dev
```

Start the Vite frontend in another terminal:

```bash
npm run frontend:dev
```

Open:

```text
http://localhost:3090
```

The frontend dev server proxies API calls to the backend on `3080`. If you changed the backend port, start Vite with `BACKEND_PORT=<backend-port>`.

## Run App Locally With External Services In Docker

Use this setup when you want MongoDB, Meilisearch, pgvector, and the RAG API in Docker, but want to run the TaiseChat app code directly from this checkout with `npm`.

Set these values in `.env`:

```env
HOST=localhost
PORT=3080
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat
MEILI_HOST=http://127.0.0.1:7700
RAG_PORT=8000
RAG_API_URL=http://127.0.0.1:8000
DOMAIN_CLIENT=http://localhost:3090
DOMAIN_SERVER=http://localhost:3080
APP_TITLE=TaiseChat
```

For a single-server local run, set both `DOMAIN_CLIENT` and `DOMAIN_SERVER` to `http://localhost:3080` instead.

If Docker bind-mounted files are owned by the wrong user, also set:

```env
UID=1000
GID=1000
```

Use your real Linux user/group IDs if needed:

```bash
id -u
id -g
```

Create the bind-mounted data directories:

```bash
mkdir -p data-node meili_data_v1.35.1
```

Start only the external services:

```bash
docker compose -f taise-external-docker-compose.yml up -d
```

Watch logs:

```bash
docker compose -f taise-external-docker-compose.yml logs -f
```

Install app dependencies if this is your first local run, or if dependencies changed:

```bash
npm ci
```

Then run the app locally. Build the frontend once:

```bash
npm run frontend
```

Wait for this command to finish successfully before starting the dev servers. It builds the shared workspace packages that the backend and frontend import from `dist/`, such as `@librechat/data-schemas`, `@librechat/api`, and `@librechat/client`.

Start the backend watcher:

```bash
npm run backend:dev
```

For split frontend/backend development, start the Vite frontend in a second terminal:

```bash
npm run frontend:dev
```

Open:

```text
http://localhost:3090
```

Stop only the external services:

```bash
docker compose -f taise-external-docker-compose.yml down
```

-------------------------------------------------------
## Run With Docker

Create and edit `.env` first if you have not already:

```bash
cp .env.example .env
```

For Docker, set these values in `.env`:

```env
HOST=localhost
PORT=3080
DOMAIN_CLIENT=http://localhost:3080
DOMAIN_SERVER=http://localhost:3080
APP_TITLE=TaiseChat
UID=1000
GID=1000
```

Use your real Linux user/group IDs if they are not `1000`:

```bash
id -u
id -g
```

The Docker Compose file overrides `MONGO_URI`, `MEILI_HOST`, and `RAG_API_URL` for the containers, so you do not need to change those for the default Docker setup.

Create the bind-mounted data directories:

```bash
mkdir -p images uploads logs data-node meili_data_v1.35.1
```

Start the stack:

```bash
docker compose up -d
```

Watch logs:

```bash
docker compose logs -f api
```

Open:

```text
http://localhost:3080
```

Stop the stack:

```bash
docker compose down
```

Remove Docker-managed volumes as well:

```bash
docker compose down -v
```

## Build The Forked Image Locally

By default, `docker-compose.yml` runs upstream LibreChat images. To build the local TaiseChat fork, create `docker-compose.override.yml`:

```yaml
services:
  api:
    image: taisechat
    build:
      context: .
      target: node
```

Then run:

```bash
docker compose up -d --build
```

This uses the local `Dockerfile` and still starts MongoDB, Meilisearch, pgvector, and RAG API from Compose.

## Optional RAG API For Native Local Runs

The external-services Compose file above already includes RAG. If you only want to start pgvector and the RAG API, add these values to `.env` first:

```env
RAG_PORT=8000
RAG_API_URL=http://localhost:8000
```

Then start only the RAG services:

```bash
docker compose -f rag.yml up -d
```

## Useful Commands

```bash
npm run backend
npm run backend:dev
npm run frontend
npm run frontend:dev
npm run build
npm run test:all
npm run create-user -- user@example.com "User Name" username
```

## Troubleshooting

If the backend fails with a missing `client/dist/index.html`, run:

```bash
npm run frontend
```

If Docker writes permission errors to `images`, `uploads`, `logs`, `data-node`, or `meili_data_v1.35.1`, set `UID` and `GID` in `.env` to match your host user and restart the stack.

If port `3080` is already in use, change `PORT` and update `DOMAIN_CLIENT` and `DOMAIN_SERVER` to the same port for the single-server run.

If Meilisearch is not running during a native local run, either start it or remove/comment `MEILI_HOST` and `MEILI_MASTER_KEY` in `.env` to avoid search startup warnings.

If the frontend dev server tries to use port `3080`, make sure `PORT=3080` is not exported in your shell before running `npm run frontend:dev`; Vite should default to `3090`.

## Branding Notes For The Fork

For a quick visible rebrand, set:

```env
APP_TITLE=TaiseChat
```

The deeper fork still references LibreChat in `package.json`, Docker container names, `README.md`, Compose image names, and default examples. That is fine for running locally, but those should be reviewed before publishing TaiseChat as a separate product.
