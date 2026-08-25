# 🗺️ Project Map — Peta Lengkap File & Dependensi

Dokumen ini berisi peta lengkap semua file dalam proyek, beserta fungsi dan dependensi antar file.

---

## Struktur Lengkap

```
hono-be/
├── docs/                                    # 📚 Dokumentasi proyek
│   ├── README.md                            # Index dokumentasi
│   ├── ARCHITECTURE.md                      # Arsitektur & prinsip desain
│   ├── CODING_STANDARDS.md                  # Standarisasi kode
│   ├── MODULE_GUIDE.md                      # Panduan membuat module baru
│   ├── API_CONVENTIONS.md                   # Konvensi API
│   ├── DATABASE_GUIDE.md                    # Panduan database
│   ├── TESTING_GUIDE.md                     # Panduan testing lengkap
│   ├── LANGUAGE_GUIDE.md                    # Panduan language detection & i18n
│   ├── SWAGGER_GUIDE.md                     # Panduan menulis swagger.yaml
│   ├── LOGGING_GUIDE.md                     # Panduan structured logging & Loki
│   ├── CHANGELOG.md                         # Riwayat perubahan
│   ├── AI_AGENT_RULES.md                    # Aturan untuk AI agent
│   ├── ENVIRONMENT.md                       # Konfigurasi environment
│   └── PROJECT_MAP.md                       # Dokumen ini
│
├── src/
│   ├── index.ts                             # 🚀 Entry point aplikasi
│   │
│   ├── config/
│   │   ├── config.ts                        # ⚙️ Centralized env config
│   │   ├── database.ts                      # 🗄️ TypeORM DataSource
│   │   └── smtp.ts                          # 📧 Nodemailer transporter
│   │
│   ├── core/
│   │   ├── exceptions/
│   │   │   └── base.ts                      # ❌ Custom exception hierarchy
│   │   │
│   │   ├── helpers/
│   │   │   ├── auth.ts                      # 🔑 JWT token & Google OAuth
│   │   │   ├── hash.ts                      # 🔒 bcrypt password hashing
│   │   │   ├── i18n.ts                      # 🌐 Message translator (en/id)
│   │   │   ├── logger.ts                    # 📋 Structured JSON logger (stdout/stderr + logs/app-{date}.log)
│   │   │   ├── mail.ts                      # ✉️ Email sender (SMTP)
│   │   │   ├── minio.ts                     # 📦 MinIO object storage
│   │   │   ├── response.ts                  # 📤 API response formatter
│   │   │   └── validator.ts                 # ✅ Zod validation hook
│   │   │
│   │   ├── i18n/
│   │   │   ├── en.json                      # 🇬🇧 English messages (master list)
│   │   │   └── id.json                      # 🇮🇩 Indonesian translations
│   │   │
│   │   ├── interfaces/
│   │   │   └── base.repository.interface.ts # 📋 Base repository interface
│   │   │
│   │   └── middlewares/
│   │       ├── auth.middleware.ts            # 🛡️ JWT Bearer auth
│   │       ├── api-key.middleware.ts         # 🔐 API key auth
│   │       ├── token-auth.middleware.ts      # 🎫 JWT via query/header
│   │       ├── logger.middleware.ts          # 📝 Request access log + X-Request-Id
│   │       └── language.middleware.ts        # 🌐 Accept-Language detection (en/id)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts               # 🔌 DI wiring
│   │   │   ├── auth.controller.ts           # 🎮 Auth HTTP handlers
│   │   │   ├── auth.service.ts              # 💼 Auth business logic
│   │   │   ├── validators/
│   │   │   │   └── auth.validator.ts        # ✅ Auth Zod schemas
│   │   │   └── serializers/
│   │   │       └── auth.serialize.ts        # 📤 Auth response shape
│   │   │
│   │   ├── user/
│   │   │   ├── user.module.ts               # 🔌 DI wiring
│   │   │   ├── user.service.ts              # 💼 User business logic
│   │   │   ├── entities/
│   │   │   │   └── user.entity.ts           # 🗄️ User TypeORM entity
│   │   │   ├── interfaces/
│   │   │   │   └── user.repository.interface.ts  # 📋 User repo contract
│   │   │   ├── repositories/
│   │   │   │   └── user.repository.ts    # 🗄️ User DB access
│   │   │   └── serializers/
│   │   │       ├── user.serialize.ts              # 📤 User detail shape
│   │   │       └── user-list.serialize.ts         # 📤 User list shape
│   │   │
│   │   └── contact/
│   │       ├── contact.module.ts            # 🔌 DI wiring
│   │       ├── contact.controller.ts        # 🎮 Contact HTTP handlers
│   │       ├── contact.service.ts           # 💼 Contact business logic
│   │       ├── entities/
│   │       │   └── contact.entity.ts        # 🗄️ Contact TypeORM entity
│   │       ├── enum/
│   │       │   ├── salutation.enum.ts       # 🏷️ Salutation enum
│   │       │   └── type.enum.ts             # 🏷️ ContactType enum
│   │       ├── interfaces/
│   │       │   └── contact.repository.interface.ts  # 📋 Contact repo contract
│   │       ├── repositories/
│   │       │   └── contact.repository.ts    # 🗄️ Contact DB access
│   │       ├── serializers/
│   │       │   └── contact.serialize.ts             # 📤 Contact response shape
│   │       └── validators/
│   │           └── contact.validator.ts             # ✅ Contact Zod schemas
│   │
│   ├── routes/
│   │   └── api.ts                           # 🛤️ Semua route definitions
│   │
│   └── jobs/
│       └── index.ts                         # ⏰ Placeholder scheduled tasks
│
├── .env                                     # 🔒 Environment variables (git-ignored)
├── .env.dist                                # 📋 Environment template
├── .gitignore                               # Git ignore rules
├── .dockerignore                            # Docker ignore rules
├── Dockerfile                               # 🐳 Multi-stage Docker build
├── docker-compose.yaml                      # 🐳 App + MySQL compose
├── ecosystem.config.js                      # 🔄 PM2 process manager config
├── package.json                             # 📦 Dependencies & scripts
├── bun.lock                                 # 🔒 Bun lockfile
├── tsconfig.json                            # ⚙️ TypeScript configuration
├── swagger.yaml                             # 📖 OpenAPI 3.0 specification
└── README.md                                # 📖 Project README
```

