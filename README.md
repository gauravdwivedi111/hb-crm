# HB CRM - Production-Ready Monorepo

Enterprise-grade Customer Relationship Management (CRM) platform foundation engineered for 10 concurrent users with strict security, full TypeScript type safety, PostgreSQL + Prisma ORM, and a responsive Tailwind CSS interface.

---

## 📁 Repository Structure

```text
hb-crm/
├── .github/
│   └── workflows/
│       └── ci.yml               # CI pipeline for linting & typechecking
├── backend/
│   ├── prisma/
│   │   └── schema.prisma        # PostgreSQL datasource & Prisma client generator
│   ├── src/
│   │   ├── config/              # Typed environment variable loader
│   │   ├── controllers/         # Request handlers (includes health check)
│   │   ├── middleware/          # Global error handling and security middlewares
│   │   ├── prisma/              # PrismaClient singleton instance
│   │   ├── routes/              # Express route declarations
│   │   ├── services/            # Business logic and entity services (ready for models)
│   │   ├── utils/               # Utility functions and helpers
│   │   ├── app.ts               # Express app bootstrap & middleware configuration
│   │   └── server.ts            # Server entrypoint and graceful shutdown listeners
│   ├── .env.example             # Backend environment template
│   ├── eslint.config.mjs        # Strict ESLint configuration
│   ├── package.json             # Backend dependencies & scripts
│   └── tsconfig.json            # Strict TypeScript configuration
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI component library
│   │   ├── context/             # Global React state and context providers
│   │   ├── hooks/               # Custom React hooks
│   │   ├── pages/               # Application view pages (HomePage placeholder)
│   │   ├── services/            # API client service layer
│   │   ├── App.tsx              # Root component with React Router
│   │   ├── index.css            # Tailwind CSS directives
│   │   └── main.tsx             # Frontend DOM entrypoint
│   ├── .env.example             # Frontend environment template
│   ├── eslint.config.mjs        # Frontend ESLint configuration
│   ├── index.html               # Vite HTML shell
│   ├── package.json             # Frontend dependencies & scripts
│   ├── postcss.config.js        # PostCSS configuration
│   ├── tailwind.config.js       # Tailwind CSS theme configuration
│   ├── tsconfig.json            # Strict TypeScript configuration
│   └── vite.config.ts           # Vite bundler configuration
├── .gitignore                   # Ignores node_modules, build/dist, .env, and OS files
├── package.json                 # Monorepo workspaces & aggregated scripts
└── README.md                    # Setup and developer documentation
```

---

## 🛠️ Prerequisites

- **Node.js**: `v20.x` or `v22.x` (tested on `v22.22.1`)
- **npm**: `v10.x`+
- **PostgreSQL**: PostgreSQL 14+ instance (local or hosted e.g. Supabase, Neon, AWS RDS)

---

## 🚀 Quick Start (Local Setup)

### 1. Install Dependencies
Install all workspace dependencies in one command from the project root:

```bash
npm install
```

### 2. Configure Environment Variables

**Backend:**
Copy `.env.example` to `.env` in the `backend/` directory:

```bash
# Windows PowerShell
Copy-Item backend/.env.example backend/.env

# macOS / Linux / Git Bash
cp backend/.env.example backend/.env
```

Update `backend/.env` with your PostgreSQL connection string:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hbcrm?schema=public"
CLIENT_ORIGIN=http://localhost:5173
```

**Frontend:**
Copy `.env.example` to `.env` in the `frontend/` directory:

```bash
# Windows PowerShell
Copy-Item frontend/.env.example frontend/.env

# macOS / Linux / Git Bash
cp frontend/.env.example frontend/.env
```

Defaults to `VITE_API_URL=http://localhost:5000`.

---

## 💻 Running the Applications

### Option A: Run Both Together (Concurrently)
From the root folder:

```bash
npm run dev
```

### Option B: Run Individually in Separate Terminals

**Terminal 1: Start Backend**
```bash
npm run dev:backend
```
*Backend server will start at: `http://localhost:5000`*

**Terminal 2: Start Frontend**
```bash
npm run dev:frontend
```
*Frontend dev server will start at: `http://localhost:5173`*

---

## 🔍 Verification & Health Check

### Test Backend Health Endpoint
With the backend running, send a GET request:

```bash
# Using curl:
curl http://localhost:5000/health

# Expected response:
{"status":"ok"}
```

Alternatively, open your browser to `http://localhost:5173` and click the **"Check /health"** button on the Home Page to test end-to-end connectivity.

---

## 🧪 Quality & CI Commands

Run all quality checks from the project root:

