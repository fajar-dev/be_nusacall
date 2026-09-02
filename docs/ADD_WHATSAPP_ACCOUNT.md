# ➕ Menambahkan Akun WhatsApp Baru (Nomor Baru)

Dokumen ini adalah panduan lengkap untuk menghubungkan nomor WhatsApp Business baru ke NusaCall — mulai dari sisi Meta, trunk SIP di Asterisk (voip1), sampai baris data di database. **Belum ada UI/endpoint "tambah akun"** di aplikasi — proses ini masih manual di beberapa titik (lihat catatan di tiap langkah).

---

## Gambaran Umum Alur

```
Meta Business Manager                 voip1 (Asterisk)              Backend NusaCall
──────────────────────                ─────────────────              ─────────────────
1. Nomor WA terdaftar         →                                  →   4. configs/meta.json
   di WABA                                                            (App ↔ WABA)
2. App di-subscribe ke WABA,                                     →   5. INSERT ke tabel
   webhook diaktifkan                                                  `accounts`
3. Calling diaktifkan,        →   3b. Trunk PJSIP per nomor       →   6. POST /account/:id/sync
   mode SIP, hostname/port         (pjsip_nusacall.conf +              (dorong call_hours,
   voip1 + kredensial SIP          extensions_nusacall.conf)          icon visibility, SIP
   di-exchange dengan Meta                                            server ke Meta)
```

Empat sistem harus konsisten untuk satu `phoneNumberId`: **Meta** (WABA + calling settings), **Asterisk** (trunk PJSIP + dialplan), **`configs/meta.json`** (App ↔ WABA), dan tabel **`accounts`** di database.

---

## Prasyarat

