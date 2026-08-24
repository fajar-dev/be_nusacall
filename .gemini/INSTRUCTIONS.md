# Hono BE — Project Instructions for Gemini

Kamu adalah AI agent yang bekerja pada proyek **Hono BE Backend Boilerplate**. Proyek ini menggunakan **Hono + Bun + TypeORM** dengan arsitektur **Clean Architecture**.

**WAJIB baca file `docs/AI_AGENT_RULES.md` sebelum menulis kode apapun.**

---

## Tech Stack

- Runtime: Bun
- Framework: Hono (bukan Express, bukan Fastify)
- ORM: TypeORM (bukan Drizzle, bukan Prisma)
- Validation: Zod + @hono/zod-validator
- Auth: JWT via hono/jwt (bukan jsonwebtoken)
- Database: MySQL (via DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME env)
- Email: Nodemailer
- Object Storage: MinIO

## Arsitektur (WAJIB DIIKUTI)

```
Controller → Service → Repository (via Interface)
```

- **Controller**: HTTP handler, hanya memanggil service dan mengembalikan ApiResponse
- **Service**: Business logic, menerima repository interface via constructor
- **Repository**: Akses database via TypeORM, implements interface
- **Module** (`*.module.ts`): Satu-satunya tempat wiring DI (Composition Root)

## Aturan Mutlak

1. **JANGAN** menulis query database di controller
2. **JANGAN** membuat format response sendiri → gunakan `ApiResponse` dari `src/core/helpers/response.ts`
3. **JANGAN** akses `process.env` langsung → gunakan `config` dari `src/config/config.ts`
4. **JANGAN** taruh business logic di controller → hanya di service
5. **JANGAN** throw generic `Error()` → gunakan custom exception dari `src/core/exceptions/base.ts`
6. **JANGAN** expose data sensitif (password, token) → gunakan Serializer
7. **JANGAN** instantiate service/repository di controller → wiring hanya di `*.module.ts`
8. **JANGAN** pakai `console.log`/`console.error` langsung → gunakan `logger` dari `src/core/helpers/logger.ts` (baca `docs/LOGGING_GUIDE.md`)

## Membuat Module Baru

Baca panduan lengkap: `docs/MODULE_GUIDE.md`

Checklist:
1. `enum/{nama}.enum.ts` — Enum (opsional, hanya jika ada field enum)
2. `entities/{nama}.entity.ts` — TypeORM entity
3. `interfaces/{nama}.repository.interface.ts` — Repository contract
4. `repositories/{nama}.repository.ts` — TypeORM implementation
5. `{nama}.service.ts` — Business logic
6. `{nama}.controller.ts` — HTTP handlers
7. `validators/{nama}.validator.ts` — Zod schemas
8. `serializers/{nama}.serialize.ts` — Response transform
9. `{nama}.module.ts` — DI wiring (Composition Root)
10. Daftarkan entity di `src/config/database.ts` → array `entities`
11. Tambahkan route di `src/routes/api.ts`
12. Update `swagger.yaml` (baca `docs/SWAGGER_GUIDE.md`)
13. Update `docs/CHANGELOG.md`

## Naming Conventions

### Files (kebab-case)
- Enum: `{nama}.enum.ts` (di dalam folder `enum/`, singular)
- Entity: `{nama}.entity.ts`
- Repo interface: `{nama}.repository.interface.ts`
- Repo implementation: `{nama}.repository.ts`
- Service: `{nama}.service.ts`
- Controller: `{nama}.controller.ts`
- Validator: `{nama}.validator.ts`
- Serializer: `{nama}.serialize.ts`
- Module: `{nama}.module.ts`
- Middleware: `{nama}.middleware.ts`

### Classes (PascalCase)
- Enum: nama deskriptif, tanpa prefix nama module (`ContactType`, bukan `ContactTypeEnum`)
- Entity: `Invoice`
- Repo interface: `IInvoiceRepository`
- Repo implementation: `TypeOrmInvoiceRepository`
- Service: `InvoiceService`
- Controller: `InvoiceController`
- Serializer: `InvoiceSerializer`

### Database
- Tabel: `snake_case`, plural (`invoices`)
- Kolom: `snake_case` (`created_at`, `is_active`)
- Property entity: `camelCase` (`createdAt`, `isActive`)

## Response Format Standar

```typescript
// Success
ApiResponse.success(c, data, "Message", 200)
ApiResponse.success(c, data, "Created", 201)

// Pagination
ApiResponse.paginate(c, data, total, page, limit, "Message")

// Error (via exception, BUKAN manual)
throw new NotFoundException("Resource not found")
throw new BadRequestException("Invalid input")
throw new UnauthorizedException("Not authenticated")
```

## Controller Pattern

