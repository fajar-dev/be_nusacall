# 📚 Hono BE — Dokumentasi Proyek

Dokumentasi lengkap untuk **Hono BE Backend Boilerplate** — panduan standarisasi, konvensi kode, dan referensi bagi developer maupun AI agent yang melanjutkan proyek ini.

---

## Daftar Dokumen

| No | Dokumen | Deskripsi |
|----|---------|-----------|
| 1 | [ARCHITECTURE.md](./ARCHITECTURE.md) | Arsitektur, prinsip desain, dan dependency flow |
| 2 | [CODING_STANDARDS.md](./CODING_STANDARDS.md) | Standarisasi kode: naming, struktur file, konvensi |
| 3 | [MODULE_GUIDE.md](./MODULE_GUIDE.md) | Panduan langkah-per-langkah membuat module baru |
| 4 | [API_CONVENTIONS.md](./API_CONVENTIONS.md) | Konvensi API: response format, error handling, validasi |
| 5 | [DATABASE_GUIDE.md](./DATABASE_GUIDE.md) | Panduan entity, repository, dan manajemen database |
| 6 | [CHANGELOG.md](./CHANGELOG.md) | Riwayat perubahan proyek |
| 7 | [AI_AGENT_RULES.md](./AI_AGENT_RULES.md) | Aturan khusus untuk AI agent yang melanjutkan proyek |
| 8 | [ENVIRONMENT.md](./ENVIRONMENT.md) | Panduan konfigurasi environment & deployment |
| 9 | [PROJECT_MAP.md](./PROJECT_MAP.md) | Peta lengkap seluruh file dan dependensi antar file |
| 10 | [TESTING_GUIDE.md](./TESTING_GUIDE.md) | Panduan E2E testing, template, dan konvensi |

---

## Quick Start

```bash
# Install dependencies
bun install

# Setup environment
cp .env.dist .env

# Development (hot-reload)
bun run dev

# Production build
bun run build
bun run start
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **ORM**: TypeORM
- **Database**: PostgreSQL / MySQL
- **Validation**: Zod + @hono/zod-validator
- **Auth**: JWT (HS256) via hono/jwt
- **Email**: Nodemailer (SMTP)
- **Object Storage**: MinIO
- **Process Manager**: PM2
- **Containerization**: Docker + Docker Compose
