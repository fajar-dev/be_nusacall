# 🤖 AI Agent Rules

Dokumen ini berisi **aturan wajib** bagi setiap AI agent (Copilot, Cursor, Gemini, Claude, dll) yang melanjutkan pengembangan proyek ini. **Baca dokumen ini SEBELUM menulis kode apapun.**

---

## ⚠️ Aturan Utama

### 1. SELALU Ikuti Arsitektur yang Ada

```
❌ JANGAN menulis query database langsung di controller
❌ JANGAN membuat format response sendiri
❌ JANGAN mengakses env variable langsung via process.env di luar config.ts
❌ JANGAN menaruh business logic di controller
❌ JANGAN membuat file di luar struktur yang sudah ditentukan

✅ Ikuti layer: Controller → Service → Repository
✅ Gunakan ApiResponse untuk semua response
✅ Akses env via config object (src/config/config.ts)
✅ Business logic hanya di service
✅ Buat file sesuai struktur module
```

### 2. Dependency Injection

```
❌ JANGAN instantiate service/repository di controller
❌ JANGAN import repository langsung di service (gunakan interface)

✅ Wiring DI hanya di *.module.ts (Composition Root)
✅ Service menerima interface via constructor
✅ Controller menerima service via constructor
```

### 3. Error Handling

```
❌ JANGAN gunakan try-catch di controller (kecuali kasus khusus)
❌ JANGAN return error response manual di controller
❌ JANGAN throw generic Error()

✅ Throw custom exception (NotFoundException, BadRequestException, dll) di service
✅ Biarkan global error handler di index.ts yang menangani
✅ Gunakan exception class yang sesuai dengan HTTP semantics
```

---

## 📋 Checklist Sebelum Membuat Perubahan

### Menambah Module Baru

Baca: [`MODULE_GUIDE.md`](./MODULE_GUIDE.md)

```
☐ Buat semua file sesuai struktur module
☐ Entity didaftarkan di src/config/database.ts
☐ Route ditambahkan di src/routes/api.ts
☐ Validator dibuat untuk setiap input endpoint
☐ Serializer dibuat untuk setiap output endpoint
☐ Test E2E dibuat di test/{module}.test.ts
☐ Data factory ditambahkan di test/helpers.ts
☐ Swagger spec diperbarui (swagger.yaml)
☐ Changelog diperbarui (docs/CHANGELOG.md)
☐ Jalankan `bun test` dan pastikan semua pass
```

### Menambah Endpoint ke Module yang Ada

```
☐ Tambahkan method di repository interface
☐ Implementasikan di TypeORM repository
☐ Tambahkan method di service
☐ Tambahkan method di controller
☐ Buat/update validator jika ada input baru
☐ Update serializer jika ada output baru
☐ Tambahkan route di api.ts
☐ Tambahkan test case di test/{module}.test.ts
☐ Update swagger.yaml
☐ Jalankan `bun test` dan pastikan semua pass
```

### Menambah Field ke Entity yang Ada

```
☐ Tambahkan @Column di entity
☐ Update repository interface jika perlu method baru
☐ Update repository implementation
☐ Update service jika ada business logic baru
☐ Update validator (Create dan Update)
☐ Update serializer
☐ Update test yang terkait
☐ Update swagger.yaml schemas
☐ Jalankan `bun test` dan pastikan semua pass
```

---

## 📁 Referensi File Penting

