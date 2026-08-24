# ⚙️ Environment & Deployment

Dokumen ini menjelaskan konfigurasi environment, deployment, dan infrastruktur proyek.

---

## 1. Environment Variables

### Daftar Lengkap

Salin `.env.dist` ke `.env` dan isi setiap nilai:

```bash
cp .env.dist .env
```

#### Aplikasi

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `APP_NAME` | string | `hono-be` | Nama service, muncul di setiap baris log JSON (field `service`) — dipakai sebagai label saat scrape ke Grafana Loki |
| `PORT` | number | `4000` | Port server HTTP |
| `ENV` | string | `development` | Environment: `development` / `production` |
| `APP_URL` | string | `https://localhost:3000` | Base URL publik (untuk generate link, misal reset password) |

#### Database

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `DB_HOST` | string | `localhost` | Host database |
| `DB_PORT` | number | `3306` | Port database MySQL |
| `DB_USER` | string | `root` | Username database |
| `DB_PASS` | string | _(kosong)_ | Password database |
| `DB_NAME` | string | `hono_be` | Nama database |
| `DB_SYNC` | boolean | `false` | Auto-sync schema TypeORM. **Otomatis `false` di production (hardcoded).** |

#### Authentication

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `JWT_SECRET` | string | _(dev only)_ | **WAJIB di production.** Secret key untuk access token (15 menit) |
| `JWT_REFRESH_SECRET` | string | _(dev only)_ | **WAJIB di production.** Secret key untuk refresh token (7 hari) |
| `API_KEY` | string | _(dev only)_ | **WAJIB di production.** Kunci untuk server-to-server authentication |

#### SMTP (Email)

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `SMTP_HOST` | string | _(kosong)_ | Host SMTP server |
| `SMTP_PORT` | number | _(kosong)_ | Port SMTP (587 untuk TLS, 465 untuk SSL) |
| `SMTP_USER` | string | _(kosong)_ | Username SMTP |
| `SMTP_PASS` | string | _(kosong)_ | Password SMTP |
| `SMTP_FROM` | string | _(kosong)_ | Alamat pengirim email |

#### Google OAuth

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `GOOGLE_CLIENT_ID` | string | _(kosong)_ | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | string | _(kosong)_ | Google OAuth Client Secret |

#### MinIO (Object Storage)

| Variable | Tipe | Default | Deskripsi |
|----------|------|---------|-----------|
| `MINIO_ENDPOINT` | string | _(kosong)_ | MinIO server endpoint |
| `MINIO_PORT` | number | `9000` | MinIO server port |
| `MINIO_USE_SSL` | boolean | `false` | Gunakan SSL untuk koneksi MinIO |
| `MINIO_ACCESS_KEY` | string | _(kosong)_ | MinIO access key |
| `MINIO_SECRET_KEY` | string | _(kosong)_ | MinIO secret key |
| `MINIO_BUCKET` | string | `hono-be` | Nama bucket default |

---

## 2. Menambah Environment Variable Baru

Saat menambah env variable baru, update **semua** file berikut:

1. **`src/config/config.ts`** — Tambahkan ke config object
2. **`.env.dist`** — Tambahkan template dengan value kosong/default
3. **`.env`** — Tambahkan value aktual (lokal, jangan commit)
4. **`docker-compose.yaml`** — Tambahkan ke section `environment` service `app`
5. **`docs/ENVIRONMENT.md`** — Update tabel di atas

### Contoh Menambah Config Baru

```typescript
// Di src/config/config.ts:
export const config = {
    // ... existing config
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
    },
}
```

---

## 3. Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- MySQL >= 8.0
- SMTP server (untuk fitur email)

### Menjalankan Lokal

```bash
# Install dependencies
bun install

# Setup environment
cp .env.dist .env
# Edit .env sesuai konfigurasi lokal

# Jalankan development server (hot-reload)
bun run dev
```

Server berjalan di `http://localhost:4000`.

### Endpoints Penting

