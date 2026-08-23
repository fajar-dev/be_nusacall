# Hono BE — Backend Boilerplate

API Backend boilerplate dibangun dengan **Hono**, **Bun**, dan **TypeORM**.

---

## Tech Stack

| Kategori       | Library / Tool             |
| -------------- | -------------------------- |
| Runtime        | [Bun](https://bun.sh)      |
| Framework      | [Hono](https://hono.dev)   |
| Database       | MySQL 8+                   |
| ORM            | TypeORM                    |
| Validasi       | Zod + @hono/zod-validator  |
| Auth           | JWT (HS256) via `hono/jwt` |
| Email          | Nodemailer (SMTP)          |
| Object Storage | MinIO                      |
| Proses Manager | PM2                        |

---

## Arsitektur

Proyek ini menggunakan **Clean Architecture** dengan prinsip **SOLID**, **Dependency Injection**, dan **Repository Pattern**.

### Lapisan (Layer)

```
┌──────────────────────────────────────┐
│           Presentation Layer          │
│   Controller → HTTP req/res handler  │
├──────────────────────────────────────┤
│           Application Layer          │
│   Service → Bisnis logik & use case  │
├──────────────────────────────────────┤
│             Domain Layer             │
│   Repository Interface → Kontrak     │
├──────────────────────────────────────┤
│         Infrastructure Layer         │
│   TypeORM Repository → Akses data    │
└──────────────────────────────────────┘
```

### Alur Dependency

```
routes/api.ts
    │
    └─ {module}.module.ts          ← Composition Root (wiring DI)
           ├─ Repository (TypeORM) ← implements Interface
           ├─ Service              ← menerima Interface via constructor
           └─ Controller           ← menerima Service via constructor
```

---

## Struktur Proyek

```
hono-be/
├── src/
│   ├── config/                        # Konfigurasi aplikasi
│   │   ├── config.ts                  # Env variables (app, db, mail)
│   │   ├── database.ts                # TypeORM DataSource
│   │   └── smtp.ts                    # Nodemailer transporter
│   │
│   ├── core/                          # Infrastruktur bersama
│   │   ├── exceptions/
│   │   │   └── base.ts                # Hierarki custom exception
│   │   ├── helpers/
│   │   │   ├── auth.ts                # Google OAuth & JWT token helper
│   │   │   ├── hash.ts                # bcrypt password hashing
│   │   │   ├── mail.ts                # Wrapper Nodemailer
│   │   │   ├── minio.ts               # MinIO object storage helper
│   │   │   ├── response.ts            # ApiResponse formatter
│   │   │   └── validator.ts           # Zod validation hook
│   │   └── middlewares/
│   │       ├── auth.middleware.ts      # JWT auth
│   │       ├── api-key.middleware.ts   # API key auth
│   │       └── token-auth.middleware.ts
│   │
│   ├── modules/                       # Feature modules
│   │   ├── auth/                      # Register, login, Google OAuth, reset password
│   │   └── user/                      # User entity & service
│   │
│   ├── routes/
│   │   └── api.ts                     # Definisi route
│   │
│   └── index.ts                       # Entry point aplikasi
│
├── .env                               # Konfigurasi environment (tidak di-commit)
├── .env.dist                          # Template environment
├── ecosystem.config.js                # Konfigurasi PM2
├── docker-compose.yaml                # Docker Compose setup
├── Dockerfile                         # Docker build
├── swagger.yaml                       # OpenAPI 3.0 spec
└── package.json
```

## Memulai

### Prasyarat

- [Bun](https://bun.sh) >= 1.0
- MySQL >= 8.0
- SMTP server (untuk fitur email)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Instalasi

```bash
# 1. Clone repository
git clone <repository-url>
cd hono-be

# 2. Install dependencies
bun install

# 3. Salin dan isi environment file
cp .env.dist .env
```

Edit `.env` sesuai konfigurasi lokal Anda (lihat [Konfigurasi Environment](#konfigurasi-environment)).

### Menjalankan Aplikasi

```bash
# Development (hot-reload)
bun run dev

# Production
bun run build
bun run start
```

Server berjalan di `http://localhost:4000` (sesuai nilai `PORT` di `.env`).

### Docker

```bash
docker compose up -d
```

### PM2 (Production Process Manager)

```bash
pm2 start ecosystem.config.js
pm2 logs hono-be
pm2 restart hono-be
```

---

## Konfigurasi Environment

Salin `.env.dist` menjadi `.env` lalu isi setiap nilai:

| Variable               | Deskripsi                                  | Default                 |
| ---------------------- | ------------------------------------------ | ----------------------- |
| `PORT`                 | Port server                                | `4000`                  |
| `ENV`                  | Environment (`development` / `production`) | `development`           |
| `APP_URL`              | Base URL publik server                     | `http://localhost:4000` |
| `DB_HOST`              | Host database MySQL                        | `localhost`             |
| `DB_PORT`              | Port database                              | `3306`                  |
| `DB_USER`              | Username database                          | `root`                  |
| `DB_PASS`              | Password database                          | —                       |
| `DB_NAME`              | Nama database                              | `hono_be`               |
| `DB_SYNC`              | Auto-sync schema TypeORM                   | `true`                  |
| `JWT_SECRET`           | Secret untuk access token (15 menit)       | —                       |
| `JWT_REFRESH_SECRET`   | Secret untuk refresh token (7 hari)        | —                       |
| `API_KEY`              | Kunci API server-to-server                 | —                       |
| `SMTP_HOST`            | Host SMTP                                  | —                       |
| `SMTP_PORT`            | Port SMTP                                  | —                       |
| `SMTP_USER`            | Username SMTP                              | —                       |
| `SMTP_PASS`            | Password SMTP                              | —                       |
| `SMTP_FROM`            | Alamat email pengirim                      | —                       |
| `GOOGLE_CLIENT_ID`     | Google OAuth Client ID                     | —                       |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret                 | —                       |
| `MINIO_ENDPOINT`       | MinIO server endpoint                      | `127.0.0.1`             |
| `MINIO_PORT`           | MinIO server port                          | `9000`                  |
| `MINIO_USE_SSL`        | Gunakan SSL untuk MinIO                    | `false`                 |
| `MINIO_ACCESS_KEY`     | MinIO access key                           | —                       |
| `MINIO_SECRET_KEY`     | MinIO secret key                           | —                       |
| `MINIO_BUCKET`         | MinIO bucket name                          | `hono-be`               |

> **Catatan:** Jangan commit file `.env` ke repository. Pastikan sudah masuk `.gitignore`.
