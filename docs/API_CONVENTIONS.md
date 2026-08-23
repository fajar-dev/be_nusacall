# 🔌 Konvensi API

Dokumen ini mendefinisikan standar untuk semua API endpoints, format response, error handling, dan validasi.

---

## 1. Format Response

### Success Response

```json
{
    "success": true,
    "statusCode": 200,
    "message": "Operation successful",
    "data": { ... }
}
```

### Success Response dengan Pagination

```json
{
    "success": true,
    "statusCode": 200,
    "message": "Data retrieved successfully",
    "data": [ ... ],
    "meta": {
        "total": 50,
        "perPage": 10,
        "currentPage": 1,
        "lastPage": 5,
        "from": 1,
        "to": 10
    }
}
```

### Error Response

```json
{
    "success": false,
    "statusCode": 400,
    "message": "Error description",
    "errors": null
}
```

### Validation Error Response (422)

```json
{
    "success": false,
    "statusCode": 422,
    "message": "Validator failed",
    "errors": [
        { "field": "email", "message": "Invalid email format" },
        { "field": "password", "message": "Password must be at least 6 characters" }
    ]
}
```

---

## 2. Penggunaan ApiResponse

```typescript
import { ApiResponse } from "../../core/helpers/response"

// ✅ Success dengan data
return ApiResponse.success(c, data, "Message", 200)

// ✅ Success dengan data dan status 201
return ApiResponse.success(c, data, "Created successfully", 201)

// ✅ Success tanpa data
return ApiResponse.success(c, null, "Operation successful")

// ✅ Pagination
return ApiResponse.paginate(c, data, total, page, limit, "Retrieved successfully")

// ✅ Error (biasanya via exception, bukan manual)
return ApiResponse.error(c, "Error message", 400, errors)
```

> **PENTING**: Jangan buat format response sendiri. Selalu gunakan `ApiResponse`.

---

## 3. HTTP Status Code

| Status | Penggunaan |
|--------|------------|
| `200` | OK — GET, PUT, DELETE berhasil |
| `201` | Created — POST (create) berhasil |
| `400` | Bad Request — Logik bisnis gagal (email sudah terdaftar, dll) |
| `401` | Unauthorized — Token tidak valid atau tidak ada |
| `403` | Forbidden — Tidak memiliki akses |
| `404` | Not Found — Resource tidak ditemukan |
| `409` | Conflict — Konflik data |
| `422` | Unprocessable Entity — Validasi Zod gagal |
| `429` | Too Many Requests — Rate limiting |
| `500` | Internal Server Error — Error tidak terduga |

---

## 4. Exception Hierarchy

```
BaseException (extends HTTPException)
├── BadRequestException      (400)
├── UnauthorizedException    (401)
├── ForbiddenException       (403)
├── NotFoundException        (404)
├── ConflictException        (409)
├── ValidatorException       (422) ← Otomatis dari Zod
└── TooManyValidatorsException (429)
```

### Penggunaan Exception

```typescript
// ✅ Throw di service layer
throw new NotFoundException("Invoice not found")
throw new BadRequestException("Email already in use")
throw new UnauthorizedException("Invalid credentials")

// ✅ Throw dengan context/errors
throw new BadRequestException("Validation failed", { field: "reason" })

// ❌ JANGAN throw generic Error
throw new Error("Something went wrong")  // JANGAN
```

> **ATURAN**: Throw exception di **service layer**, bukan di controller.

---

## 5. Validasi Request

### Validator Flow

```
Request Body
    │
    ▼
zValidator("json", Schema, validationHook)
    │
    ├─ Valid   → lanjut ke handler
    └─ Invalid → throw ValidatorException → 422
```

### Cara Mendaftarkan Validator

```typescript
// Di routes/api.ts:
routes.post(
    "/invoice",
    authMiddleware,
    zValidator("json", CreateInvoiceValidator, validationHook),
    (c) => invoiceController.store(c)
)
```

### Mengakses Validated Data

```typescript
// Di controller:
const data = c.req.valid("json" as never)  // Data sudah tervalidasi

// Atau jika tanpa zValidator:
const body = await c.req.json() as SomeType
```

---

## 6. Autentikasi

### JWT Bearer (authMiddleware)

```http
Authorization: Bearer <access_token>
```

- Access token: expires 15 menit
- Refresh token: expires 7 hari
- Algoritma: HS256
- User disimpan di `c.set("user", user)` → akses via `c.get("user")`

### API Key (apiKeyMiddleware)

```http
x-api-key: <api_key>
```

- Untuk server-to-server communication
- Verifikasi terhadap `config.app.apiKey`

### Token Query Param (tokenAuthMiddleware)

```http
GET /api/resource?token=<jwt_token>
```

- Mendukung JWT via query parameter **atau** Authorization header
- Berguna untuk URL yang perlu auth tapi tidak bisa set header (misal: download link)

---

## 7. Konvensi URL / Route

| Pattern | HTTP Method | Controller Method | Deskripsi |
|---------|-------------|-------------------|-----------|
| `/{resource}` | GET | `index(c)` | List (paginated) |
| `/{resource}/:id` | GET | `show(c)` | Detail by ID |
| `/{resource}` | POST | `store(c)` | Create new |
| `/{resource}/:id` | PUT | `update(c)` | Update by ID |
| `/{resource}/:id` | DELETE | `destroy(c)` | Delete by ID |

### Query Parameters untuk Pagination & Search

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-----------|
| `page` | number | 1 | Nomor halaman |
| `limit` | number | 10 | Jumlah item per halaman |
| `q` | string | "" | Keyword pencarian |
| `sortBy` | string | "id" | Kolom untuk sorting — hanya kolom yang ada di whitelist `SORTABLE_COLUMNS` module tersebut, lihat `docs/DATABASE_GUIDE.md` §5 (opsional, per-module) |
| `order` | string | "DESC" | Arah sorting: ASC / DESC (opsional, per-module) |

---

## 8. Konvensi Response Message

### Pattern Message

| Operasi | Message Pattern | Contoh |
|---------|----------------|--------|
| List | `"{Resources} retrieved successfully"` | `"Contacts retrieved successfully"` |
| Detail | `"{Resource} retrieved successfully"` | `"Contact retrieved successfully"` |
| Create | `"{Resource} created successfully"` | `"Contact created successfully"` |
| Update | `"{Resource} updated successfully"` | `"Contact updated successfully"` |
| Delete | `"{Resource} deleted successfully"` | `"Contact deleted successfully"` |
| Auth | Deskriptif | `"Logged in successfully"`, `"Token refreshed successfully"` |
| Error | Deskriptif | `"Email already in use"`, `"Invalid credentials"` |

### Bahasa Message

- Response message: **Bahasa Inggris**
- Email content: **Bahasa Indonesia** (untuk end-user)

---

## 9. Swagger/OpenAPI Documentation

- Lokasi: `swagger.yaml` di root project
- Akses UI: `GET /api/docs` (Swagger UI)
- Akses spec: `GET /api/swagger.yaml`
- Versi: OpenAPI 3.0

### Aturan Swagger

- Setiap endpoint baru **harus** ditambahkan ke `swagger.yaml`
- Gunakan `$ref` untuk reuse schema
- Response selalu wrapped dalam `BaseResponse` via `allOf`
- Tag per module (contoh: `Auth`, `Contact`)