---

## Dependency Graph (Antar File)

### Entry Point

```
src/index.ts
    ├── hono (framework)
    ├── hono/cors
    ├── hono/bun (serveStatic)
    ├── @hono/swagger-ui
    ├── zod (ZodError)
    ├── src/config/database.ts          → AppDataSource
    ├── src/config/config.ts            → config
    ├── src/routes/api.ts               → routes
    ├── src/core/helpers/response.ts    → ApiResponse
    ├── src/core/helpers/logger.ts      → logger
    └── src/core/exceptions/base.ts     → BaseException, ValidatorException
```

### Routes

```
src/routes/api.ts
    ├── src/modules/auth/validators/auth.validator.ts
    ├── src/modules/contact/validators/contact.validator.ts
    ├── src/core/middlewares/auth.middleware.ts
    ├── src/core/helpers/validator.ts
    ├── src/modules/auth/auth.module.ts      → authController
    ├── src/modules/contact/contact.module.ts → contactController
    └── src/infrastructure/minio/minio.client.ts → minio (lazy import for proxy)
```

### Auth Module

```
src/modules/auth/auth.module.ts
    ├── src/modules/user/user.module.ts      → userService
    ├── src/modules/auth/auth.service.ts     → AuthService
    └── src/modules/auth/auth.controller.ts  → AuthController

src/modules/auth/auth.service.ts
    ├── src/config/database.ts               → AppDataSource (for transactions)
    ├── src/config/config.ts                 → config
    ├── src/modules/user/entities/user.entity.ts
    ├── src/modules/user/user.service.ts     → UserService (injected)
    ├── src/modules/auth/validators/auth.validator.ts
    ├── src/core/exceptions/base.ts
    ├── src/core/helpers/hash.ts
    ├── src/core/helpers/auth.ts             → AuthHelper
    ├── src/core/helpers/mail.ts             → mail
    └── hono/jwt (verify)

src/modules/auth/auth.controller.ts
    ├── src/modules/auth/auth.service.ts     → AuthService (injected)
    ├── src/modules/auth/serializers/auth.serialize.ts
    ├── src/core/helpers/response.ts         → ApiResponse
    └── src/core/exceptions/base.ts
```

### User Module

```
src/modules/user/user.module.ts
    ├── src/modules/user/repositories/user.repository.ts
    └── src/modules/user/user.service.ts

src/modules/user/user.service.ts
    ├── src/modules/user/entities/user.entity.ts
    ├── src/modules/user/interfaces/user.repository.interface.ts  → IUserRepository (injected)
    └── src/core/exceptions/base.ts

src/modules/user/repositories/user.repository.ts
    ├── src/config/database.ts               → AppDataSource
    ├── src/modules/user/entities/user.entity.ts
    └── src/modules/user/interfaces/user.repository.interface.ts
```