| URL | Deskripsi |
|-----|-----------|
| `http://localhost:4000/health` | Health check (load balancer/K8s) |
| `http://localhost:4000/api/docs` | Swagger UI |
| `http://localhost:4000/api/swagger.yaml` | OpenAPI Spec |
| `http://localhost:4000/api/...` | API endpoints |

---

## 4. Production Build

```bash
# Build
bun run build

# Output: dist/index.js (single bundled file)

# Start
bun run start
```

---

## 5. Docker Deployment

### Docker Compose (Recommended)

```bash
# Start semua services (app + MySQL)
docker compose up -d

# Lihat logs
docker compose logs -f app

# Stop
docker compose down

# Rebuild setelah code changes
docker compose up -d --build
```

### Services dalam Docker Compose

| Service | Container Name | Port | Deskripsi |
|---------|---------------|------|-----------|
| `app` | `hono-be` | 4000 | Aplikasi backend |
| `db` | `nusacall-be-db` | 3306 | MySQL 8.0 |

### Docker Build Manual

```bash
# Build image
docker build -t hono-be .

# Run container
docker run -p 4000:4000 --env-file .env hono-be
```

### Dockerfile Details

- **Base image**: `oven/bun:latest`
- **Multi-stage build**: install → prerelease → release
- **Production optimizations**: frozen lockfile, production-only deps, minified bundle
- **Exposed port**: 4000
- **Entry point**: `bun run dist/index.js`

---

## 6. PM2 Deployment

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Monitoring
pm2 logs hono-be
pm2 monit

# Restart
pm2 restart hono-be

# Stop
pm2 stop hono-be
```

### PM2 Configuration

```javascript
// ecosystem.config.js
{
    name: "hono-be",
    script: "dist/index.js",
    interpreter: "bun",
    env: { NODE_ENV: "production" },
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
}
```

---

## 7. File & Directory yang Tidak Di-commit

Dikonfigurasi via `.gitignore`:

```
node_modules/       # Dependencies
.env               # Environment variables (RAHASIA)
public/uploads     # Uploaded files
database/          # Database files
dist               # Build output
logs/              # Application logs (JSON, per tanggal)
```

---

## 8. Static Files & Uploads

- Uploads disajikan melalui: `GET /api/uploads/*`
- Root directory: `./public/uploads/`
- MinIO proxy: `GET /api/proxy?path={objectName}`

---

## 9. Logging

Semua log ditulis sebagai **satu baris JSON per event** ke stdout/stderr — format ini siap di-scrape Promtail/Grafana Alloy dan dikirim ke **Grafana Loki** tanpa setup tambahan di aplikasi. Panduan lengkap (skema field, cara menambah log, contoh config Promtail, contoh query LogQL): **`docs/LOGGING_GUIDE.md`**.

### Access Log (per Request)

Dicatat ke stdout untuk semua request, termasuk `requestId` (echo dari header `X-Request-Id` client atau digenerate baru):

```json
{"timestamp":"2026-06-17T15:00:00.000Z","level":"info","service":"hono-be","environment":"production","message":"HTTP request","requestId":"...","method":"GET","path":"/api/contact","statusCode":200,"durationMs":12}
```

### File Log

- Semua level (`debug`/`info`/`warn`/`error`) di-append ke file JSON Lines, **satu file per tanggal**: `logs/app-2026-08-14.log`, `logs/app-2026-08-15.log`, dst (rotasi otomatis, tanggal UTC).
- Berguna untuk deployment non-container yang tail file langsung (bukan stdout container).

### Error Logs

- Semua exception (validasi, business logic, 500) dicatat sebagai baris terpisah dengan detail error.
- Stack trace di response API hanya tampil di environment `development`, tapi selalu ada di log.

---

## 10. Production Safety

| Safety | Behavior |
|--------|----------|
| `JWT_SECRET` tidak di-set | ❌ Crash saat startup |
| `JWT_REFRESH_SECRET` tidak di-set | ❌ Crash saat startup |
| `API_KEY` tidak di-set | ❌ Crash saat startup |
| `DB_SYNC=true` di production | ⚠️ Otomatis diubah ke `false` |
| Stack trace di response | ⚠️ Hidden di production |
