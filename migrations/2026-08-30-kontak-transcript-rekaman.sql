-- Migrasi produksi: identitas lawan bicara pindah ke contacts, transcript dihapus,
-- rekaman Meta diganti rekaman milik backend.
--
-- URUTAN WAJIB
--   1. Hentikan aplikasi.
--   2. Ambil cadangan basis data.
--   3. Jalankan FASE 1 di bawah (menambah kolom dan memindahkan data).
--   4. Deploy kode baru. Bila DB_SYNC=true, kolom lama akan ikut terhapus
--      sendiri pada langkah ini; bila DB_SYNC=false jalankan FASE 3.
--
-- FASE 1 HARUS berjalan SEBELUM kode baru menyentuh basis data. Sinkronisasi
-- skema menghapus kolom lama tanpa memindahkan isinya lebih dulu, sehingga
-- wa_id pada calls dan call_permissions akan hilang bila urutannya terbalik.
--
-- Skrip ini idempoten: menjalankannya dua kali tidak menimbulkan galat.

-- ════════════════════════════════════════════════════════════════════
-- FASE 1 — sebelum deploy
-- ════════════════════════════════════════════════════════════════════

-- 1.1 contacts: ganti nama kolom dan tambah kolom baru --------------------

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contacts' AND COLUMN_NAME='wa_id'),
    'ALTER TABLE contacts RENAME COLUMN wa_id TO phone_number', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contacts' AND COLUMN_NAME='profile_name'),
    'ALTER TABLE contacts RENAME COLUMN profile_name TO name', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contacts' AND COLUMN_NAME='time_zone'),
    'ALTER TABLE contacts ADD COLUMN time_zone varchar(64) NOT NULL DEFAULT ''UTC''', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='contacts' AND COLUMN_NAME='branch_id'),
    'ALTER TABLE contacts ADD COLUMN branch_id int NULL', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1.2 call_permissions: siapkan contact_id (masih boleh NULL selama diisi) --

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_permissions' AND COLUMN_NAME='contact_id'),
    'ALTER TABLE call_permissions ADD COLUMN contact_id int NULL', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1.3 Buat kontak untuk setiap nomor yang belum punya ---------------------
-- Nama diambil dari profile_name panggilan terakhir yang mengisinya.

-- Seluruh langkah pemindahan data dilewati bila kolom wa_id sudah tidak ada,
-- yaitu ketika FASE 3 pernah dijalankan, agar skrip tetap aman diulang.
SET @ada_wa_id = EXISTS(SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calls' AND COLUMN_NAME='wa_id');

SET @sql = IF(@ada_wa_id, "INSERT INTO contacts (phone_number, name, time_zone, created_at, updated_at)
SELECT sumber.wa_id,
       (SELECT c.profile_name FROM calls c
         WHERE c.wa_id = sumber.wa_id AND c.profile_name IS NOT NULL
         ORDER BY c.created_at DESC LIMIT 1),
       'UTC', NOW(6), NOW(6)
FROM (
    SELECT wa_id FROM calls WHERE wa_id IS NOT NULL
    UNION
    SELECT wa_id FROM call_permissions WHERE wa_id IS NOT NULL
) AS sumber
WHERE NOT EXISTS (SELECT 1 FROM contacts k WHERE k.phone_number = sumber.wa_id)", 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1.4 Isi calls.contact_id ------------------------------------------------

SET @sql = IF(@ada_wa_id, "UPDATE calls c JOIN contacts k ON k.phone_number = c.wa_id
   SET c.contact_id = k.id
 WHERE c.contact_id IS NULL", 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1.5 Isi call_permissions.contact_id -------------------------------------

SET @sql = IF(@ada_wa_id, "UPDATE call_permissions p JOIN contacts k ON k.phone_number = p.wa_id
   SET p.contact_id = k.id
 WHERE p.contact_id IS NULL", 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Baris izin tanpa kontak tidak dapat dipertahankan karena kolomnya wajib.
-- Ini hanya cache izin dari Meta dan akan terbentuk lagi dengan sendirinya.
DELETE FROM call_permissions WHERE contact_id IS NULL;

ALTER TABLE call_permissions MODIFY COLUMN contact_id int NOT NULL;

-- 1.6 call_recordings: kolom rekaman milik backend ------------------------

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings' AND COLUMN_NAME='s3_key'),
    'ALTER TABLE call_recordings ADD COLUMN s3_key varchar(255) NULL', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings' AND COLUMN_NAME='duration_seconds'),
    'ALTER TABLE call_recordings ADD COLUMN duration_seconds int NOT NULL DEFAULT 0', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 1.7 accounts: template permintaan izin dipilih per akun, bukan lewat env.

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts' AND COLUMN_NAME='permission_template_name'),
    'ALTER TABLE accounts ADD COLUMN permission_template_name varchar(128) NULL', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts' AND COLUMN_NAME='permission_template_language'),
    'ALTER TABLE accounts ADD COLUMN permission_template_language varchar(16) NULL', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ════════════════════════════════════════════════════════════════════
-- FASE 2 — periksa sebelum deploy
-- Ketiga angka harus 0.
-- ════════════════════════════════════════════════════════════════════

SELECT 'panggilan tanpa kontak' AS pemeriksaan,
       COUNT(*) AS harus_nol FROM calls WHERE contact_id IS NULL
UNION ALL
SELECT 'izin tanpa kontak', COUNT(*) FROM call_permissions WHERE contact_id IS NULL
UNION ALL
SELECT 'kontak ganda', COUNT(*) FROM (
    SELECT phone_number FROM contacts GROUP BY phone_number HAVING COUNT(*) > 1
) AS ganda
UNION ALL
SELECT 'kontak format lama', COUNT(*) FROM contacts WHERE phone_number LIKE '0%';

-- Nomor kini diseragamkan ke format internasional tanpa plus. Kontak berawalan 0
-- berasal dari input manual sebelum penyeragaman berlaku dan bisa kembar dengan
-- nomor 62 yang sama, jadi gabungkan lebih dulu agar panggilan tidak menunjuk ke
-- kontak yang keliru.

-- ════════════════════════════════════════════════════════════════════
-- FASE 3 — setelah deploy, HANYA bila DB_SYNC=false
-- Dengan DB_SYNC=true bagian ini sudah dikerjakan sinkronisasi skema.
-- ════════════════════════════════════════════════════════════════════

-- 3.1 Indeks unik lama menahan kolom wa_id, jadi dilepas lebih dulu.

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE call_permissions DROP INDEX ', INDEX_NAME)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_permissions' AND COLUMN_NAME='wa_id' LIMIT 1), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.2 Kolom identitas yang kini diambil dari relasi contact.

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE calls ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME)))
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calls'
     AND COLUMN_NAME IN ('display_phone_number','wa_id','profile_name','contact_name')), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_permissions' AND COLUMN_NAME='wa_id'),
    'ALTER TABLE call_permissions DROP COLUMN wa_id', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.3 Sembilan kolom transcript.

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calls' AND COLUMN_NAME='transcription_enabled'),
    'ALTER TABLE calls DROP COLUMN transcription_enabled', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE call_recordings ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME)))
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings'
     AND COLUMN_NAME LIKE 'transcript\_%'), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.4 nusawa_log_queue: wa_id diseragamkan menjadi phone_number.

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nusawa_log_queue' AND COLUMN_NAME='wa_id'),
    'ALTER TABLE nusawa_log_queue RENAME COLUMN wa_id TO phone_number', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.5 Kolom wacid yang mubazir. Nilainya sudah dapat ditelusuri lewat relasi
