# 🌐 Panduan Language / i18n

Dokumen ini menjelaskan cara kerja deteksi bahasa dan terjemahan response message di proyek ini, serta cara menambahkan message baru.

---

## 1. Cara Kerja

1. Client mengirim header `Accept-Language` (mis. `Accept-Language: id` atau `Accept-Language: id-ID,id;q=0.9`).
2. `languageMiddleware` ([src/core/middlewares/language.middleware.ts](../src/core/middlewares/language.middleware.ts)) mendeteksi bahasa **hanya dari header ini** (tidak dari query string atau cookie), lalu:
   - Menyimpan bahasa terdeteksi ke `c.set("language", ...)`.
   - Mengembalikan bahasa tersebut ke client via response header `Content-Language`.
3. `ApiResponse.success/paginate/error` ([src/core/helpers/response.ts](../src/core/helpers/response.ts)) memanggil `translate(c, message)` untuk menerjemahkan message sebelum dikirim ke client.
4. `translate()` ([src/core/helpers/i18n.ts](../src/core/helpers/i18n.ts)) mencari `message` (string Inggris) di kamus bahasa yang aktif. Kalau ketemu → dikembalikan versi terjemahannya. Kalau tidak ketemu (atau bahasanya `en`) → dikembalikan apa adanya (fallback ke Inggris, **tidak pernah error**).

```
Accept-Language: id
      │
      ▼
languageMiddleware ──► c.set("language", "id") + header Content-Language: id
      │
      ▼
Controller/Service/Exception tetap pakai message Inggris seperti biasa
      │
      ▼
ApiResponse.success/error ──► translate(c, message) ──► cari di id.json ──► balas ke client
```

### Bahasa yang Didukung

| Bahasa | Kode | Keterangan |
|--------|------|------------|
| Inggris | `en` | **Default**. Dipakai jika header tidak dikirim atau bahasa tidak didukung |
| Indonesia | `id` | Aktif jika `Accept-Language` mengandung `id` atau `id-XX` |

---

## 2. Struktur File

```
src/core/
├── middlewares/
│   └── language.middleware.ts   # Deteksi bahasa dari header, set Content-Language
├── helpers/
│   └── i18n.ts                  # translate(c, message) — lookup kamus
└── i18n/
    ├── en.json                  # Daftar master semua message (key = value)
    └── id.json                  # Terjemahan Indonesia (key sama persis dengan en.json)
```

`en.json` dan `id.json` dikelompokkan per domain agar mudah dibaca/dicari:

```json
{
    "common": { "Success": "...", "Validation failed": "..." },
    "auth": { "User registered successfully": "..." },
    "user": { "User not found": "..." },
    "contact": { "Contact not found": "..." },
    "validation": { "Name is required": "..." }
}
```

Nama grup (`common`, `auth`, `user`, ...) hanya untuk pengelompokan visual — **tidak dipakai sebagai key lookup**. Saat aplikasi start, `i18n.ts` me-flatten semua grup jadi satu lookup table datar: `messageInggris → terjemahan`. Grup boleh disesuaikan/ditambah bebas, yang penting **key (teks Inggris) di dalamnya sama persis di kedua file**.

---

## 3. Menambahkan Message Baru

Message di controller/service/exception/validator **selalu ditulis dalam Bahasa Inggris seperti biasa** — teks ini otomatis menjadi key kamus. Jangan hardcode Bahasa Indonesia di kode manapun.

**Langkah:**

1. Tulis message Inggris seperti biasa di kode:

   ```typescript
   // service
   throw new NotFoundException("Invoice not found")

   // controller
   return ApiResponse.success(c, data, "Invoice archived successfully")
   ```

2. Tambahkan key yang **sama persis** (case-sensitive) ke grup yang sesuai di **kedua file**:

   `src/core/i18n/en.json`
   ```json
   "invoice": {
       "Invoice not found": "Invoice not found",
       "Invoice archived successfully": "Invoice archived successfully"
   }
   ```

   `src/core/i18n/id.json`
   ```json
   "invoice": {
       "Invoice not found": "Faktur tidak ditemukan",
       "Invoice archived successfully": "Faktur berhasil diarsipkan"
   }
   ```

3. Jalankan test — `test/language.test.ts` punya test consistency yang akan **gagal** kalau key di `en.json` dan `id.json` tidak sinkron:

   ```bash
   DB_TYPE=mysql bun test test/language.test.ts
   ```

> Kalau lupa menambahkan terjemahan di `id.json`, tidak akan error saat runtime — hanya fallback ke teks Inggris. Tapi test consistency akan menandainya, jadi tetap harus dilengkapi.

---

## 4. Memakai Bahasa di Controller/Service

Bahasa yang terdeteksi tersedia via `c.get("language")` (bertipe `string`, nilainya `"en"` atau `"id"`) — berguna kalau butuh logic yang bergantung pada bahasa di luar message response (mis. memilih template email).

```typescript
async someHandler(c: Context) {
    const lang = c.get("language") // "en" | "id"
    // ...
}
```

Untuk mengirim message terjemahan, **tidak perlu** memanggil `translate()` manual di controller/service — cukup lempar exception atau pass message Inggris seperti biasa ke `ApiResponse`, karena `translate()` sudah dipanggil otomatis di dalam `ApiResponse.success/paginate/error`.

---

## 5. Testing

Semua behavior language ada di [test/language.test.ts](../test/language.test.ts):

| Test group | Yang diverifikasi |
|------------|--------------------|
| Language detection | Default `en` tanpa header, deteksi `id`, regional variant (`id-ID` → `id`), fallback ke `en` untuk bahasa tak didukung |
| Localized response messages | Success message, exception message, dan field error Zod ikut diterjemahkan saat `Accept-Language: id` |
| Locale files consistency | `en.json` dan `id.json` punya grup & key yang sama, tidak ada value kosong |

Test app di `test/setup.ts` sudah mendaftarkan `languageMiddleware` — pastikan setiap perubahan pada middleware/i18n tetap dijalankan lewat `createTestApp()`, bukan app terpisah.

---

## 6. Aturan

- ✅ Tulis semua message di kode dalam **Bahasa Inggris**.
- ✅ Tambahkan key baru ke **kedua** file (`en.json` **dan** `id.json`), grup boleh bebas.
- ✅ Key harus **sama persis** (case-sensitive) dengan string yang dilempar di kode.
- ❌ JANGAN hardcode Bahasa Indonesia langsung di controller/service/exception/validator.
- ❌ JANGAN panggil `translate()` manual di luar `ApiResponse` — biarkan terjadi otomatis di response layer.
- ❌ JANGAN tambah source deteksi bahasa lain (query string/cookie) tanpa didiskusikan — proyek ini sengaja hanya pakai header `Accept-Language`.
