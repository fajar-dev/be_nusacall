# 📘 Panduan Menulis Swagger (untuk AI Agent)

Dokumen ini menjelaskan cara menulis dan menjaga `swagger.yaml` tetap akurat setiap kali endpoint baru ditambahkan atau endpoint lama diubah.

**Prinsip utama: swagger harus merefleksikan behavior asli, bukan asumsi.** Selalu cek `*.controller.ts`, `*.service.ts`, `*.validator.ts`, dan `*.serialize.ts` yang sebenarnya sebelum menulis schema — jangan menebak nama field.

---

## 1. Kapan Wajib Update `swagger.yaml`

- Menambah module/endpoint baru (lihat `docs/MODULE_GUIDE.md` Langkah 13).
- Mengubah field request (validator) atau response (serializer) pada endpoint yang sudah ada.
- Menambah/mengubah exception atau status code yang bisa dilempar oleh sebuah endpoint.
- Menambah enum baru yang dipakai di request/response.

---

## 2. Struktur File

```yaml
openapi: 3.0.0
info: ...          # judul, deskripsi, versi
servers: ...        # base URL
tags: ...            # daftar tag + deskripsi, untuk grouping di Swagger UI

components:
  securitySchemes:  # bearerAuth (JWT)
  parameters:       # parameter yang dipakai berulang, mis. AcceptLanguage
  headers:          # response header yang dipakai berulang, mis. Content-Language
  schemas:          # semua request/response body schema

paths:
  /resource: ...
  /resource/{id}: ...
```

Cek file yang sudah ada dulu sebelum menambah section baru — kemungkinan besar pattern-nya sudah ada.

---

## 3. Sumber Kebenaran (Source of Truth)

| Yang mau ditulis di swagger | Cek file ini, BUKAN entity |
|---|---|
| Field request body | `validators/{nama}.validator.ts` (Zod schema) |
| Field response body | `serializers/{nama}.serialize.ts` — **bukan** `entities/{nama}.entity.ts` |
| Message di `description`/`example` | String Inggris asli di controller/service/exception (lihat `docs/LANGUAGE_GUIDE.md`) |
| Query parameter | `{nama}.controller.ts` → `c.req.query(...)` |
| Status code & kapan muncul | `{nama}.service.ts` → exception yang dilempar |

> **Kenapa bukan entity?** Entity bisa punya field yang tidak (belum) diserialisasi ke response — kalau swagger mengikuti entity, dokumentasi bisa berbohong soal apa yang benar-benar dikembalikan API. Contoh nyata di proyek ini: `Contact` entity punya `salutation`/`type`/`isActive`, tapi `ContactSerializer.single()` belum mengembalikannya di response — jadi field itu didokumentasikan di `CreateContactRequest`/`UpdateContactRequest` (karena diterima), tapi **tidak** di schema `Contact` (karena belum dikembalikan).

---

## 4. Reusable Components — Pakai, Jangan Duplikasi

| Schema/Component | Kapan dipakai |
|---|---|
| `BaseResponse` | `allOf` dengan `data` custom untuk semua response sukses |
| `ErrorResponse` | Semua response error non-validasi (400/401/403/404/409) |
| `ValidationError` | Semua response `422` — `errors` adalah **array** `{ field, message }`, bukan object map |
| `PaginationMeta` | Semua endpoint list/paginate |
| `parameters/AcceptLanguage` | Ditaruh di level **path** (bukan per-operation) agar berlaku untuk semua method di path itu |
| `headers/ContentLanguage` | Opsional, contoh dipasang di salah satu response representatif |

Contoh pola response sukses dengan data:

```yaml
responses:
  "200":
    description: Contact retrieved successfully
    content:
      application/json:
        schema:
          allOf:
            - $ref: "#/components/schemas/BaseResponse"
            - type: object
              properties:
                data: { $ref: "#/components/schemas/Contact" }
```

Contoh pola error (400/401/403/404):

```yaml
"404":
  description: Contact not found
  content:
    application/json:
      schema: { $ref: "#/components/schemas/ErrorResponse" }
```

Contoh pola validasi (422) — selalu sama persis di semua endpoint:

```yaml
"422":
  description: Validation error
  content:
    application/json:
      schema: { $ref: "#/components/schemas/ValidationError" }
```

---

## 5. Menambahkan Path Baru — Checklist

