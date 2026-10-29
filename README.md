# Google Stax

[![GitHub Release](https://img.shields.io/github/v/release/google/stax?include_prereleases&style=flat-square)](https://github.com/google/stax/releases)
[![CI Build Status](https://img.shields.io/github/actions/workflow/status/google/stax/ci.yml?branch=main&style=flat-square)](https://github.com/google/stax/actions)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/1234/badge)](https://www.bestpractices.dev/projects/1234)

**Google Stax** (formerly Evaluable AI) is a specialized platform for evaluating and scaling AI/ML applications. It provides developers with the tools to bootstrap infrastructure, manage evaluation workflows via Pub/Sub, and visualize performance metrics through a modern web interface.

---

## ☁️ 1. Cloudflare (this fork)

This fork runs entirely on Cloudflare. The Spring Boot server is replaced by a TypeScript Worker in
`api/` (Hono + D1 + Queues + R2) that serves the same HTTP API, and the Next.js app runs on Workers
through OpenNext. `server/` is kept only as the reference implementation and as the source of the
D1 schema (`api/migrations` is generated from its Liquibase changelog).

| Spring / GCP | Cloudflare |
|---|---|
| Spring Boot on Cloud Run | `stax-api` Worker (`api/`) |
| MySQL / Cloud SQL + Liquibase | D1 database `stax` (`api/migrations`) |
| Pub/Sub topics | Queue `stax-jobs` (+ `stax-jobs-dlq`) |
| Cloud Storage | R2 bucket `stax-files` |
| `@Scheduled` monitoring | Cron trigger on `stax-api` |
| Next.js on Cloud Run | `stax-web` Worker (`frontend/`, OpenNext), calls `stax-api` via a service binding |

### Local development
```bash
cd api && npm install && cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply stax --local
npm run dev                      # http://localhost:8787

cd ../frontend && npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8787 npm run dev   # http://localhost:3000
```

### Deploying
One-time setup: `wrangler d1 create stax` (put the id in `api/wrangler.jsonc`),
`wrangler r2 bucket create stax-files`, `wrangler queues create stax-jobs` and `stax-jobs-dlq`,
then set the API secrets with `wrangler secret put` in `api/` (`AES_SECRET_KEY` (32 chars),
`TOKEN_SIGNING_KEY`, `TOS_TOKEN_SIGNING_KEY` (base64), and for Google sign-in
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, with `AUTH_ENABLED=true`).

```bash
cd api && npx wrangler d1 migrations apply stax --remote && npm run deploy
cd ../frontend && npm run deploy
```

GitHub Actions (`.github/workflows/cloudflare.yml`) type-checks and builds every PR and deploys both
Workers on pushes to `main`. It needs the repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

---

## ⚙️ 2. Original Backend Server (Spring Boot, reference only)

The backend handles the core evaluation logic and integrates with the GCP Pub/Sub emulator for local development.

### Manual Prerequisites
* JDK 17+, Maven 3.9.6+, MySQL 8.x.

### Local Setup & Execution
1.  **Configure Environment:**
    ```bash
    cd server
    export AES_SECRET_KEY=defaultaessecret
    export TOKEN_SIGNING_KEY=default_token_signing_key
    export JDBC_DATABASE_URL="jdbc:mysql://localhost:3306/stax_db"
    export PROFILE_ACTIVE=local
    export GCP_PROJECT_ID=test
    ```
2.  **Run Pub/Sub Emulator:**
    ```bash
    gcloud components install beta pubsub-emulator
    gcloud beta emulators pubsub start --host-port=localhost:8085
    ```
3.  **Build & Run:**
    ```bash
    mvn clean install
    mvn spring-boot:run
    ```
    *App starts at `http://localhost:8080`.*

---

## 🖥️ 3. Frontend Application (Next.js)

A React-based UI built with Mantine and Tailwind CSS for interacting with the Stax platform.

### Setup & Execution
1.  **Install Dependencies:**
    ```bash
    cd frontend
    npm install
    ```
2.  **Environment Configuration:**
    * Copy `.env.template` to `.env.local` and set `NEXT_PUBLIC_API_BASE_URL` (e.g. `http://localhost:8080`) and `NEXT_PUBLIC_APP_BASE_URL` (e.g. `http://localhost:3000`).
    * Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` if using authentication.
3.  **Run Development Server:**
    ```bash
    npm run dev
    ```
    *Access the dashboard at `http://localhost:3000`.*

### Quality Control
* **Test:** `npm run test`
* **Lint:** `npm run lint:check`
* **Git Hooks:** `npm run githooks:init` (enforces quality on commit)

---

## 📂 Project Structure

```text
├── api/               # Cloudflare Worker API (Hono, D1, Queues, R2)
│   ├── migrations/    # D1 schema + seed data (generated from server/ Liquibase)
│   └── src/           # Port of the Spring Boot server, see api/PORTING.md
├── server/            # Original Spring Boot Java Server (reference)
│   └── src/           # Evaluation logic and API routes
└── frontend/          # Next.js & React Web App
    ├── app/           # App routes and page components
    └── components/    # Reusable UI components