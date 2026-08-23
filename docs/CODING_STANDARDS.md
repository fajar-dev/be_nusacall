# 📏 Standarisasi & Konvensi Kode

Dokumen ini adalah **sumber kebenaran** untuk semua konvensi kode di proyek ini. Setiap developer dan AI agent **WAJIB** mengikuti standar ini.

---

## 1. Struktur Direktori

### Root

```
src/
├── config/           # Konfigurasi aplikasi (env, database, smtp)
├── core/             # Infrastruktur bersama (shared across modules)
│   ├── exceptions/   # Custom exception classes
│   ├── helpers/      # Utility/helper classes & functions
│   ├── interfaces/   # Shared interfaces (base repository, etc.)
│   └── middlewares/  # Hono middlewares
├── jobs/             # Standalone scripts untuk scheduled tasks
├── modules/          # Feature modules (domain-driven)
│   └── {module}/
│       ├── entities/       # TypeORM entity definitions
│       ├── interfaces/     # Repository interface contracts
│       ├── repositories/   # TypeORM repository implementations
│       ├── serializers/    # Response data serializers
│       ├── validators/     # Zod validation schemas
│       ├── {module}.controller.ts
│       ├── {module}.service.ts
│       └── {module}.module.ts
├── routes/           # Route definitions
└── index.ts          # Application entry point
```

---

## 2. Konvensi Penamaan File

| Jenis File | Pola Nama | Contoh |
|------------|-----------|--------|
| Enum | `{nama}.enum.ts` (dalam folder `enum/`) | `type.enum.ts`, `salutation.enum.ts` |
| Entity | `{nama}.entity.ts` | `user.entity.ts`, `contact.entity.ts` |
| Repository Interface | `{nama}.repository.interface.ts` | `user.repository.interface.ts` |
| Repository Implementation | `{nama}.repository.ts` | `user.repository.ts` |
| Service | `{nama}.service.ts` | `user.service.ts` |
| Controller | `{nama}.controller.ts` | `contact.controller.ts` |
| Module (DI Wiring) | `{nama}.module.ts` | `contact.module.ts` |
| Validator | `{nama}.validator.ts` | `auth.validator.ts` |
| Serializer | `{nama}.serialize.ts` | `user.serialize.ts` |
| Middleware | `{nama}.middleware.ts` | `auth.middleware.ts` |
| Config | `{nama}.ts` | `config.ts`, `database.ts` |

> **PENTING**: Semua nama file menggunakan **kebab-case** untuk multi-word (contoh: `api-key.middleware.ts`, `reset-password.validator.ts`).

---

## 3. Konvensi Penamaan Kode

### Classes

| Jenis | Pola | Contoh |
|-------|------|--------|
| Enum | `PascalCase`, deskriptif, tanpa prefix nama module | `ContactType`, `Salutation` |
| Entity | `PascalCase` (singular) | `User`, `Contact` |
| Repository Interface | `I{Nama}Repository` | `IUserRepository`, `IContactRepository` |
| Repository Implementation | `TypeOrm{Nama}Repository` | `TypeOrmUserRepository` |
| Service | `{Nama}Service` | `UserService`, `ContactService` |
| Controller | `{Nama}Controller` | `AuthController`, `ContactController` |
| Serializer | `{Nama}Serializer` | `UserSerializer`, `ContactSerializer` |
| Exception | `{Nama}Exception` | `BaseException`, `NotFoundException` |
| Helper (class) | `{Nama}Helper` atau `{Nama}` | `AuthHelper`, `MinioHelper` |

### Variables & Functions

| Jenis | Pola | Contoh |
|-------|------|--------|
| Instance variables | `camelCase` | `userService`, `contactRepository` |
| Functions/Methods | `camelCase` | `getById`, `hashPassword` |
| Constants | `camelCase` (config objects), `UPPER_SNAKE_CASE` (primitive) | `config`, `BUCKET` |
| Exported singletons | `camelCase` | `mail`, `minio` |

### Zod Validators

```typescript
// Schema: PascalCase (sama dengan type name)
export const CreateContactValidator = z.object({ ... })

// Type: nama sama dengan schema (TypeScript type merging)
export type CreateContactValidator = z.infer<typeof CreateContactValidator>
```

> **Catatan**: Gunakan nama yang sama untuk Zod schema dan type-nya (TypeScript mendukung type merging).

---

## 4. Konvensi Database

### Entity

```typescript
@Entity("table_name_plural")  // Nama tabel: snake_case, plural
export class EntityName {      // Nama class: PascalCase, singular
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    name!: string              // Required field: gunakan `!` assertion

    @Column({ nullable: true })
    photo?: string             // Optional field: gunakan `?`

    @Column({ name: "column_name", ... })  // Jika nama kolom berbeda dari property
    propertyName!: Type

    @Column({ select: false })  // Untuk field sensitif (e.g., password)
    password?: string

    @Column({ type: "enum", enum: StatusEnum, default: StatusEnum.ACTIVE })
    status!: StatusEnum        // Enum: import dari folder enum/, lihat bagian Enum

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
```

### Aturan Kolom Database