--     call_id, dan pada call_recordings juga tersimpan di dalam s3_key.

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE nusawa_log_queue DROP INDEX ', INDEX_NAME)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nusawa_log_queue' AND COLUMN_NAME='wacid' LIMIT 1), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nusawa_log_queue' AND COLUMN_NAME='wacid'),
    'ALTER TABLE nusawa_log_queue DROP COLUMN wacid', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE call_recordings DROP INDEX ', INDEX_NAME)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings' AND COLUMN_NAME='wacid' LIMIT 1), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings' AND COLUMN_NAME='wacid'),
    'ALTER TABLE call_recordings DROP COLUMN wacid', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.6 Kolom yang tidak pernah dibaca maupun ditulis oleh aplikasi.

-- Indeks status tunggal tercakup oleh indeks gabungan (status, created_at).
SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE calls DROP INDEX ', INDEX_NAME)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='calls' AND INDEX_NAME <> 'PRIMARY'
   GROUP BY INDEX_NAME
  HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'status'
   LIMIT 1), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Peran pengguna tidak pernah dipakai untuk membatasi akses; seluruh pengguna
-- memiliki hak yang sama.
SET @sql = (SELECT IFNULL(CONCAT('ALTER TABLE users ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME))), 'DO 0')
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'
     AND COLUMN_NAME IN ('last_seen_at','role'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Timeout menjawab hanya berlaku global lewat env CALL_ANSWER_TIMEOUT; kolom per
-- akun dapat diubah dari antarmuka tetapi tidak pernah dibaca maupun dikirim ke
-- Meta. Penanda nomor uji tidak pernah diisi oleh kode mana pun.
SET @sql = (SELECT IFNULL(CONCAT('ALTER TABLE accounts ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME))), 'DO 0')
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='accounts'
     AND COLUMN_NAME IN ('answer_timeout_seconds','is_test_number'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings' AND COLUMN_NAME='recording_error'),
    'ALTER TABLE call_recordings DROP COLUMN recording_error', 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = (SELECT IFNULL(CONCAT('ALTER TABLE call_events ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME))), 'DO 0')
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_events'
     AND COLUMN_NAME IN ('processed','processing_error'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3.7 Kolom rekaman Meta. Objek lama di MinIO tidak ikut terhapus dan perlu
--     dibersihkan tersendiri bila memang tidak lagi diperlukan.

SET @sql = IFNULL((SELECT CONCAT('ALTER TABLE call_recordings ', GROUP_CONCAT(CONCAT('DROP COLUMN ', COLUMN_NAME)))
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_recordings'
     AND COLUMN_NAME IN ('recording_status','recording_media_id','recording_sha256',
                         'recording_mime_type','recording_s3_key','recording_available_at','recording_expires_at')), 'DO 0');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
