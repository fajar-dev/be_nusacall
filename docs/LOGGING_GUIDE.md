# 🪵 Panduan Logging

Dokumen ini menjelaskan format log terstruktur (JSON) di proyek ini, cara menambahkan log baru, dan cara menghubungkannya ke Grafana Loki.

---

## 1. Cara Kerja

Semua log (request, error, info aplikasi lain) ditulis sebagai **satu baris JSON per event** ke stdout/stderr, lewat helper [src/core/helpers/logger.ts](../src/core/helpers/logger.ts). Format satu-baris-satu-JSON ini (NDJSON) adalah format standar yang dikonsumsi Promtail/Grafana Alloy untuk dikirim ke Loki — tidak perlu SDK atau dependency tambahan.

```
logger.info("Database connected successfully")
      │
      ▼
{"timestamp":"...","level":"info","service":"hono-be","environment":"development","message":"Database connected successfully"}
      │
      ├─► console (stdout untuk debug/info/warn, stderr untuk error) ──► di-scrape Promtail/Alloy ──► Loki
      └─► logs/app-YYYY-MM-DD.log ──► semua level, satu file per tanggal (UTC)
```

- **Semua level** (`debug`/`info`/`warn`/`error`) ditulis ke console **dan** di-append ke file — bukan cuma error.
- `error` → `console.error` (stderr). Level lain → `console.log` (stdout).
- File log dipisah **per tanggal**: `logs/app-2026-08-14.log`, `logs/app-2026-08-15.log`, dst — tanggal diambil dari UTC saat itu, rotasi otomatis tanpa restart/cron.
- `logs/` sudah ada di `.gitignore` — jangan commit isi folder ini.

---

## 2. Skema Field

Setiap baris log **selalu** punya field dasar ini:

| Field | Tipe | Keterangan |
|---|---|---|
| `timestamp` | string (ISO 8601) | Waktu event |
| `level` | `"debug"` \| `"info"` \| `"warn"` \| `"error"` | Severity |
| `service` | string | Nama aplikasi, dari `config.app.name` (env `APP_NAME`, default `hono-be`) |
| `environment` | string | `config.app.env` (`development`/`production`/dst) |
| `message` | string | Ringkasan human-readable, singkat |

Field tambahan (context) menyusul sesuai event — lihat § 3 dan § 4.

Untuk log `error`, ada field tambahan `error`:

```json
{
  "timestamp": "2026-08-14T13:38:59.048Z",
  "level": "error",
  "service": "hono-be",
  "environment": "production",
  "message": "Unhandled exception",
  "requestId": "0d4b0aab-ebf9-4d33-8a73-63a95426d442",
  "method": "POST",
  "path": "/api/contact",
  "statusCode": 500,
  "error": { "name": "TypeError", "message": "...", "stack": "..." }
}
```

---

## 3. Access Log (per Request)

[src/core/middlewares/logger.middleware.ts](../src/core/middlewares/logger.middleware.ts) mencatat **satu baris log per request** dengan `message: "HTTP request"`:

| Field | Keterangan |
|---|---|
| `requestId` | UUID. Diambil dari header `X-Request-Id` request kalau ada (correlation lintas service), kalau tidak di-generate baru. Selalu dikembalikan via response header `X-Request-Id` |
| `method`, `path`, `query` | Detail request |
| `statusCode` | Status response |
| `durationMs` | Lama proses request |
| `ip` | Dari header `x-forwarded-for` (proxy/load balancer), fallback ke koneksi langsung |
| `userAgent` | Header `User-Agent` |

Level dipilih otomatis dari `statusCode`: `>=500` → `error`, `>=400` → `warn`, selain itu → `info`.

---

## 4. Error / Exception Log

Selain access log, `app.onError` di [src/index.ts](../src/index.ts) mencatat baris **terpisah** khusus untuk detail exception (message di atas hanya tahu status code, bukan alasannya):

| Kasus | `message` | Level |
|---|---|---|
| Zod validation error | `"Validation error"` | `warn` |
| `BaseException` (400/401/403/404/409/dst) | `"Handled exception"` | `warn` |
| Error tak terduga (500) | `"Unhandled exception"` | `error` |

