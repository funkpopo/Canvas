Canvas Codebase Architecture and Conventions

Goals
- Keep a clean separation of concerns between transport (API/WS), domain services, and presentation (UI).
- Prefer small, focused modules with clear responsibilities.
- Enforce consistent code style and naming to reduce friction across contributors.

Backend (FastAPI)
- Entry: `backend/app/main.py` wires lifespan, CORS, WebSockets, and routers.
- API Routers: `backend/app/api/routes/*` group by Kubernetes resource (pods, nodes, workloads, storage, etc.). Each file contains only request/response glue and input validation.
- Services: `backend/app/services/*` encapsulate interactions with Kubernetes, Helm, DB, and other infrastructure. Business logic lives here, not in routes.
- Models: `backend/app/models/*` define DB tables (SQLAlchemy) for metrics and audit.
- Schemas: `backend/app/schemas/*` define Pydantic models returned/accepted by routes.
- WebSocket: `backend/app/websocket/*` includes a manager and a K8s watcher that fans out events.
- Core/Infra: `backend/app/core/*` provides logging, crypto, and rate-limiting utilities.

Backend Style
- Type hints are required for public APIs in services and routes.
- Avoid blocking I/O inside async functions; offload with `asyncio.to_thread` when calling blocking client libs.
- Route handlers: translate domain tuples to Pydantic models at the edges only.
- Do not import FastAPI/HTTP-specific types in service modules.

Frontend (Next.js, App Router)
- Feature-first structure under `frontend/src`:
  - `features/` for screens and composite UI that embody a workflow (e.g., dashboard, workloads, pods).
  - `shared/` for cross-cutting UI primitives, i18n, and utilities.
  - `lib/` for API clients, query keys, and simple helpers.
  - `app/` contains route definitions and light layout composition; heavy logic belongs in `features/`.
- i18n: All user-facing strings go through `useI18n()` with zh/en dictionaries in `shared/i18n/i18n.ts`.
- React Query: colocate query keys and data fetching in `src/lib/api.ts`; components use `useQuery`/`useMutation` only.
- WebSocket hooks: place under `src/hooks` (e.g., `useDeploymentUpdates`) and avoid direct WS use in pages.

Code Quality Tooling
- Root `.editorconfig` enforces newlines, indentation, and charset across the repo.
- Backend: `ruff` and `mypy` configs live in `backend/`. Run locally:
  - `ruff check backend/app` and `ruff format backend/app`
  - `mypy backend/app`
- Frontend: ESLint Flat config in `frontend/eslint.config.mjs`. Lint via `npm run lint`.
- Optional: Prettier config added in `frontend/` to keep formatting consistent; integrate with your editor.

Naming & Patterns
- API route modules: plural snake_case (e.g., `pods.py`, `nodes.py`).
- Service methods: verb-first, explicit subjects (e.g., `delete_pod`, `iter_pod_logs`, `patch_node_taints`).
- React components: PascalCase files and exports for components; kebab-case route segments under `app/`.
- Avoid cyclic imports by enforcing one-way dependencies: routes -> services -> core/models.

When Adding New Features
- Start with service capability in `app/services`, then expose via a new router function.
- Define request/response models under `app/schemas` when crossing process boundaries.
- Add UI under `src/features/...` and keep pages thin.
- Ensure i18n coverage and RBAC checks where applicable.

