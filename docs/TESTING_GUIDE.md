# 🧪 Panduan Testing

Dokumen ini menjelaskan cara menjalankan test, menulis test baru, dan konvensi testing di proyek ini.

---

## 1. Menjalankan Test

### Prerequisites

- Database **harus sudah berjalan** (PostgreSQL atau MySQL)
- Database test `hono_be_test` sudah dibuat

### Membuat Database Test

```bash
# PostgreSQL
psql -U postgres -c "CREATE DATABASE hono_be_test;"

# MySQL (via Docker)
docker exec mysql-latest mysql -u root -proot -e "CREATE DATABASE IF NOT EXISTS hono_be_test;"
```

### Menjalankan Test

```bash
# Jalankan semua test
DB_TYPE=mysql bun test

# Atau jika DB_TYPE sudah di .env
bun test

# Jalankan file test tertentu
bun test test/auth.test.ts
bun test test/contact.test.ts
```

### Environment Variables untuk Test

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `DB_TYPE` | dari `config.database.type` | Tipe database (`postgres` \| `mysql`) |
| `DB_TEST_NAME` | `hono_be_test` | Nama database untuk test |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS` | dari `.env` | Koneksi database (sama dengan development) |

---

## 2. Arsitektur Test

### Strategi

- **True E2E Integration Test** — request dikirim ke Hono app, melewati middleware, validation, controller, service, repository, dan database nyata
- **Database test terpisah** (`hono_be_test`) agar tidak mengganggu data development
- **Auto-sync schema** — TypeORM `synchronize: true` + `dropSchema: true` otomatis membuat tabel saat test mulai
- **Clean per test** — setiap `beforeEach` membersihkan semua data untuk isolasi

### Struktur File

```
test/
├── setup.ts          # Test infrastructure (DB, app factory, helpers)
├── helpers.ts        # Data factories & assertion utilities
├── auth.test.ts      # Auth module E2E tests
└── contact.test.ts   # Contact module E2E tests
```

### Dependency Flow

```
Test File
  └── setup.ts
        ├── TestDataSource (database terpisah)
        ├── setDataSource() → override AppDataSource global
        ├── createTestApp() → Hono app + routes + error handler
        ├── request() → HTTP request helper
        └── registerAndLogin() → auth helper
```

---

## 3. Menulis Test untuk Module Baru

### Template Test File

Buat file `test/{module}.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { Hono } from "hono"
import {
    initTestDatabase,
    destroyTestDatabase,
    cleanTestDatabase,
    createTestApp,
    request,
    registerAndLogin,
} from "./setup"
import { resetCounters } from "./helpers"

// ── Setup ─────────────────────────────────────────────────────────────────

let app: Hono

beforeAll(async () => {
    await initTestDatabase()
    app = createTestApp()
})

afterAll(async () => {
    await destroyTestDatabase()
})

beforeEach(async () => {
    await cleanTestDatabase()
    resetCounters()
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Auth Required", () => {
    test("GET /api/{resource} should fail without auth", async () => {
        const { status, body } = await request(app, "/api/{resource}")
        expect(status).toBe(401)
        expect(body.success).toBe(false)
    })
})

describe("POST /api/{resource}", () => {
    test("should create successfully", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/{resource}", {
            method: "POST",
            headers,
            body: { name: "Test" },
        })

        expect(status).toBe(201)
        expect(body.success).toBe(true)
        expect(body.data.id).toBeDefined()
    })

    test("should fail validation", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/{resource}", {
            method: "POST",
            headers,
            body: {},  // missing required fields
        })

        expect(status).toBe(422)
        expect(body.success).toBe(false)
    })
})

describe("GET /api/{resource}", () => {
    test("should list with pagination", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/{resource}", {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data).toBeArray()
        expect(body.meta).toBeDefined()
        expect(body.meta.total).toBeDefined()
    })
})

describe("GET /api/{resource}/:id", () => {
    test("should return by ID", async () => {
        const { headers } = await registerAndLogin(app)

        // Create first
        const createRes = await request(app, "/api/{resource}", {
            method: "POST",
            headers,
            body: { name: "Test" },
        })
        const id = createRes.body.data.id

        // Get by ID
        const { status, body } = await request(app, `/api/{resource}/${id}`, {
            method: "GET",
            headers,
        })

        expect(status).toBe(200)
        expect(body.data.id).toBe(id)
    })

    test("should return 404 for non-existent", async () => {
        const { headers } = await registerAndLogin(app)

        const { status, body } = await request(app, "/api/{resource}/99999", {
            method: "GET",
            headers,
        })

        expect(status).toBe(404)
    })
})

describe("PUT /api/{resource}/:id", () => {
    test("should update successfully", async () => {
        const { headers } = await registerAndLogin(app)

        // Create
        const createRes = await request(app, "/api/{resource}", {
            method: "POST",
            headers,
            body: { name: "Original" },
        })
        const id = createRes.body.data.id

        // Update
        const { status, body } = await request(app, `/api/{resource}/${id}`, {
            method: "PUT",
            headers,
            body: { name: "Updated" },
        })

        expect(status).toBe(200)
        expect(body.data.name).toBe("Updated")
    })
})