| Command | Description |
| :--- | :--- |
| `npm run typecheck` | Strict TypeScript validation across backend and frontend |
| `npm run lint` | ESLint checks across backend and frontend |
| `npm run build` | Compiles backend to `backend/dist` and frontend to `frontend/dist` |
| `npm run dev` | Runs backend (`tsx watch`) and frontend (`vite`) concurrently |

---

## 🔒 Security Baseline

- Strict TypeScript settings enabled across the monorepo (`noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`).
- CORS configured with configurable origin whitelist and trailing slash normalization.
- Centralized error handler preventing internal stack trace exposure in production (`NODE_ENV=production`).
- Environment variables isolated with `.gitignore` preventing accidental leaks.
- Zero-delay user session invalidation via in-memory cache and atomic refresh token revocation.
- Immutable PostgreSQL append-only audit trail triggers on `Activity`, `StatusHistory`, and `AuditLog`.

---

## 🚀 Production Deployment Checklist

Follow these manual steps when deploying HB CRM to production for the first time:

> [!NOTE]
> **Attachment & File Upload Feature**: The secure file attachment feature is fully implemented in the backend services, API endpoints, and database schema, but is currently **disabled in the frontend UI** for this deployment pending future Cloudflare R2 / AWS S3 object storage provisioning. As a result, **no S3/R2 credentials are required** for this deployment, and startup validation will not block server boot without them. When ready to activate in the future, configure object storage credentials and set `ENABLE_ATTACHMENTS=true`.

### 1. Provision Cloud PostgreSQL Database
- Provision a managed PostgreSQL 14+ database (e.g. **Supabase**, **Neon**, **AWS RDS**, **Railway**, **Render**).
- Copy the full connection string and ensure SSL is enforced by appending `?sslmode=require`:
  ```text
  postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public&sslmode=require
  ```

### 2. Generate Strong Cryptographic Secrets
- Generate a cryptographically secure 64-character hex secret for `JWT_ACCESS_SECRET`:
  ```bash
  openssl rand -hex 32
  ```
- *Never commit this secret or reuse secrets across development and production.*

### 3. Configure Platform Environment Variables
Set the following environment variables on your hosting provider (Railway, Render, AWS ECS, Fly.io, etc.):

#### Backend Service Environment Variables:
| Variable | Description / Example |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://...&sslmode=require` |
| `FRONTEND_URL` | `https://app.yourclient.com` (no trailing slash) |
| `JWT_ACCESS_SECRET` | 64-char hex string generated in Step 2 |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` |
| `COOKIE_SAME_SITE` | `none` (required when frontend & backend have different domains) |
| `ENABLE_ATTACHMENTS` | `false` *(Optional - set to `true` when S3/R2 storage is provisioned)* |
| `S3_BUCKET_NAME` | *(Optional pending storage setup)* e.g. `hb-crm-attachments` |
| `S3_REGION` | *(Optional pending storage setup)* e.g. `auto` (R2) or `ap-south-1` (AWS) |
| `S3_ENDPOINT` | *(Optional pending storage setup)* e.g. `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | *(Optional pending storage setup)* Storage Access Key ID |
| `S3_SECRET_ACCESS_KEY`| *(Optional pending storage setup)* Storage Secret Access Key |
| `RESEND_API_KEY` | Resend API key for email notifications |
| `EMAIL_FROM_ADDRESS` | `HB CRM <notifications@yourdomain.com>` |
| `TIMEZONE` | `Asia/Kolkata` (or client's local IANA timezone) |
| `SEED_ADMIN_EMAIL` | `admin@yourclient.com` |
| `SEED_ADMIN_PASSWORD` | Strong password for initial admin account |
| `SEED_ADMIN_NAME` | `System Administrator` |

#### Frontend Service Environment Variables:
| Variable | Description / Example |
| :--- | :--- |
| `VITE_API_URL` | `https://api.yourclient.com` (no trailing slash) |

### 4. Automated Migrations & Initial Admin Seeding
1. **Automated Migrations**:
   The production backend start command (`npm start`) automatically runs `scripts/start-production.js`, which executes `npx prisma migrate deploy` before launching `dist/server.js`. If any migration fails, startup aborts immediately.
2. **Initial Admin Account**:
   The first time the database is migrated, provision the root Administrator account by running the seed command once via your deployment console or CLI:
   ```bash
   npm run seed --workspace=backend
   ```
   *Verify that you can log into `https://app.yourclient.com` with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.*

### 5. Verify Production Protections
- Confirm `GET https://api.yourclient.com/health` returns `{"status":"ok"}`.
- Confirm `X-Powered-By` header is absent in all responses.
- Verify that `refreshToken` cookie is set with `Secure`, `HttpOnly`, and `SameSite=None`.
- Verify that unhandled server errors return `{"status":"error","message":"Internal server error"}` with stack traces completely stripped.