1. Tambahkan `parameters: [{ $ref: "#/components/parameters/AcceptLanguage" }]` di level path (sejajar dengan `get`/`post`/dst), supaya berlaku untuk semua method di path tersebut.
2. Tag operation dengan `tags: [NamaModule]`. Kalau tag belum ada, tambahkan definisinya di `tags:` (top-level) dengan deskripsi singkat.
3. `security: [{ bearerAuth: [] }]` kalau route pakai `authMiddleware`. Kalau publik (tanpa auth), jangan ditambahkan.
4. `requestBody` mengacu ke schema `Create{Nama}Request` / `Update{Nama}Request` yang field-nya sinkron dengan validator.
5. Daftarkan **semua** response code yang benar-benar bisa terjadi (cek exception di service, bukan cuma happy path). Minimal: sukses, `401` kalau butuh auth, `404` kalau ada `getById`, `422` kalau ada `zValidator`.
6. Kalau ada field enum baru, buat schema enum terpisah (`type: string, enum: [...]`) lalu `$ref` — jangan inline `enum:` berulang di banyak tempat.

---

## 6. Naming Convention

| Yang didefinisikan | Pola |
|---|---|
| Schema request | `Create{Nama}Request`, `Update{Nama}Request` |
| Schema response object | `{Nama}` (singular, PascalCase) — harus cocok dengan output serializer, bisa beda antar serializer meski sama-sama "User" (lihat `AuthUser` vs `User` di proyek ini) |
| Schema enum | `{NamaEnum}` PascalCase, sama dengan nama class enum di `enum/{nama}.enum.ts` |
| Tag | PascalCase, sama dengan nama module (`Auth`, `Contact`, `User`) |

> **Penting**: kalau dua serializer berbeda menghasilkan shape yang berbeda untuk "user" (mis. `AuthSerializer` punya `hasPassword`, `UserSerializer` punya `createdAt` tapi tidak keduanya), **jangan** dipaksa pakai satu schema yang sama. Buat schema terpisah (`AuthUser` vs `User`) sesuai serializer aslinya.

---

## 7. Validasi Setelah Edit

Swagger yang salah syntax akan membuat `/api/docs` gagal render tanpa error yang jelas di server. Selalu validasi sebelum selesai:

```bash
# 1. YAML valid?
python3 -c "import yaml; yaml.safe_load(open('swagger.yaml'))" && echo OK

# 2. Semua $ref bisa di-resolve? (tidak ada typo path)
python3 -c "
import yaml, re
doc = yaml.safe_load(open('swagger.yaml'))
text = open('swagger.yaml').read()
refs = set(re.findall(r'\\\$ref:\s*[\"\']?(#/[^\"\'\s]+)', text))
def resolve(ref):
    node = doc
    for p in ref.lstrip('#/').split('/'):
        if not isinstance(node, dict) or p not in node: return False
        node = node[p]
    return True
missing = [r for r in refs if not resolve(r)]
print('Missing refs:', missing or 'NONE')
"

# 3. Render nyata di Swagger UI (server harus jalan)
bun run src/index.ts &
curl -s http://localhost:4000/api/swagger.yaml -o /dev/null -w "%{http_code}\n"
```

Kalau ada Browser tool tersedia, buka `/api/docs` dan expand minimal satu endpoint yang baru diubah untuk memastikan parameter/schema tampil sesuai ekspektasi (bukan cuma "tidak error").

---

## 8. Yang Sering Salah (Hindari)

- ❌ Menulis schema response berdasarkan entity TypeORM, bukan serializer.
- ❌ `errors` di `ValidationError` ditulis sebagai object map (`{ field: "message" }`) — behavior asli adalah **array** `[{ field, message }]` (lihat `src/core/exceptions/base.ts` → `ValidationException`).
- ❌ Duplikasi `Accept-Language` parameter di setiap operation — cukup satu kali di level path.
- ❌ Menambah endpoint baru di `src/routes/api.ts` tanpa menambah path-nya di `swagger.yaml` (termasuk endpoint "kecil" seperti proxy/utility).
- ❌ Mengarang pesan error yang tidak pernah benar-benar dilempar oleh service — cek `throw new ...Exception(...)` yang nyata.
- ❌ Comment/deskripsi yang bertele-tele. Deskripsi cukup 1 baris, jelas.