| Kebutuhan | File | Catatan |
|-----------|------|---------|
| Konfigurasi env | `src/config/config.ts` | Satu-satunya tempat akses env |
| Database DataSource | `src/config/database.ts` | Daftarkan entity baru di sini |
| SMTP transporter | `src/config/smtp.ts` | Konfigurasi email |
| Exception classes | `src/core/exceptions/base.ts` | `BaseException` hierarchy (400, 401, 403, 404, 409, 422, 429) |
| Response format | `src/core/helpers/response.ts` | ApiResponse.success / paginate / error |
| Validation hook | `src/core/helpers/validator.ts` | validationHook untuk zValidator |
| JWT & Auth | `src/core/helpers/auth.ts` | AuthHelper.generateTokens |
| Password hash | `src/core/helpers/hash.ts` | hashPassword, comparePassword |
| Email sending | `src/core/helpers/mail.ts` | mail.sendText, mail.sendHtml |
| File upload | `src/core/helpers/minio.ts` | minio.upload, minio.delete, dll |
| Structured logger | `src/core/helpers/logger.ts` | `logger.info/warn/error/debug()` — JSON, lihat `docs/LOGGING_GUIDE.md` |
| Auth middleware | `src/core/middlewares/auth.middleware.ts` | JWT Bearer |
| API key middleware | `src/core/middlewares/api-key.middleware.ts` | x-api-key |
| Request logger | `src/core/middlewares/logger.middleware.ts` | Access log JSON per request + `X-Request-Id` |
| Route definitions | `src/routes/api.ts` | Semua route didefinisikan di sini |
| Base repo interface | `src/core/interfaces/base.repository.interface.ts` | Interface dasar CRUD |
| Health check | `GET /health` | Status DB, uptime, environment |

---

## 🎯 Pattern yang HARUS Diikuti

### 1. Controller Pattern

```typescript
export class XxxController {
    constructor(private readonly service: XxxService) {}

    // List (paginated)
    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const { data, total } = await this.service.getAll(page, limit, q)
        return ApiResponse.paginate(c, XxxSerializer.collection(data), total, page, limit, "Retrieved successfully")
    }

    // Detail
    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const item = await this.service.getById(id)
        return ApiResponse.success(c, XxxSerializer.single(item), "Retrieved successfully")
    }

    // Create
    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const item = await this.service.create(data)
        return ApiResponse.success(c, XxxSerializer.single(item), "Created successfully", 201)
    }

    // Update
    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const item = await this.service.update(id, data)
        return ApiResponse.success(c, XxxSerializer.single(item), "Updated successfully")
    }

    // Delete
    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Deleted successfully")
    }
}
```

### 2. Service Pattern

```typescript
export class XxxService {
    constructor(private readonly repository: IXxxRepository) {}

    async getAll(page: number, limit: number, q: string) {
        return await this.repository.findAll(page, limit, q)
    }

    async getById(id: number): Promise<Xxx> {
        const item = await this.repository.findById(id)
        if (!item) throw new NotFoundException("Xxx not found")
        return item
    }

    async create(data: Partial<Xxx>): Promise<Xxx> {
        return await this.repository.save(data)
    }

    async update(id: number, data: Partial<Xxx>): Promise<Xxx> {
        const item = await this.getById(id)
        this.repository.merge(item, data)
        return await this.repository.save(item)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)
        await this.repository.delete(id)
    }
}
```

### 3. Repository Pattern

```typescript
export class TypeOrmXxxRepository implements IXxxRepository {
    private readonly repository: Repository<Xxx>

    constructor() {
        this.repository = AppDataSource.getRepository(Xxx)
    }

    // ... implementations
}
```

### 4. Module Pattern

```typescript
const xxxRepository = new TypeOrmXxxRepository()
const xxxService = new XxxService(xxxRepository)
export const xxxController = new XxxController(xxxService)
```

### 5. Route Pattern

```typescript
// {resource} CRUD
routes.get("/{resource}", authMiddleware, (c) => xxxController.index(c))
routes.get("/{resource}/:id", authMiddleware, (c) => xxxController.show(c))
routes.post("/{resource}", authMiddleware, zValidator("json", CreateXxxValidator, validationHook), (c) => xxxController.store(c))
routes.put("/{resource}/:id", authMiddleware, zValidator("json", UpdateXxxValidator, validationHook), (c) => xxxController.update(c))
routes.delete("/{resource}/:id", authMiddleware, (c) => xxxController.destroy(c))
```

---

## 🚫 Anti-Patterns (JANGAN Lakukan)

### 1. Inline Query di Controller

```typescript
// ❌ SALAH
async index(c: Context) {
    const users = await AppDataSource.getRepository(User).find()
    return c.json({ data: users })
}

// ✅ BENAR
async index(c: Context) {
    const { data, total } = await this.service.getAll(page, limit, q)
    return ApiResponse.paginate(c, UserSerializer.collection(data), total, page, limit)
}
```