```typescript
export class XxxController {
    constructor(private readonly service: XxxService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const { data, total } = await this.service.getAll(page, limit, q)
        return ApiResponse.paginate(c, XxxSerializer.collection(data), total, page, limit)
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const item = await this.service.getById(id)
        return ApiResponse.success(c, XxxSerializer.single(item))
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const item = await this.service.create(data)
        return ApiResponse.success(c, XxxSerializer.single(item), "Created", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const item = await this.service.update(id, data)
        return ApiResponse.success(c, XxxSerializer.single(item), "Updated")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Deleted")
    }
}
```

## Route Pattern

```typescript
routes.get("/{resource}", authMiddleware, (c) => xxxController.index(c))
routes.get("/{resource}/:id", authMiddleware, (c) => xxxController.show(c))
routes.post("/{resource}", authMiddleware, zValidator("json", CreateXxxValidator, validationHook), (c) => xxxController.store(c))
routes.put("/{resource}/:id", authMiddleware, zValidator("json", UpdateXxxValidator, validationHook), (c) => xxxController.update(c))
routes.delete("/{resource}/:id", authMiddleware, (c) => xxxController.destroy(c))
```

## Language Detection & Pesan Response

- Bahasa dideteksi dari header `Accept-Language`, bukan query string atau cookie.
- Didukung: `en` (default) dan `id`. Header tidak dikirim atau bahasa tidak didukung → fallback `en`.
- Bahasa yang terdeteksi tersedia via `c.get("language")` di controller/service, dan dikembalikan ke client melalui response header `Content-Language`.
- Middleware: `src/core/middlewares/language.middleware.ts`, didaftarkan global di `src/index.ts` (dan `test/setup.ts` untuk test).
- Message pada `ApiResponse.success/paginate/error` otomatis diterjemahkan ke Indonesia via `translate()` di `src/core/helpers/i18n.ts`.
- Kamus terjemahan JSON, key sama persis di kedua file: `src/core/i18n/en.json` dan `src/core/i18n/id.json`. Tulis message di kode selalu dalam Bahasa Inggris.

## File Referensi Penting

| Kebutuhan | File |
|-----------|------|
| Config env | `src/config/config.ts` |
| Database | `src/config/database.ts` |
| Exceptions | `src/core/exceptions/base.ts` |
| Response format | `src/core/helpers/response.ts` |
| Validation hook | `src/core/helpers/validator.ts` |
| JWT/Auth | `src/core/helpers/auth.ts` |
| Password | `src/core/helpers/hash.ts` |
| Email | `src/core/helpers/mail.ts` |
| File storage | `src/core/helpers/minio.ts` |
| Structured logger (JSON) | `src/core/helpers/logger.ts` |
| Routes | `src/routes/api.ts` |
| Swagger | `swagger.yaml` |
| Test setup | `test/setup.ts` |
| Test helpers | `test/helpers.ts` |

## Testing (WAJIB)

Setiap perubahan **WAJIB** disertai test E2E.

### Menjalankan Test

```bash
DB_TEST_NAME=nusacall_test bun test
```

### Checklist Testing untuk Fitur Baru

```
☐ Buat/update test file: test/{module}.test.ts
☐ Tambahkan data factory di test/helpers.ts
☐ Test: auth required (semua endpoint)
☐ Test: create (success + validation errors)
☐ Test: list (empty, data, pagination, search)
☐ Test: show (success + 404)
☐ Test: update (success + partial + 404)
☐ Test: delete (success + 404 + verify deleted)
☐ Test: full CRUD lifecycle
☐ Update swagger.yaml
☐ Update docs/CHANGELOG.md
☐ Jalankan bun test → semua HARUS pass
```

### File Test yang Ada

| File | Tests |
|------|-------|
| `test/auth.test.ts` | 28 test — register, login, refresh, me, logout, forgot/reset password |
| `test/contact.test.ts` | 21 test — CRUD, auth, pagination, search, lifecycle |

## Dokumentasi Lengkap

Baca semua file di folder `docs/` untuk detail lebih lanjut:
- `docs/ARCHITECTURE.md` — Arsitektur & layer design
- `docs/CODING_STANDARDS.md` — Konvensi kode lengkap
- `docs/MODULE_GUIDE.md` — Step-by-step membuat module
- `docs/API_CONVENTIONS.md` — Standar API response & error
- `docs/DATABASE_GUIDE.md` — Entity, repository, query patterns
- `docs/TESTING_GUIDE.md` — Panduan testing lengkap + template
- `docs/LANGUAGE_GUIDE.md` — Panduan language detection & terjemahan message (i18n)
- `docs/SWAGGER_GUIDE.md` — Panduan menulis & memvalidasi `swagger.yaml`
- `docs/LOGGING_GUIDE.md` — Panduan structured logging (JSON) & integrasi Grafana Loki
- `docs/CHANGELOG.md` — Riwayat perubahan
- `docs/ENVIRONMENT.md` — Environment variables & deployment
- `docs/PROJECT_MAP.md` — Peta file & dependency graph

