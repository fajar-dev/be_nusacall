# 📞 NusaCall — Backend Service

Backend API dan control plane untuk **NusaCall**, platform pusat panggilan (call center) yang mengintegrasikan **WhatsApp Business Calling API (SIP)** dengan agen berbasis web.

Dibangun menggunakan **[Hono](https://hono.dev)**, **[Bun](https://bun.sh)**, dan **[TypeORM](https://typeorm.io)** dengan arsitektur **Clean Architecture**.

---

## 📖 Tentang NusaCall

NusaCall memungkinkan pelanggan WhatsApp menghubungi nomor bisnis perusahaan secara langsung melalui panggilan suara WhatsApp, serta memungkinkan agen perusahaan melakukan panggilan keluar (outbound) ke WhatsApp pelanggan melalui softphone berbasis web.

### Prinsip Arsitektur: Control Plane vs Media Plane

NusaCall memisahkan secara tegas antara jalur kontrol (sinyal/data) dan jalur media (audio):

```
┌─────────────────┐       SIP / TLS        ┌─────────────────────┐
│  WhatsApp Meta  │ ◄────────────────────► │   Asterisk PBX      │
│  (wa.meta.vc)   │       RTP Media        │   (voip1.nusa.net.id)│
└────────┬────────┘                        └──────────┬──────────┘
         │ Webhook (Status keluar)                    │ ARI (REST + WS)
         ▼                                            ▼
┌────────────────────────────────────────────────────────────────┐
│                   NusaCall Backend (Control Plane)              │
│       - Orkestrasi Panggilan           - State Machine         │
│       - Queue & Routing Agen           - Meta Webhook & Sync   │
└───────────────────────────────┬────────────────────────────────┘
                                │ WebSocket (Sinyal UI)
                                ▼
                   ┌─────────────────────────┐
                   │    Browser Web Agent    │
                   │ (Softphone via SIP.js)  │
                   └─────────────────────────┘
```

1. **Media Plane (Asterisk PBX)**:
   - Menangani seluruh streaming audio (RTP) dan pensinyalan SIP trunk ke Meta.
   - Menangani WebRTC / SIP-over-WebSocket ke softphone browser agen.
   - Melakukan rekaman audio lokal saat panggilan berlangsung (`.wav`).
   - **Backend NusaCall TIDAK PERNAH menyentuh audio/RTP secara langsung.**

2. **Control Plane (NusaCall Backend — Repositori ini)**:
   - Mengontrol Asterisk via **ARI (Asterisk REST Interface)** untuk membuat channel, membunyikan dering, menggabungkan channel ke bridge, dan memutus panggilan.
   - Mengelola pensinyalan WebSocket ke browser agen (memberitahu siapa yang menelpon, mendeteksi agen yang klik angkat, notifikasi panggilan berakhir).
   - Menerima Webhook dari Meta untuk status level-aplikasi panggilan keluar.
   - Menyimpan riwayat panggilan, kontak pelanggan, data akun WhatsApp, dan mengunggah file rekaman ke MinIO.

3. **Browser Softphone (Web UI)**:
   - Berbicara **SIP-over-WebSocket** langsung ke Asterisk untuk pertukaran audio (WebRTC).
   - Terhubung melalui **WebSocket terpisah** ke backend NusaCall untuk sinyal UI (notifikasi dering, tombol jawab, transfer, dsb).

---

## 🔄 Alur Panggilan (Call Flow Summary)

> Detail lengkap dan diagram sequence dapat dilihat di [docs/CALL_FLOW.md](docs/CALL_FLOW.md).

### 1. Dua Jalur Sinyal yang Berbeda

- **Jalur SIP (Trunk)**: Menangani sinyal telepon di level trunk (INVITE, ringing, answer, hangup). Digunakan secara penuh untuk **panggilan masuk**, dan sebagian untuk panggilan keluar.
- **Jalur Webhook Meta**: Menangani event yang terjadi **di dalam aplikasi WhatsApp pelanggan** (misal: notifikasi berdering di HP, tombol geser jawab/tolak oleh pelanggan). Jalur ini **hanya digunakan untuk panggilan keluar**.

### 2. Alur Panggilan Masuk (Inbound)

1. **Panggilan Tiba**: Pelanggan menelpon nomor WhatsApp bisnis $\rightarrow$ Meta mengirim SIP INVITE ke Asterisk.
2. **Notifikasi ke Backend**: Asterisk memicu event ARI `StasisStart(inbound, phoneNumberId)`.
3. **Dering & Routing**: Backend membunyikan dering (`ringChannel`) dan mengirim event WebSocket `incoming_call` ke semua agen yang berstatus online.
4. **Perebutan Panggilan (Race Guard)**: Agen pertama yang mengklik tombol "Angkat" memicu `answer_call` ke backend. Backend menggunakan rank-guard untuk mengunci panggilan ke agen tersebut; agen lain menerima notifikasi `call_taken`.
5. **Bridge Audio**: Backend meminta Asterisk memanggil channel agen (`PJSIP/agent-<id>`) dan menggabungkannya dengan channel pelanggan ke dalam sebuah **Bridge**.
6. **Aktif**: Audio dua arah mengalir langsung antara pelanggan $\leftrightarrow$ Asterisk $\leftrightarrow$ agen. Status panggilan di database berubah menjadi `ACTIVE`.

### 3. Alur Panggilan Keluar (Outbound)

1. **Inisiasi**: Agen menginput nomor tujuan di web UI $\rightarrow$ `POST /api/call/outbound`.
2. **Dial Pelanggan**: Backend memerintahkan Asterisk meng-originate panggilan ke Meta (`PJSIP/<nomor-E.164>@meta-<phoneNumberId>`).
3. **Koneksi Agen**: Begitu channel keluar terbentuk di Asterisk, backend memanggil agen dan menggabungkannya ke bridge.
4. **Konfirmasi Meta Webhook**: Ketika pelanggan benar-benar menggeser tombol jawab di HP-nya, Meta mengirim webhook status `accepted`. Backend memvalidasi event, memperbarui status panggilan menjadi `ACTIVE`, dan mengirim notifikasi WS `call_state: active` ke agen.

### 4. Akhir Panggilan & Rekaman

- Saat salah satu pihak menutup telepon, Asterisk mengirim event `StasisEnd`. Backend menghancurkan bridge, menentukan `endReason` (`customer_hangup`, `agent_hangup`, dsb.), dan mencatat durasi panggilan.
- Asterisk merekam audio bridge secara otomatis. Saat rekaman selesai (`RecordingFinished`), backend mengunggah file `.wav` ke MinIO dan mencatatnya di tabel `call_recordings`.

---

## ➕ Menambahkan Akun WhatsApp Baru (Summary)

> Panduan langkah demi langkah dan troubleshooting lengkap tersedia di [docs/ADD_WHATSAPP_ACCOUNT.md](docs/ADD_WHATSAPP_ACCOUNT.md).

Untuk menambahkan nomor WhatsApp Business baru ke NusaCall, konfigurasi harus sinkron di **4 sistem**:

```
Meta Business Manager   ──►   Asterisk PBX (voip1)   ──►   Backend (meta.json)   ──►   Database (accounts)
(WABA, SIP, Phone ID)         (pjsip & extensions)         (App & WABA ID)             (Insert record & sync)
```

1. **Meta Business Manager**:
   - Daftarkan nomor telepon di WhatsApp Manager dan catat `phone_number_id`, `business_account_id` (WABA ID), dan nomor E.164.
   - Hubungkan Meta App dengan WABA (System User permissions: `whatsapp_business_management`, `whatsapp_business_messaging`).
   - Aktifkan **Calling API** dengan koneksi **SIP** $\rightarrow$ Arahkan ke `voip1.nusa.net.id:5061` (TLS) dan tetapkan kredensial SIP (username/password).
2. **Asterisk PBX (`voip1`)**:
   - Tambahkan endpoint PJSIP di `/etc/asterisk/pjsip_nusacall.conf` (`meta-aor`, `meta-auth`, `meta-<id>`, dan `meta-identify` menggunakan IP range resmi Meta AS32934).
   - Tambahkan konteks dialplan di `/etc/asterisk/extensions_nusacall.conf`:
     ```ini
     [nusacall-inbound-<PHONE_NUMBER_ID>]
     exten => _+X.,1,Stasis(nusacall-sip,inbound,<PHONE_NUMBER_ID>)
      same => n,Hangup()
     ```
   - Reload Asterisk: `asterisk -rx "pjsip reload"` & `asterisk -rx "dialplan reload"`.
3. **Backend `configs/meta.json`**:
   - Daftarkan `whatsapp_business_accounts` di file konfigurasi backend.
   - Restart proses backend (`pm2 restart 8001-nusacall`).
4. **Database NusaCall (`accounts`)**:
   - Masukkan baris baru ke tabel `accounts` dengan `phone_number_id`, `business_account_id`, `display_phone_number`, dll.
   - Jalankan sinkronisasi ke Meta:
     ```bash
     curl -X POST https://call.nusacontact.com/api/account/<ID>/sync -H "Authorization: Bearer <JWT>"
     ```
   - Aktifkan panggilan (`calling_enabled = 1`) setelah verifikasi tes masuk dan keluar berhasil.

---

## 🛠️ Tech Stack

| Komponen            | Teknologi                      | Deskripsi                                      |
| ------------------- | ------------------------------ | ---------------------------------------------- |
| **Runtime**         | [Bun](https://bun.sh) (>= 1.0) | High-performance JavaScript/TypeScript runtime |
| **Framework**       | [Hono](https://hono.dev)       | Lightweight web framework                      |
| **Database**        | MySQL 8.0+                     | Penyimpanan relasional                         |
| **ORM**             | TypeORM                        | Data access & repository pattern               |
| **Validation**      | Zod + `@hono/zod-validator`    | Validasi skema request input                   |
| **Auth**            | JWT via `hono/jwt`             | Autentikasi access & refresh token             |
| **Realtime**        | WebSocket (ws)                 | Pensinyalan kontrol panggilan ke agen          |
| **PBX Integration** | Asterisk ARI                   | Integrasi Stasis REST & WebSocket PBX          |
| **Object Storage**  | MinIO (S3 Compatible)          | Penyimpanan file rekaman suara                 |
| **Email**           | Nodemailer                     | Notifikasi email & reset password              |

---

## 🏛️ Arsitektur Kode (Clean Architecture)

Proyek ini menggunakan **Clean Architecture** dengan Dependency Injection manual pada layer **Composition Root** (`*.module.ts`):

```
Controller (HTTP Handler)
    │
    ▼
Service (Business Logic)
    │
    ▼
Repository Interface (Domain Contract)
    │
    ▼
TypeORM Repository (Database Access)
```

### Struktur Folder

```
src/
├── config/              # Konfigurasi aplikasi (env, database, smtp)
├── core/                # Shared abstractions & helpers
│   ├── exceptions/      # Base HTTP exception classes
│   ├── helpers/         # Response formatter, hash, logger, minio, auth
│   ├── i18n/            # Kamus terjemahan respons (en.json, id.json)
│   └── middlewares/     # JWT auth, API key guard, logger, language
├── gateway/             # WebSocket Gateway untuk browser agen
├── infrastructure/      # Third-party integrations (Nusawork, Asterisk ARI)
├── modules/             # Modul domain & fitur aplikasi
│   ├── account/         # Akun WhatsApp WABA & sinkronisasi Meta
│   ├── auth/            # Registrasi, login, Google OAuth, refresh token
│   ├── branch/          # Manajemen cabang perusahaan
│   ├── call/            # Sinyal panggilan, ARI handler, state machine, rekaman
│   ├── contact/         # Manajemen kontak pelanggan
│   ├── organization/    # Manajemen organisasi
│   ├── permission/      # Call permission & role izin
│   ├── routing/         # Logika antrian & penugasan agen
│   ├── user/            # Manajemen agen & user
│   └── webhook/         # Handler webhook WhatsApp Meta
├── routes/
│   └── api.ts           # Definisi seluruh rute HTTP & middleware
└── index.ts             # Entry point server Hono
```

---

## 🚀 Memulai (Quick Start)

### Prasyarat

- [Bun](https://bun.sh) >= 1.0
- MySQL >= 8.0
- MinIO server (untuk penyimpanan rekaman)
- Asterisk PBX dengan ARI aktif (untuk fitur VoIP)

### Instalasi

1. Clone repositori:

   ```bash
   git clone <repository-url>
   cd be
   ```

2. Pasang dependencies:

   ```bash
   bun install
   ```

3. Siapkan environment file:
   ```bash
   cp .env.dist .env
   ```
   Sesuaikan nilai-nilai di `.env` (lihat bagian [Konfigurasi Environment](#-konfigurasi-environment)).

### Menjalankan Server

```bash
# Mode Development (hot-reload)
bun run dev

# Menjalankan Test Suite
DB_TEST_NAME=nusacall_test bun test

# Build & Run Production
bun run build
bun run start
```

### Menggunakan PM2 (Production)

```bash
pm2 start ecosystem.config.js
pm2 logs nusacall-be
pm2 reload nusacall-be
```

---

## ⚙️ Konfigurasi Environment

| Variabel             | Deskripsi                                       | Default / Contoh               |
| -------------------- | ----------------------------------------------- | ------------------------------ |
| `PORT`               | Port HTTP backend                               | `4000`                         |
| `ENV`                | Environment (`development` / `production`)      | `development`                  |
| `APP_URL`            | Base URL publik server                          | `https://call.nusacontact.com` |
| `DB_HOST`            | Host database MySQL                             | `localhost`                    |
| `DB_PORT`            | Port database MySQL                             | `3306`                         |
| `DB_USER`            | Username database                               | `root`                         |
| `DB_PASS`            | Password database                               | `secret`                       |
| `DB_NAME`            | Nama database                                   | `nusacall`                     |
| `DB_SYNC`            | Auto-sync skema TypeORM (wajib `false` di prod) | `false`                        |
| `JWT_SECRET`         | Secret key JWT access token                     | —                              |
| `JWT_REFRESH_SECRET` | Secret key JWT refresh token                    | —                              |
| `API_KEY`            | Kunci otorisasi server-to-server                | —                              |
| `META_CONFIG_PATH`   | Lokasi file konfigurasi Meta WABA               | `configs/meta.json`            |
| `ASTERISK_ARI_URL`   | URL Asterisk REST Interface                     | `http://127.0.0.1:8088`        |
| `ASTERISK_ARI_USER`  | Username Asterisk ARI                           | `nusacall`                     |
| `ASTERISK_ARI_PASS`  | Password Asterisk ARI                           | —                              |
| `ASTERISK_ARI_APP`   | Nama Stasis application                         | `nusacall-sip`                 |
| `MINIO_ENDPOINT`     | Endpoint host MinIO                             | `127.0.0.1`                    |
| `MINIO_PORT`         | Port MinIO                                      | `9000`                         |
| `MINIO_USE_SSL`      | Gunakan HTTPS untuk MinIO                       | `false`                        |
| `MINIO_ACCESS_KEY`   | Access Key MinIO                                | —                              |
| `MINIO_SECRET_KEY`   | Secret Key MinIO                                | —                              |
| `MINIO_BUCKET`       | Nama bucket rekaman panggilan                   | `nusacall-recordings`          |

---

## 📚 Dokumentasi Terkait

Untuk panduan mendalam tentang arsitektur dan operasional NusaCall, silakan baca dokumentasi di folder `docs/`:

- [docs/CALL_FLOW.md](docs/CALL_FLOW.md) — Alur teknis panggilan masuk & keluar, penanganan status, dan ARI lifecycle.
- [docs/ADD_WHATSAPP_ACCOUNT.md](docs/ADD_WHATSAPP_ACCOUNT.md) — Panduan integrasi nomor WhatsApp baru (Meta WABA + Asterisk + DB).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Desain Clean Architecture, Repository Pattern, dan alur request.
- [docs/MODULE_GUIDE.md](docs/MODULE_GUIDE.md) — Standar pembuatan modul dan fitur baru.
- [docs/DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md) — Entity TypeORM, relasi, dan repository conventions.
- [docs/LANGUAGE_GUIDE.md](docs/LANGUAGE_GUIDE.md) — Sistem deteksi bahasa (i18n) dan kamus pesan API.
- [docs/LOGGING_GUIDE.md](docs/LOGGING_GUIDE.md) — Panduan structured JSON logging untuk Loki & Grafana.
