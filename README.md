# TAISE

**TAISE** is a safe AI search and chat product for everyone. It gives users one trusted place to ask questions, compare answers from leading AI providers, and receive clear responses with a built-in safety layer.

This repository contains **TaiseChat**, the TAISE chat application forked from LibreChat to speed up development while the TAISE product layers are added on top.

## Product Goal

TAISE is designed to make AI answers easier to trust:

- Give users one clear answer instead of making them compare several AI tools manually.
- Support multiple AI providers so the product can route, compare, or fall back between models.
- Add safety checks before and after responses, especially for harmful, unsafe, or age-sensitive requests.
- Keep conversations organized with history, search, files, agents, and reusable prompts.
- Prepare for family safety features such as junior accounts, parental approval, summaries, and sensitive-query alerts.

## Core Capabilities

- Multi-provider AI chat with OpenAI, Anthropic, Google, Azure, custom endpoints, and other compatible providers.
- Agents, tools, MCP servers, file search, web search, code execution, artifacts, image generation, and conversation branching inherited from the LibreChat foundation.
- Multi-user authentication, sharing controls, permissions, and configurable interface settings.
- Streaming responses, resumable streams, conversation import/export, and message search.
- TAISE product branding, safety-focused copy, and a roadmap toward child-safe and family-aware experiences.

## Technical Foundation

TaiseChat is currently based on LibreChat v0.8.5. The fork intentionally keeps many internal package names, workspace imports, config filenames, and deployment contracts compatible with LibreChat, including names such as `@librechat/client`, `librechat-data-provider`, and `librechat.yaml`.

That compatibility is intentional for now: it keeps upstream architecture, build tooling, and package boundaries stable while TAISE-specific product behavior is layered in.

## Taise Model Policy

TaiseChat includes an isolated in-process Taise model policy service at `api/server/services/Taise`. Enable it with `TAISE_MODEL_POLICY_ENABLED=true` and configure the server-owned fallback order with `TAISE_MODEL_FALLBACKS`, for example `openAI:gpt-5-mini,anthropic:claude-3-5-haiku-20241022,google:gemini-2.5-flash-lite`.

The visible picker is controlled by YAML, not env. Set `interface.modelSelect: false` in `librechat.yaml` to hide model selection while Taise rewrites chat requests to the selected backend route. Image chats use the same fallback list and require a compatible configured route.

## Local Development

Use the run guide for detailed setup:

```bash
cat run_readme.md
```

Common local flow:

```bash
cp .env.example .env
npm ci
npm run frontend
npm run backend
```

For split frontend/backend development:

```bash
npm run backend:dev
npm run frontend:dev
```

The backend defaults to `http://localhost:3080`; the Vite frontend dev server defaults to `http://localhost:3090`.

## Branding Defaults

Visible product surfaces should use **TAISE**.

Technical fork and repository references should use **TaiseChat**.

Internal package names and compatibility filenames should not be renamed unless a deeper repackage effort is planned.

## LibreChat Attribution

TaiseChat is forked from [LibreChat](https://github.com/danny-avila/LibreChat), an open-source, self-hosted AI chat platform. Upstream documentation remains useful for technical configuration of inherited features such as endpoints, agents, MCP, tools, file handling, and deployment.

TAISE product goals, safety posture, branding, and family-focused roadmap are owned by the Taise project.