describe("DELETE /api/{resource}/:id", () => {
    test("should delete successfully", async () => {
        const { headers } = await registerAndLogin(app)

        // Create
        const createRes = await request(app, "/api/{resource}", {
            method: "POST",
            headers,
            body: { name: "ToDelete" },
        })
        const id = createRes.body.data.id

        // Delete
        const { status } = await request(app, `/api/{resource}/${id}`, {
            method: "DELETE",
            headers,
        })
        expect(status).toBe(200)

        // Verify deleted
        const { status: getStatus } = await request(app, `/api/{resource}/${id}`, {
            method: "GET",
            headers,
        })
        expect(getStatus).toBe(404)
    })
})

describe("Full CRUD Lifecycle", () => {
    test("Create → Read → Update → Read → Delete → Verify", async () => {
        const { headers } = await registerAndLogin(app)

        // Create → Read → Update → Read → Delete → Verify Deleted
        // ... (lihat contact.test.ts sebagai referensi)
    })
})
```

---

## 4. Menambahkan Data Factory

Saat membuat module baru, tambahkan factory di `test/helpers.ts`:

```typescript
// Di test/helpers.ts:

let invoiceCounter = 0

export function createInvoiceData(overrides: Record<string, any> = {}) {
    invoiceCounter++
    return {
        number: `INV-${String(invoiceCounter).padStart(4, "0")}`,
        amount: 100000 + (invoiceCounter * 1000),
        description: `Invoice ${invoiceCounter}`,
        ...overrides,
    }
}

// Jangan lupa reset di resetCounters():
export function resetCounters() {
    userCounter = 0
    contactCounter = 0
    invoiceCounter = 0  // ← Tambahkan
}
```

---

## 5. Konvensi Testing

### Penamaan Test File

- `test/{module}.test.ts` — satu file per module

### Struktur Test

1. **Auth Required** — Test semua endpoint gagal tanpa auth
2. **Per-Endpoint** — Group by HTTP method + path
3. **Happy Path** (✅) — Test skenario sukses
4. **Error Path** (❌) — Test skenario gagal (validation, 404, 401, dll)
5. **Full Lifecycle** — Test CRUD lengkap end-to-end

### Penamaan Test Case

```typescript
// ✅ Format: "should {expected behavior}"
test("should create a contact successfully", ...)
test("should fail validation without name", ...)
test("should return 404 for non-existent contact", ...)
test("should fail without auth token", ...)

// ❌ JANGAN format yang ambigu
test("create contact", ...)        // Apa yang ditest?
test("test validation", ...)       // Validation apa?
```

### Assertion Pattern

```typescript
// Status code
expect(status).toBe(200)

// Response shape
expect(body.success).toBe(true)
expect(body.statusCode).toBe(200)
expect(body.data).toBeDefined()
expect(body.data.id).toBeDefined()

// Data value
expect(body.data.name).toBe("Expected Name")
expect(body.data.email).toBe("expected@email.com")

// Sensitive data NOT exposed
expect(body.data.password).toBeUndefined()

// Array
expect(body.data).toBeArray()
expect(body.data.length).toBe(3)

// Pagination
expect(body.meta.total).toBe(5)
expect(body.meta.currentPage).toBe(1)
```

---

## 6. Checklist Test untuk Module Baru

```
☐ Buat file test//{module}.test.ts
☐ Tambahkan data factory di test/helpers.ts
☐ Test: Auth Required (semua endpoint)
☐ Test: Create (success + validation errors)
☐ Test: List (empty, with data, pagination, search)
☐ Test: Show (success + 404)
☐ Test: Update (success + partial update + 404)
☐ Test: Delete (success + 404 + verify deleted)
☐ Test: Full CRUD Lifecycle
☐ Jalankan `bun test` dan pastikan semua pass
```

---

## 7. Checklist Swagger untuk Endpoint Baru

Setiap endpoint baru **WAJIB** didokumentasikan di `swagger.yaml`:

```
☐ Tambahkan path baru di `paths`
☐ Tambahkan request schema di `components.schemas`
☐ Tambahkan response schema di `components.schemas`
☐ Gunakan `$ref` untuk reuse schema
☐ Tambahkan tag sesuai module
☐ Tambahkan security requirement (bearerAuth) untuk protected endpoints
☐ Tambahkan contoh request/response
☐ Test swagger UI di /api/docs
```

### Template Swagger untuk CRUD Endpoint

```yaml
paths:
  /api/{resource}:
    get:
      tags: [ResourceName]
      summary: List resources
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 10 }
        - name: q
          in: query
          schema: { type: string }
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/BaseResponse'
                  - properties:
                      data:
                        type: array
                        items:
                          $ref: '#/components/schemas/Resource'
                      meta:
                        $ref: '#/components/schemas/PaginationMeta'

    post:
      tags: [ResourceName]
      summary: Create resource
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateResource'
      responses:
        '201':
          description: Created

  /api/{resource}/{id}:
    get:
      tags: [ResourceName]
      summary: Get resource by ID
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Success
        '404':
          description: Not found

    put:
      tags: [ResourceName]
      summary: Update resource
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateResource'
      responses:
        '200':
          description: Updated

    delete:
      tags: [ResourceName]
      summary: Delete resource
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Deleted
```