- Akses ke [Meta Business Manager](https://business.facebook.com) dengan izin admin pada WABA (WhatsApp Business Account) terkait, atau WABA baru yang sudah dibuat.
- Nomor telepon yang akan didaftarkan (belum terpakai di WhatsApp pribadi/Business App biasa).
- Akses SSH ke `voip1.nusa.net.id` dengan sudo (untuk Asterisk) dan ke server aplikasi (untuk `configs/meta.json`, `.env`, database).
- **Fitur "Calling API — SIP connection" harus sudah diaktifkan/disetujui Meta** untuk WABA tersebut. Ini bukan fitur self-service biasa — kalau WABA belum pernah pakai calling lewat SIP, koordinasikan dulu dengan tim Meta/partner sebelum lanjut ke Langkah 3.

---

## Langkah 1 — Daftarkan Nomor di Meta Business Manager

1. Buka **WhatsApp Manager** → **Phone Numbers** pada Business Account (WABA) yang dituju.
2. Tambahkan nomor baru (verifikasi via SMS/panggilan sesuai alur standar Meta), atau pilih nomor yang sudah ada tapi belum dipakai untuk calling.
3. Catat dua nilai ini — akan dipakai di seluruh langkah berikutnya:
   - **Phone Number ID** (`phone_number_id`) — angka panjang, unik per nomor.
   - **WhatsApp Business Account ID** (`business_account_id`, alias WABA ID).
   - Nomor tampilan dalam format E.164 tanpa `+` (mis. `628116341122`) — dipakai sebagai `from_user`/SIP username.

> Kalau nomor ini masuk WABA yang **sudah** terdaftar di `configs/meta.json` App yang sama, lewati bagian "buat App baru" di Langkah 2 — cukup tambahkan WABA/nomor ke App yang sudah ada.

---

## Langkah 2 — Pastikan Meta App Terhubung ke WABA

Kalau nomor baru ini masih di bawah WABA yang **sudah** dikenal `configs/meta.json` (App yang sama), langkah ini biasanya sudah beres — lewati ke Langkah 3.

Kalau WABA-nya baru:

1. Di [developers.facebook.com](https://developers.facebook.com), App yang dipakai NusaCall (lihat `configs/meta.json` → field `id`/`name`) harus di-**subscribe** ke WABA baru ini (App Dashboard → WhatsApp → Configuration → pilih WABA, atau via Embedded Signup kalau alurnya lewat situ).
2. Pastikan **System User access token** App tersebut punya izin `whatsapp_business_management` dan `whatsapp_business_messaging` atas WABA baru ini (App Dashboard → Business Settings → System Users → Assign Assets).
3. Webhook App (lihat Langkah 6) otomatis berlaku untuk semua WABA yang di-subscribe ke App yang sama — tidak perlu setup webhook terpisah per WABA.

---

## Langkah 3 — Aktifkan Calling (SIP) di Sisi Meta

Di WhatsApp Manager, untuk nomor yang baru didaftarkan:

1. Masuk ke pengaturan **Calling** nomor tersebut, aktifkan Calling API, pilih metode koneksi **SIP** (bukan Cloud API/WebRTC bawaan — NusaCall sudah sepenuhnya pindah dari WebRTC ke SIP).
2. Isi SIP server tujuan Meta akan mengarahkan panggilan inbound:
   - **Hostname**: `voip1.nusa.net.id`
   - **Port**: `5061` (TLS)
3. Tetapkan **kredensial SIP** (username/password) yang Meta pakai untuk autentikasi trunk ini. Generate password acak yang kuat, contoh:
   ```bash
   openssl rand -base64 24
   ```
   Username-nya adalah nomor tampilan E.164 tanpa `+` (mis. `628116341122`). **Simpan kredensial ini** — dipakai persis sama di konfigurasi Asterisk pada Langkah 4.

   > Bagian ini prosesnya di sisi Meta dan detail langkahnya bisa berbeda tergantung status akses Calling API akun Anda (self-service vs. lewat koordinasi dengan tim Meta/partner). Yang penting: hostname, port, username, dan password di sisi Meta harus **identik** dengan yang dimasukkan ke `pjsip_nusacall.conf` di Langkah 4 — kalau salah satu beda, panggilan outbound ke Meta akan gagal auth (`403`/`401`).
4. Meta biasanya juga meminta sertifikat/validasi TLS server Anda — Asterisk di voip1 sudah pakai sertifikat Let's Encrypt yang valid untuk domain `voip1.nusa.net.id` (`/etc/asterisk/keys/voip1.fullchain.pem`), jadi tidak perlu setup ulang, cukup pastikan sertifikat itu belum kedaluwarsa.

---

## Langkah 4 — Tambahkan Trunk di Asterisk (voip1)

Setiap nomor WhatsApp punya blok PJSIP sendiri di `/etc/asterisk/pjsip_nusacall.conf`, mengikuti pola nomor yang sudah ada (`335964456263211` / `628116341122`). Ganti `<PHONE_NUMBER_ID>`, `<DISPLAY_NUMBER>`, dan `<SIP_PASSWORD>` sesuai Langkah 1 & 3:

```ini
; Akun: <Label> (phoneNumberId <PHONE_NUMBER_ID>, display number <DISPLAY_NUMBER>)
[meta-aor-<PHONE_NUMBER_ID>]
type=aor
contact=sip:wa.meta.vc:5061;transport=tls
qualify_frequency=0

[meta-auth-<PHONE_NUMBER_ID>]
type=auth
auth_type=userpass
username=<DISPLAY_NUMBER>
password=<SIP_PASSWORD>

[meta-<PHONE_NUMBER_ID>]
type=endpoint
transport=transport-tls
context=nusacall-inbound-<PHONE_NUMBER_ID>
disallow=all
allow=opus
aors=meta-aor-<PHONE_NUMBER_ID>
auth=meta-auth-<PHONE_NUMBER_ID>
outbound_auth=meta-auth-<PHONE_NUMBER_ID>
from_user=<DISPLAY_NUMBER>
from_domain=voip1.nusa.net.id
identify_by=ip,username
direct_media=no
rtp_symmetric=yes
force_rport=yes
media_encryption=dtls
dtls_verify=no
dtls_setup=actpass
ice_support=yes
rtcp_mux=yes
dtls_auto_generate_cert=yes
use_avpf=yes

[meta-identify-<PHONE_NUMBER_ID>]
type=identify
endpoint=meta-<PHONE_NUMBER_ID>
match=31.13.24.0/21
match=57.144.0.0/14
match=66.220.144.0/20
match=69.63.176.0/20
match=69.171.224.0/19
match=102.132.96.0/20
match=103.4.96.0/22
match=129.134.0.0/16
match=157.240.0.0/16
match=173.252.64.0/18
match=179.60.192.0/22
match=185.60.216.0/22
match=204.15.20.0/22
```

> Rentang IP di atas adalah IP range resmi Meta/Facebook (AS32934) — **sama untuk semua nomor**, tinggal salin. Jangan pakai `match=0.0.0.0/0` — pernah menyebabkan REGISTER agent ikut divalidasi memakai kredensial trunk Meta dan gagal terus (lihat bagian Troubleshooting).

Lalu tambahkan konteks dialplan untuk nomor ini di `/etc/asterisk/extensions_nusacall.conf`:

```ini
[nusacall-inbound-<PHONE_NUMBER_ID>]
exten => _+X.,1,NoOp(Inbound WhatsApp SIP call to <PHONE_NUMBER_ID> from ${CALLERID(num)})
 same => n,Stasis(nusacall-sip,inbound,<PHONE_NUMBER_ID>)
 same => n,Hangup()
```

Reload modul (backend/`is5` tidak punya akses root langsung, tapi kalau Anda edit langsung sebagai user dengan sudo, `core reload` lebih sederhana):

```bash
sudo asterisk -rx "pjsip reload"
sudo asterisk -rx "dialplan reload"
```

Verifikasi endpoint baru terdaftar:

```bash
sudo asterisk -rx "pjsip show endpoint meta-<PHONE_NUMBER_ID>"
```

---

## Langkah 5 — Daftarkan App ↔ WABA di `configs/meta.json`

File ini di-load sekali saat backend start (`META_CONFIG_PATH`, default `configs/meta.json` relatif ke working directory backend). Kalau WABA baru belum ada di daftar `whatsapp_business_accounts` App yang sesuai, tambahkan:

```json
{
  "applications": [
    {
      "id": "2557970884643385",
      "name": "nusacall",
      "secret": "...",
      "verify_token": "...",
      "access_token": "...",
      "api_url": "https://graph.facebook.com/v23.0",
      "whatsapp_business_accounts": [
        { "id": "340483899145969", "name": "Nusawork" },
        { "id": "<WABA_ID_BARU>", "name": "<Label WABA>" }
      ]
    }
  ]
}
```

Kalau ini App/System User yang **benar-benar baru** (bukan sekadar WABA baru di App yang sama), tambahkan objek `applications[]` baru dengan `id`, `secret`, `verify_token`, `access_token` App tersebut.

**Wajib restart backend** setelah mengubah file ini — tidak ada hot-reload:

```bash
# di voip1, sebagai user is5
pm2 restart 8001-nusacall   # atau sesuai nama proses pm2 yang berjalan
```

---

## Langkah 6 — Insert Baris ke Tabel `accounts`

Belum ada endpoint API untuk membuat akun baru — insert langsung ke database (bukan lewat migration, sesuai konvensi proyek ini untuk perubahan data):

```sql
INSERT INTO accounts (
    app_id,
    phone_number_id,
    business_account_id,
    display_phone_number,
    label,
    calling_enabled,
    call_icon_visibility,
    color,
    permission_template_name,
    permission_template_language,
    call_hours,
    created_at,
    updated_at
) VALUES (
    '2557970884643385',        -- app_id (Meta App id, opsional/informatif)
    '<PHONE_NUMBER_ID>',
    '<WABA_ID>',
    '<DISPLAY_NUMBER>',        -- mis. 628116341122
    '<Label untuk ditampilkan>',
    0,                          -- calling_enabled: mulai dari 0, aktifkan setelah lolos uji coba
    'DEFAULT',                  -- call_icon_visibility: DEFAULT | DISABLE_ALL
    '#6366F1',
    NULL,                       -- permission_template_name, isi setelah template disetujui (Langkah 8)
    NULL,                       -- permission_template_language
    NULL,                       -- call_hours, format JSON — lihat contoh di bawah
    UTC_TIMESTAMP(),
    UTC_TIMESTAMP()
);
```

Contoh isi `call_hours` (opsional, JSON, kalau ingin membatasi jam operasional calling):

```json
{
  "status": "ENABLED",
  "timezone_id": "Asia/Jakarta",
  "weekly_operating_hours": [
    { "day_of_week": "MONDAY", "open_time": "0800", "close_time": "1700" },
    { "day_of_week": "TUESDAY", "open_time": "0800", "close_time": "1700" }
  ],
  "holiday_schedule": []
}
```

> Catat `id` baris yang baru dibuat (`SELECT LAST_INSERT_ID();`) — dipakai di langkah berikutnya.

---

## Langkah 7 — Sync Pengaturan Calling ke Meta

Endpoint ini sudah ada dan menangani sinkronisasi (`call_hours`, `call_icon_visibility`, dan **SIP server hostname/port** — `voip1.nusa.net.id:5061` — didorong lewat Graph API `PATCH /{phone_number_id}/settings`):

```bash
curl -X POST https://call.nusacontact.com/api/account/<ID>/sync \
  -H "Authorization: Bearer <JWT_ANDA>"
```

Atau lewat UI NusaCall: buka halaman **Account**, cari akun yang baru dibuat, klik **Sync**. Nyalakan `callingEnabled` (`PUT /api/account/:id` dengan `{ "callingEnabled": true }`) begitu siap menerima panggilan sungguhan — ini juga otomatis mengirim `calling.status=ENABLED` ke Meta lewat sync yang sama.

Verifikasi status webhook Meta sudah tersubscribe dengan benar (biasanya sudah otomatis kalau App sudah dikonfigurasi di Langkah 2/5):

- Callback URL: `https://call.nusacontact.com/wh`
- Verify token: sama dengan `verify_token` App terkait di `configs/meta.json`
- Fields yang disubscribe minimal: `calls`, `account_update`

---

## Langkah 8 — (Opsional tapi Disarankan) Template Izin Panggilan

WhatsApp mewajibkan izin eksplisit dari pelanggan sebelum bisa menelepon mereka (call permission request). Siapkan template pesan yang **disetujui Meta** (WhatsApp Manager → Message Templates, kategori yang mendukung call permission), lalu simpan namanya ke akun:

```bash
curl -X PUT https://call.nusacontact.com/api/account/<ID> \
  -H "Authorization: Bearer <JWT_ANDA>" \
  -H "Content-Type: application/json" \
  -d '{
    "permissionTemplateName": "nama_template_anda",
    "permissionTemplateLanguage": "id"
  }'
```

Bisa juga cek daftar template yang sudah APPROVED untuk akun ini lewat `GET /api/account/:id/templates`.

---

## Langkah 9 — Uji Coba

1. **Inbound**: telepon nomor WhatsApp baru dari HP pribadi. Cek log ARI di backend (`StasisStart` dengan `args: ["inbound", "<PHONE_NUMBER_ID>"]`), pastikan panggilan masuk muncul di UI dan bisa diangkat, audio dua arah normal.
2. **Outbound**: dari UI NusaCall, telepon keluar ke nomor test dari akun baru ini. Pastikan format nomor tujuan valid E.164 (`toE164()` menambahkan `+` otomatis) dan panggilan benar-benar berdering di HP tujuan (bukan cuma `200 OK` tanpa dering — pernah jadi bug kalau `+` hilang atau `from_domain` belum diset, lihat Troubleshooting).
3. **Rekaman** (kalau `CALL_RECORDING_ENABLED=true`): pastikan setelah panggilan selesai muncul baris baru di tabel `call_recordings` dan file bisa diputar dari UI.
4. Cek `pjsip show endpoint meta-<PHONE_NUMBER_ID>` di Asterisk — statusnya harus `Unmonitored`/registrasi sesuai (trunk Meta tidak pakai `qualify`, jadi tidak akan tampil "Reachable" seperti endpoint biasa).

---

## Checklist Ringkas

- [ ] Nomor terdaftar di WABA Meta, `phone_number_id` & `business_account_id` dicatat
- [ ] App di-subscribe ke WABA (kalau WABA baru)
- [ ] Calling API diaktifkan, mode **SIP**, hostname `voip1.nusa.net.id:5061`, kredensial SIP disepakati
- [ ] Blok `meta-aor` / `meta-auth` / `meta-<id>` / `meta-identify` ditambahkan di `pjsip_nusacall.conf`
- [ ] Konteks `nusacall-inbound-<id>` ditambahkan di `extensions_nusacall.conf`
- [ ] `pjsip reload` + `dialplan reload` di Asterisk
- [ ] WABA ditambahkan ke `configs/meta.json`, backend di-restart
- [ ] Baris baru di tabel `accounts`
- [ ] `POST /account/:id/sync` berhasil, `callingEnabled` diaktifkan saat siap
- [ ] Template izin panggilan disiapkan (opsional)
- [ ] Tes inbound & outbound berhasil, audio dua arah, rekaman tersimpan

---

## Troubleshooting Umum

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Panggilan keluar dapat `200 OK` dari Meta tapi HP tujuan tidak pernah berdering | Nomor tujuan dikirim tanpa `+` (bukan E.164 penuh) | Pastikan pakai `toE164()`, bukan `normalizePhoneNumber()` mentah, saat originate ke `PJSIP/<nomor>@meta-<id>` |
| Panggilan keluar ditolak `403 ... anonymous.invalid ...` | `from_domain` belum diset di endpoint | Tambahkan `from_domain=voip1.nusa.net.id` di blok `[meta-<id>]` |
| Agent gagal REGISTER setelah trunk baru ditambahkan ("Failed to authenticate") | `identify` salah satu trunk Meta memakai `match=0.0.0.0/0`, ikut menyapu traffic REGISTER agent | Pastikan setiap `[meta-identify-<id>]` cuma pakai range IP Meta/Facebook resmi (lihat Langkah 4), bukan wildcard |
| Panggilan tersambung 2 arah tapi status di database tetap `failed`/`media_failure` | Ini bug lama yang sudah diperbaiki (outbound call tidak pernah pindah ke status `ACTIVE`) — kalau muncul lagi, cek `AsteriskCallHandlerService.handleAgentStart` | Pastikan versi backend yang jalan sudah termasuk commit fix status outbound |
| Rekaman tidak bisa diputar dari UI, tapi file ada di MinIO | Mixed content — presigned URL MinIO pakai `http://` sedangkan halaman diakses lewat `https://` | Lihat diskusi terpisah soal opsi penyajian rekaman lewat HTTPS (proxy backend vs. reverse-proxy TLS di depan MinIO) |
| `Meta applications loaded ... businessAccounts: 0` di log saat startup | `configs/meta.json` tidak terbaca / WABA belum ditambahkan ke array `whatsapp_business_accounts` | Cek `META_CONFIG_PATH`, validasi JSON, pastikan `access_token` & `secret` terisi |
