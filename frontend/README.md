# Canvas Frontend

The frontend is built with Next.js App Router and connects to the Go backend through `/api` rewrites.

## Run

```bash
cd frontend
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Configuration (no `.env`)

Frontend runtime settings are stored in:

- `frontend/config/settings.json`

Production example:

- `frontend/config/settings.production.example.json`

Key fields:

- `apiBasePath`: browser-side API prefix (default `/api`)
- `apiProxyTarget`: Next.js rewrite target to backend
- `websocket.url` / `websocket.port`: WebSocket endpoint settings
- `i18n.warnMissingKeys`: whether to warn on missing translation keys

## Useful Scripts

- `npm run dev` — start development server
- `npm run build` — build production bundle
- `npm run start` — start production server
- `npm run type-check` — TypeScript type check
- `npm run lint` — lint and auto-fix