Semua tiga kasus di atas menyertakan `requestId` yang sama dengan access log request tersebut — dipakai untuk korelasi di Loki/Grafana (lihat § 6).

---

## 5. Menambahkan Log Baru

Panggil `logger` di file manapun (helper, service, middleware):

```typescript
import { logger } from "../../core/helpers/logger" // sesuaikan path relatif

logger.info("Something happened", { userId: user.id, action: "profile_update" })
logger.warn("Retrying operation", { attempt: 2 })
logger.error("Failed to process job", { jobId, err }) // `err` otomatis di-serialize (name/message/stack)
logger.debug("Verbose detail for local debugging")
```

**Aturan:**

- `message` singkat, deskriptif, **tanpa** data variabel di dalamnya (data variabel masuk ke field context, bukan disisipkan ke string) — supaya query Loki bisa mengelompokkan by `message` yang sama persis.
- Field context tambahan bebas (object flat, key apapun) — hindari nested object dalam-dalam, Loki paling nyaman query field flat.
- Untuk error, selalu kirim via field `err` (bukan `error`) — logger yang akan mengubahnya jadi field `error: {name, message, stack}` di output.
- **Jangan** pakai `console.log`/`console.error` langsung di kode manapun — selalu lewat `logger`, supaya semua log konsisten format JSON-nya. Cek `grep -rn "console\." src` sebelum commit untuk memastikan tidak ada yang lolos.

---

## 6. Menghubungkan ke Grafana Loki

Aplikasi ini **tidak push log langsung ke Loki** — cukup menulis JSON ke stdout/stderr (dan `logs/app-YYYY-MM-DD.log`), lalu agent log-shipper (Promtail atau Grafana Alloy) yang men-scrape dan mengirim ke Loki. Ini pola standar cloud-native, tidak butuh dependency tambahan di aplikasi.

### Opsi A — Docker / container stdout (disarankan)

Kalau deploy via Docker/Kubernetes, cukup pakai Loki Docker driver atau Promtail dengan `docker_sd_configs` — log stdout container otomatis ter-scrape, tidak perlu setup tambahan di aplikasi.

### Opsi B — Tail file `logs/app-*.log`

File dipisah per tanggal (`logs/app-2026-08-14.log`, dst) supaya tiap file tidak membengkak tanpa batas dan lebih gampang di-manage/rotate manual (arsip atau hapus file lama). Contoh konfigurasi Promtail untuk scrape semua file lewat glob:

```yaml
scrape_configs:
  - job_name: hono-be
    static_configs:
      - targets: [localhost]
        labels:
          job: hono-be
          __path__: /path/to/app/logs/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            timestamp: timestamp
      - labels:
          level:
      - timestamp:
          source: timestamp
          format: RFC3339Nano
```

- `job`/`level` dijadikan **label** Loki (low-cardinality, cocok untuk index) — field lain (`requestId`, `path`, `statusCode`, dst) tetap ada di body JSON dan di-query pakai `| json` di LogQL, **jangan** dijadikan label (cardinality terlalu tinggi, bikin Loki lambat).

### Contoh Query LogQL

```logql
# Semua error dari service ini
{job="hono-be", level="error"}

# Request lambat (>1s), lihat sebagai JSON
{job="hono-be"} | json | durationMs > 1000

# Trace satu request lintas access log + error log
{job="hono-be"} | json | requestId="0d4b0aab-ebf9-4d33-8a73-63a95426d442"

# Rate error per menit
sum(rate({job="hono-be", level="error"}[1m]))
```

---

## 7. Testing

Lihat [test/logger.test.ts](../test/logger.test.ts):

- `logger.info/warn/error` menghasilkan satu baris JSON valid dengan field dasar yang benar.
- Semua level (bukan cuma error) ikut ter-append ke `logs/app-YYYY-MM-DD.log`.
- `requestLogger` middleware mengembalikan header `X-Request-Id` (generate baru atau echo dari client), dan mencatat access log dengan `method`/`path`/`statusCode`/`durationMs` yang sesuai.

> Catatan: `bun:test`'s `spyOn` tidak reliable untuk intercept `console.log`/`console.error` di proyek ini — test logger pakai monkey-patch manual (assign langsung `console.log = fn`, lalu restore). Ikuti pola yang sama kalau butuh capture console di test lain.