### 2. Custom Response Format

```typescript
// ❌ SALAH
return c.json({ status: "ok", result: data })

// ✅ BENAR
return ApiResponse.success(c, data, "Success")
```

### 3. Direct process.env

```typescript
// ❌ SALAH
const secret = process.env.JWT_SECRET

// ✅ BENAR
import { config } from "../../config/config"
const secret = config.app.jwtSecret
```

### 4. Try-Catch di Controller

```typescript
// ❌ SALAH
async show(c: Context) {
    try {
        const user = await this.service.getById(id)
        return ApiResponse.success(c, user)
    } catch (error) {
        return ApiResponse.error(c, "Not found", 404)
    }
}

// ✅ BENAR — Service throws exception, global handler catches it
async show(c: Context) {
    const id = Number(c.req.param("id"))
    const user = await this.service.getById(id)  // throws NotFoundException if not found
    return ApiResponse.success(c, UserSerializer.single(user))
}
```

### 5. Expose Sensitive Data

```typescript
// ❌ SALAH — Langsung return entity
return ApiResponse.success(c, user)  // Bisa expose password, token, dll

// ✅ BENAR — Gunakan serializer
return ApiResponse.success(c, UserSerializer.single(user))
```

### 6. console.log/console.error Langsung

```typescript
// ❌ SALAH — Tidak terstruktur, tidak bisa di-scrape Loki
console.log(`[Mail] Sent to ${to}`)
console.error("Failed:", error)

// ✅ BENAR — JSON terstruktur, lihat docs/LOGGING_GUIDE.md
import { logger } from "../../core/helpers/logger"
logger.info("Email sent", { to })
logger.error("Failed to send email", { to, err: error })
```

---

## 📦 Dependency yang Tersedia

Jangan menambahkan library baru jika fungsionalitas sudah tersedia:

| Kebutuhan | Library yang Sudah Ada | Contoh Penggunaan |
|-----------|----------------------|-------------------|
| HTTP Framework | `hono` | Route, middleware, context |
| Validation | `zod` + `@hono/zod-validator` | Request body validation |
| ORM | `typeorm` | Entity, repository, query builder |
| JWT | `hono/jwt` (built-in) | sign, verify |
| Password Hashing | `bcryptjs` | hashPassword, comparePassword |
| Email | `nodemailer` | mail.sendText, mail.sendHtml |
| File Storage | `minio` | minio.upload, minio.delete |
| Google OAuth | `google-auth-library` | AuthHelper.verifyGoogleCode |

---

## 🔄 Updating Documentation

Saat membuat perubahan, **WAJIB** update file dokumentasi terkait:

| Perubahan | File yang Diupdate |
|-----------|--------------------|
| Module baru | `CHANGELOG.md`, `ARCHITECTURE.md`, `swagger.yaml`, `test/{module}.test.ts`, `test/helpers.ts` |
| Endpoint baru | `CHANGELOG.md`, `swagger.yaml`, `test/{module}.test.ts` |
| Entity baru/modifikasi | `CHANGELOG.md`, `DATABASE_GUIDE.md`, test terkait |
| Helper/middleware baru | `CHANGELOG.md`, `ARCHITECTURE.md` (tabel infra) |
| Environment variable baru | `CHANGELOG.md`, `ENVIRONMENT.md`, `.env.dist` |
| Breaking change | `CHANGELOG.md` (major version bump) |

---

## 🧪 Testing

Setiap perubahan **WAJIB** disertai test. Baca: [`TESTING_GUIDE.md`](./TESTING_GUIDE.md)

### Menjalankan Test

```bash
DB_TYPE=mysql bun test
```

### Aturan Testing

1. **SELALU** buat test E2E untuk setiap module/endpoint baru
2. **SELALU** jalankan `bun test` sebelum commit dan pastikan **semua pass**
3. Test file: `test/{module}.test.ts`
4. Data factory: `test/helpers.ts`
5. Test menggunakan database terpisah (`hono_be_test`)