### Contact Module

```
src/modules/contact/contact.module.ts
    ├── src/modules/contact/repositories/contact.repository.ts
    ├── src/modules/contact/contact.service.ts
    └── src/modules/contact/contact.controller.ts

src/modules/contact/contact.service.ts
    ├── src/modules/contact/entities/contact.entity.ts
    ├── src/modules/contact/interfaces/contact.repository.interface.ts → IContactRepository (injected)
    └── src/core/exceptions/base.ts

src/modules/contact/contact.controller.ts
    ├── src/modules/contact/contact.service.ts   → ContactService (injected)
    ├── src/modules/contact/serializers/contact.serialize.ts
    └── src/core/helpers/response.ts             → ApiResponse
```

### Core Helpers

```
src/core/helpers/auth.ts
    ├── hono/jwt (sign)
    ├── google-auth-library (OAuth2Client)
    └── src/config/config.ts

src/core/helpers/mail.ts
    ├── src/config/smtp.ts      → transporter
    └── src/config/config.ts    → config.mail.from

src/infrastructure/minio/minio.client.ts
    ├── minio (Client)
    ├── node:stream (Readable)
    └── src/config/config.ts

src/core/helpers/response.ts
    ├── hono (Context)
    └── hono/utils/http-status (ContentfulStatusCode)

src/core/middlewares/auth.middleware.ts
    ├── hono/jwt (verify)
    ├── src/config/config.ts
    ├── src/config/database.ts
    ├── src/modules/user/entities/user.entity.ts
    └── src/core/exceptions/base.ts
```

---

## Dependencies (package.json)

### Production

| Package | Versi | Fungsi |
|---------|-------|--------|
| `hono` | ^4.12.8 | Web framework |
| `@hono/swagger-ui` | ^0.6.1 | Swagger UI middleware |
| `swagger-ui-dist` | ^5.32.14 | Swagger UI assets (peer dep dari `@hono/swagger-ui`) |
| `@hono/zod-validator` | ^0.7.6 | Zod validation untuk Hono |
| `zod` | ^4.3.6 | Schema validation |
| `typeorm` | ^0.3.28 | ORM |
| `reflect-metadata` | ^0.2.2 | Required by TypeORM decorators |
| `mysql2` | ^3.20.0 | MySQL driver (satu-satunya driver DB — lihat docs/DATABASE_GUIDE.md) |
| `werift` | ^0.24.4 | WebRTC (media bridge) |
| `minio` | ^8.0.7 | MinIO object storage client |

### Dev Dependencies

| Package | Versi | Fungsi |
|---------|-------|--------|
| `typescript` | ^5.7.0 | Compiler — pinned ke 5.x (lihat catatan versi di bawah) |
| `@types/bun` | latest | Bun type definitions |
| `@types/multicast-dns` | ^7.2.4 | Type declarations untuk dependency transitif `werift` |
| `@types/swagger-ui-dist` | ^3.30.6 | Type declarations untuk `swagger-ui-dist` |

> **Catatan versi TypeScript:** `typescript` sengaja di-pin ke rilis 5.x sebagai
> devDependency langsung. Tanpa ini, `bunx tsc` mengunduh rilis **terbaru** setiap kali
> dijalankan (termasuk TypeScript 7, port Go yang baru) — versi itu gagal me-resolve
> ambient types `bun:test` dari `bun-types`. Jangan hapus entri ini demi "ngirit
> dependency"; itu yang bikin `bunx tsc --noEmit` tampak rusak padahal kodenya tidak.
> `bunx` ternyata masih **kadang** mengambil rilis terbaru meski entri ini ada (perilaku
> resolusinya sendiri tidak selalu konsisten) — kalau `bunx tsc --noEmit` tiba-tiba
> menampilkan teks bantuan generik atau `Version 7.x`, jalankan
> `./node_modules/.bin/tsc --noEmit` langsung untuk memaksa memakai binary yang ter-pin.

---

## NPM Scripts

| Script | Command | Deskripsi |
|--------|---------|-----------|
| `dev` | `bun run --hot src/index.ts` | Development dengan hot-reload |
| `build` | `bun build --minify --outfile dist/index.js --target bun src/index.ts` | Production build |
| `start` | `bun run src/index.ts` | Start dari source |