| Aturan | Detail |
|--------|--------|
| Nama tabel | `snake_case`, **plural** (`users`, `contacts`) |
| Nama kolom | `snake_case` (`is_active`, `created_at`) |
| Property entity | `camelCase` (`isActive`, `createdAt`) |
| Mapping | Gunakan `{ name: "snake_case" }` jika berbeda |
| Timestamps | Selalu gunakan `@CreateDateColumn` dan `@UpdateDateColumn` |
| Primary Key | Selalu `@PrimaryGeneratedColumn()` → auto-increment integer |
| Soft Delete | Belum diimplementasikan (gunakan `isActive` flag jika perlu) |

### Enum

```typescript
// src/modules/contact/enum/type.enum.ts
export enum ContactType {
    CUSTOMER = 'customer',
    VENDOR = 'vendor',
    SUPPLIER = 'supplier',
    OTHER = 'other',
}
```

| Aturan | Detail |
|--------|--------|
| Folder | `enum/` di dalam module (singular, bukan `enums/`) |
| Nama file | `{nama}.enum.ts`, deskriptif — tidak harus sama dengan nama module |
| Nama class | `PascalCase`, deskriptif, **tanpa** prefix nama module (`ContactType`, bukan `ContactTypeEnum`) |
| Value | String literal `lowercase`, sesuai nilai yang disimpan di database |
| Isi file | Satu file enum = satu enum |
| Pemakaian di entity | `@Column({ type: "enum", enum: XxxEnum, ... })` |
| Pemakaian di validator | `z.enum(XxxEnum)` |
| Duplikasi | JANGAN redefine enum di file lain — selalu import dari `enum/` |

---

## 5. Konvensi Import

### Urutan Import

```typescript
// 1. Library/framework imports
import { Hono } from "hono"
import { Context } from "hono"

// 2. Config imports
import { config } from "../../config/config"
import { AppDataSource } from "../../config/database"

// 3. Core imports (exceptions, helpers, middlewares)
import { NotFoundException } from "../../core/exceptions/base"
import { ApiResponse } from "../../core/helpers/response"

// 4. Module imports (entities, interfaces, services)
import { User } from "../user/entities/user.entity"
import { IUserRepository } from "./interfaces/user.repository.interface"
```

### Import Path

- Selalu gunakan **relative imports** (`.ts` extension boleh dihilangkan)
- Tidak menggunakan path aliases (`@/`, `~/`)
- Gunakan `../../` untuk naik level

---

## 6. Konvensi TypeScript

### Strict Mode

- `strict: true` di `tsconfig.json`
- `experimentalDecorators: true` (untuk TypeORM decorators)
- `emitDecoratorMetadata: true`

### Type Assertions

```typescript
// ✅ Gunakan `as` untuk type casting yang diperlukan
const decoded = await verify(token, secret, "HS256") as { sub: number }

// ✅ Gunakan ContentfulStatusCode untuk status code
return c.json({ ... }, status as ContentfulStatusCode)
```

### Null Handling

```typescript
// ✅ Gunakan `null` check + throw exception di service
async getById(id: number): Promise<Entity> {
    const entity = await this.repository.findById(id)
    if (!entity) {
        throw new NotFoundException("Entity not found")
    }
    return entity
}
```

---

## 7. Konvensi Export

### Pattern yang Digunakan

```typescript
// Module file (*.module.ts): named export
export const xxxController = new XxxController(xxxService)

// Singleton helpers: export instance + default
export const mail = new Mail()
export default mail

// Validators: named export untuk schema + type
export const CreateXxxValidator = z.object({ ... })
export type CreateXxxValidator = z.infer<typeof CreateXxxValidator>

// Middleware: named export function
export const authMiddleware = async (c: Context, next: Next) => { ... }

// Config: named export
export const config = { ... }
export const AppDataSource = new DataSource({ ... })
```

---

## 8. Konvensi Comment & JSDoc

### Kapan Menggunakan Comment

```typescript
// ✅ Class-level JSDoc untuk komponen utama
/**
 * Standard API Response Formatter (Best Practice)
 * Ensures consistency across all API responses.
 */
export class ApiResponse { ... }

// ✅ Method-level JSDoc untuk public API helpers
/**
 * Upload a file buffer to MinIO
 * @param objectName - The object key / path in the bucket
 * @param buffer - The file buffer
 * @param contentType - MIME type
 */
async upload(...) { ... }

// ✅ Section comments di route file
// ── Auth ────────────────────────────────────────────────
routes.post("/auth/register", ...)

// ❌ JANGAN comment yang obvious
// Get user by ID  ← JANGAN, method name sudah jelas
async getById(id: number) { ... }
```

---

## 9. Formatting & Style

| Aturan | Detail |
|--------|--------|
| Indentation | 4 spasi |
| Semicolons | Tidak wajib (konsisten tanpa semicolon) |
| String quotes | Double quotes (`"..."`) |
| Trailing comma | Tidak wajib |
| Line length | Tidak ada hard limit, tapi jaga agar readable |
| Blank lines | 1 blank line antara methods, 2 blank lines tidak digunakan |
