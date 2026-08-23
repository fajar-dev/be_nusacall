# 🏗️ Arsitektur Proyek

## Prinsip Desain

Proyek ini menggunakan **Clean Architecture** dengan prinsip:

- **SOLID Principles** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **Dependency Injection (Manual)** — Wiring dilakukan di `*.module.ts` (Composition Root)
- **Repository Pattern** — Abstraksi akses data melalui interface
- **Separation of Concerns** — Setiap layer memiliki tanggung jawab yang jelas

---

## Layer Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Presentation Layer                                      │
│  Controller → Menerima HTTP request, mengembalikan       │
│               response via ApiResponse                   │
├──────────────────────────────────────────────────────────┤
│  Application Layer                                       │
│  Service → Business logic, orchestration, use cases      │
├──────────────────────────────────────────────────────────┤
│  Domain Layer                                            │
│  Interface → Kontrak repository (IXxxRepository)         │
│  Entity → TypeORM entity model                           │
├──────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                    │
│  TypeORM Repository → Implementasi akses database        │
│  Helpers → Auth, Mail, MinIO, Hash, Logger               │
└──────────────────────────────────────────────────────────┘
```

---

## Dependency Flow

```
src/index.ts                          ← Entry point, konfigurasi Hono app
    │
    ├─ src/routes/api.ts              ← Definisi seluruh route
    │       │
    │       ├─ Validators             ← Zod schema untuk validasi request body
    │       ├─ Middlewares            ← Auth guard (JWT / API Key)
    │       └─ Controllers            ← Di-import dari *.module.ts
    │
    └─ src/modules/{module}/
            │
            ├─ {module}.module.ts     ← Composition Root (wiring DI)
            │       │
            │       ├─ Repository     ← new TypeOrmXxxRepository()
            │       ├─ Service        ← new XxxService(repository)
            │       └─ Controller     ← new XxxController(service)
            │
            ├─ entities/              ← TypeORM entity
            ├─ interfaces/            ← Repository interface
            ├─ repositories/          ← TypeORM implementation
            ├─ validators/            ← Zod validation schemas
            └─ serializers/           ← Response data transformation
```

---

## Alur Request

```
HTTP Request
    │
    ▼
[CORS Middleware]
    │
    ▼
[Route Matching] (src/routes/api.ts)
    │
    ▼
[Validation Middleware] (zValidator + validationHook)
    │   → Jika gagal: throw ValidatorException → 422
    │
    ▼
[Auth Middleware] (opsional, per-route)
    │   → authMiddleware:     JWT Bearer token
    │   → apiKeyMiddleware:   x-api-key header
    │   → tokenAuthMiddleware: JWT via query param atau header
    │
    ▼
[Controller] → Menerima Context, memanggil Service
    │
    ▼
[Service] → Business logic, memanggil Repository
    │
    ▼
[Repository] → Akses database via TypeORM
    │
    ▼
[Serializer] → Transform entity ke response shape
    │
    ▼
[ApiResponse] → Format JSON response standar
    │
    ▼
HTTP Response
```

---

## Global Error Handling

Error ditangani di `src/index.ts` → `app.onError()`:

| Error Type | Status | Handling |
|------------|--------|----------|
| `ZodError` | 422 | Di-wrap ke `ValidatorException`, mengembalikan array field errors |
| `BaseException` (dan subclass) | Sesuai subclass | Mengembalikan `message`, `status`, dan `context` |
| Unknown Error | 500 | Log JSON ke `logs/app-{date}.log`, tampilkan stack trace hanya di `development` |

---

## Module yang Tersedia

| Module | Path | Deskripsi | Memiliki Controller |
|--------|------|-----------|---------------------|
| `auth` | `src/modules/auth/` | Register, login, Google OAuth, refresh token, reset password | ✅ |
| `user` | `src/modules/user/` | User entity, repository, service (digunakan oleh auth) | ❌ (dipakai internal) |
| `contact` | `src/modules/contact/` | CRUD contact dengan pagination & search | ✅ |

---

## Infrastruktur Bersama (core/)

| Komponen | Path | Fungsi |
|----------|------|--------|
| **Exceptions** | `core/exceptions/base.ts` | Hierarki custom exception (400, 401, 403, 404, 409, 422, 429) |
| **ApiResponse** | `core/helpers/response.ts` | Format response standar (success, paginate, error) |
| **AuthHelper** | `core/helpers/auth.ts` | JWT token generation & Google OAuth verification |
| **Hash** | `core/helpers/hash.ts` | bcrypt password hashing & comparison |
| **Mail** | `core/helpers/mail.ts` | Singleton Nodemailer wrapper (sendText, sendHtml) |
| **MinIO** | `core/helpers/minio.ts` | Singleton MinIO wrapper (upload, delete, presignedUrl, proxy) |
| **Logger** | `core/helpers/logger.ts` | Structured JSON logger (stdout/stderr + `logs/app-{date}.log`, semua level), lihat `LOGGING_GUIDE.md` |
| **Validator** | `core/helpers/validator.ts` | Zod validation hook untuk Hono |
| **Auth Middleware** | `core/middlewares/auth.middleware.ts` | JWT Bearer token verification |
| **API Key Middleware** | `core/middlewares/api-key.middleware.ts` | x-api-key header verification |
| **Token Auth Middleware** | `core/middlewares/token-auth.middleware.ts` | JWT via query param atau header |

---

## Konfigurasi

| File | Fungsi |
|------|--------|
| `src/config/config.ts` | Centralized environment config object |
| `src/config/database.ts` | TypeORM DataSource configuration |
| `src/config/smtp.ts` | Nodemailer transporter configuration |
