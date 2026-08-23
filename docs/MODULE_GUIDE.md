# 🧩 Panduan Membuat Module Baru

Dokumen ini menjelaskan langkah-langkah **lengkap** untuk menambahkan feature module baru ke proyek. Ikuti setiap langkah secara berurutan.

> **Contoh**: Kita akan membuat module `invoice`.

---

## Langkah 1: Buat Struktur Folder

```bash
mkdir -p src/modules/invoice/{entities,interfaces,repositories,serializers,validators}
```

Hasil:

```
src/modules/invoice/
├── entities/
├── interfaces/
├── repositories/
├── serializers/
├── validators/
├── enum/                   # Opsional — hanya jika entity punya field enum (Langkah 2)
├── invoice.controller.ts   # Langkah 7
├── invoice.service.ts      # Langkah 6
└── invoice.module.ts       # Langkah 10
```

---

## Langkah 2: Buat Enum (Opsional)

Buat hanya jika entity memiliki field bertipe enum (mis. `status`, `type`, `salutation`).

**File**: `src/modules/contact/enum/type.enum.ts`

```typescript
export enum ContactType {
    CUSTOMER = 'customer',
    VENDOR = 'vendor',
    SUPPLIER = 'supplier',
    OTHER = 'other',
}
```

### Aturan Enum

- Folder: `enum/` (singular, bukan `enums/`)
- File: `{nama}.enum.ts` (kebab-case) — nama file deskriptif sesuai isinya, **tidak harus** sama dengan nama module (contoh: `type.enum.ts`, `salutation.enum.ts` di dalam module `contact`)
- Class: **PascalCase**, noun deskriptif — **tidak** diprefix nama module (`ContactType`, bukan `ContactTypeEnum` atau `Type`)
- Value: string literal **lowercase**, merepresentasikan nilai yang disimpan di database (`'customer'`, bukan `CUSTOMER` atau angka)
- Satu file enum hanya berisi **satu** enum
- Import dan pakai di entity: `@Column({ type: "enum", enum: ContactType, ... })`
- Import dan pakai di validator: `z.enum(ContactType)`
- JANGAN duplikasi definisi enum di file lain — selalu import dari `enum/`

---

## Langkah 3: Buat Entity

**File**: `src/modules/invoice/entities/invoice.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

@Entity("invoices")
export class Invoice {
    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    number!: string

    @Column({ type: "decimal", precision: 12, scale: 2 })
    amount!: number

    @Column({ nullable: true })
    description?: string

    @Column({ name: "is_paid", default: false })
    isPaid!: boolean

    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
```

### Aturan Entity

- Nama class: **PascalCase**, **singular** (`Invoice`, bukan `Invoices`)
- `@Entity("invoices")`: nama tabel **snake_case**, **plural**
- Required field: gunakan `!` assertion (`name!: string`)
- Optional field: gunakan `?` (`description?: string`)
- Kolom DB snake_case → property camelCase: mapping via `{ name: "snake_case" }`
- **Selalu** tambahkan `@CreateDateColumn` dan `@UpdateDateColumn`
- Primary key: `@PrimaryGeneratedColumn()` (auto-increment integer)
- Field enum: `@Column({ type: "enum", enum: XxxEnum, ... })`, import dari `enum/` (lihat Langkah 2)

---

## Langkah 4: Buat Repository Interface

**File**: `src/modules/invoice/interfaces/invoice.repository.interface.ts`

```typescript
import { EntityManager } from "typeorm"
import { Invoice } from "../entities/invoice.entity"
import { SortOrder } from "../../../core/interfaces/base.repository.interface"

export interface IInvoiceRepository {
    findAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Invoice[]; total: number }>
    findById(id: number): Promise<Invoice | null>
    save(data: Partial<Invoice>, manager?: EntityManager): Promise<Invoice>
    merge(entity: Invoice, data: Partial<Invoice>): Invoice
    delete(id: number): Promise<void>
}
```

### Aturan Interface

- Nama: `I{Nama}Repository`
- Semua method return `Promise<...>` (async)
- `findAll` selalu return `{ data: T[]; total: number }` untuk pagination
- `findById` return `T | null` (nullable)
- `save` menerima `Partial<T>` dan optional `EntityManager` (untuk transaction)
- `merge` untuk update entity
- `delete` return `Promise<void>`

---

## Langkah 5: Buat TypeORM Repository

**File**: `src/modules/invoice/repositories/invoice.repository.ts`

```typescript
import { EntityManager, Repository } from "typeorm"
import { AppDataSource } from "../../../config/database"
import { Invoice } from "../entities/invoice.entity"
import { IInvoiceRepository } from "../interfaces/invoice.repository.interface"
import { SortOrder } from "../../../core/interfaces/base.repository.interface"

// Whitelist kolom yang boleh di-sort — JANGAN masukkan sortBy langsung ke .orderBy() (SQL injection)
const SORTABLE_COLUMNS: Record<string, string> = {
    number: "invoice.number",
    amount: "invoice.amount",
    createdAt: "invoice.createdAt",
}

export class TypeOrmInvoiceRepository implements IInvoiceRepository {
    private readonly repository: Repository<Invoice>

    constructor() {
        this.repository = AppDataSource.getRepository(Invoice)
    }

    async findAll(page: number, limit: number, q: string, sortBy?: string, order: SortOrder = "DESC"): Promise<{ data: Invoice[]; total: number }> {
        const offset = (page - 1) * limit

        const query = this.repository.createQueryBuilder("invoice")

        if (q) {
            query.where(
                "(invoice.number LIKE :q OR invoice.description LIKE :q)",
                { q: `%${q}%` }
            )
        }

        const total = await query.getCount()

        const orderColumn = (sortBy && SORTABLE_COLUMNS[sortBy]) || "invoice.id"

        const data = await query
            .orderBy(orderColumn, order)
            .skip(offset)
            .take(limit)
            .getMany()

        return { data, total }
    }

    async findById(id: number): Promise<Invoice | null> {
        return await this.repository.findOneBy({ id })
    }

    async save(data: Partial<Invoice>, manager?: EntityManager): Promise<Invoice> {
        const repo = manager ? manager.getRepository(Invoice) : this.repository
        return await repo.save(data)
    }

    merge(entity: Invoice, data: Partial<Invoice>): Invoice {
        return this.repository.merge(entity, data)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
```

### Aturan Repository

- Nama class: `TypeOrm{Nama}Repository`
- `implements I{Nama}Repository`
- Constructor: `AppDataSource.getRepository(Entity)`
- Pagination: gunakan `createQueryBuilder` dengan `skip` dan `take`
- Search: gunakan `LIKE :q` dengan `%${q}%`
- Default ordering: `orderBy("alias.id", "DESC")`
- Transaction support: `save()` menerima optional `EntityManager`

---

## Langkah 6: Buat Service

**File**: `src/modules/invoice/invoice.service.ts`

```typescript
import { Invoice } from "./entities/invoice.entity"
import { NotFoundException } from "../../core/exceptions/base"
import { EntityManager } from "typeorm"
import { IInvoiceRepository } from "./interfaces/invoice.repository.interface"
import { SortOrder } from "../../core/interfaces/base.repository.interface"

export class InvoiceService {
    constructor(private readonly repository: IInvoiceRepository) {}

    async getAll(page: number, limit: number, q: string, sortBy?: string, order?: SortOrder): Promise<{ data: Invoice[]; total: number }> {
        return await this.repository.findAll(page, limit, q, sortBy, order)
    }

    async getById(id: number): Promise<Invoice> {
        const invoice = await this.repository.findById(id)
        if (!invoice) {
            throw new NotFoundException("Invoice not found")
        }
        return invoice
    }

    async create(data: Partial<Invoice>): Promise<Invoice> {
        return await this.repository.save(data)
    }

    async update(id: number, data: Partial<Invoice>): Promise<Invoice> {
        const invoice = await this.getById(id)
        this.repository.merge(invoice, data)
        return await this.repository.save(invoice)
    }

    async delete(id: number): Promise<void> {
        await this.getById(id)  // Pastikan entity ada
        await this.repository.delete(id)
    }

    async save(data: Partial<Invoice>, manager?: EntityManager): Promise<Invoice> {
        return await this.repository.save(data, manager)
    }
}
```

### Aturan Service

- Constructor menerima **interface** (`IInvoiceRepository`), bukan implementation
- Method naming: `getAll`, `getById`, `create`, `update`, `delete`, `save`
- `getById` **selalu** throw `NotFoundException` jika tidak ditemukan
- Jangan akses database langsung — selalu melalui repository
- Business logic dan validation **hanya** di service layer

---

## Langkah 7: Buat Controller

**File**: `src/modules/invoice/invoice.controller.ts`

```typescript
import { Context } from "hono"
import { InvoiceService } from "./invoice.service"
import { InvoiceSerializer } from "./serializers/invoice.serialize"
import { ApiResponse } from "../../core/helpers/response"

export class InvoiceController {
    constructor(private readonly service: InvoiceService) {}

    async index(c: Context) {
        const page = Number(c.req.query("page") || 1)
        const limit = Number(c.req.query("limit") || 10)
        const q = c.req.query("q") || ""
        const sortBy = c.req.query("sortBy") || undefined
        const order = c.req.query("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC"

        const { data, total } = await this.service.getAll(page, limit, q, sortBy, order)

        return ApiResponse.paginate(c, InvoiceSerializer.collection(data), total, page, limit, "Invoices retrieved successfully")
    }

    async show(c: Context) {
        const id = Number(c.req.param("id"))
        const invoice = await this.service.getById(id)
        return ApiResponse.success(c, InvoiceSerializer.single(invoice), "Invoice retrieved successfully")
    }

    async store(c: Context) {
        const data = c.req.valid("json" as never)
        const invoice = await this.service.create(data)
        return ApiResponse.success(c, InvoiceSerializer.single(invoice), "Invoice created successfully", 201)
    }

    async update(c: Context) {
        const id = Number(c.req.param("id"))
        const data = c.req.valid("json" as never)
        const invoice = await this.service.update(id, data)
        return ApiResponse.success(c, InvoiceSerializer.single(invoice), "Invoice updated successfully")
    }

    async destroy(c: Context) {
        const id = Number(c.req.param("id"))
        await this.service.delete(id)
        return ApiResponse.success(c, null, "Invoice deleted successfully")
    }
}
```

### Aturan Controller

- Constructor menerima **service** (bukan repository)
- Method naming: `index` (list), `show` (detail), `store` (create), `update`, `destroy` (delete)
- Pagination params: `page`, `limit`, `q` (query search)
- **Selalu** gunakan `ApiResponse` untuk response
- **Selalu** gunakan `Serializer` untuk transform data
- Route params: `c.req.param("id")` → `Number()` conversion
- Query params: `c.req.query("key")` dengan default values
- Validated body: `c.req.valid("json" as never)` (untuk route yang pakai zValidator)

---

## Langkah 8: Buat Validator

**File**: `src/modules/invoice/validators/invoice.validator.ts`

```typescript
import { z } from "zod"

export const CreateInvoiceValidator = z.object({
    number: z.string().min(1, "Invoice number is required"),
    amount: z.number().positive("Amount must be positive"),
    description: z.string().optional(),
})

export type CreateInvoiceValidator = z.infer<typeof CreateInvoiceValidator>

export const UpdateInvoiceValidator = z.object({
    number: z.string().min(1, "Invoice number is required").optional(),
    amount: z.number().positive("Amount must be positive").optional(),
    description: z.string().optional(),
    isPaid: z.boolean().optional(),
})

export type UpdateInvoiceValidator = z.infer<typeof UpdateInvoiceValidator>
```

### Aturan Validator

- Nama: `Create{Nama}Validator`, `Update{Nama}Validator`
- Export **schema** dan **type** dengan nama yang sama
- `Create` validator: field required sesuai bisnis
- `Update` validator: semua field `.optional()`
- Error message dalam bahasa Inggris
- Validasi dilakukan oleh middleware di route, **bukan** di controller/service

---

## Langkah 9: Buat Serializer

**File**: `src/modules/invoice/serializers/invoice.serialize.ts`

```typescript
import { Invoice } from "../entities/invoice.entity"

export class InvoiceSerializer {
    static single(invoice: Invoice) {
        return {
            id: invoice.id,
            number: invoice.number,
            amount: invoice.amount,
            description: invoice.description || null,
            isPaid: invoice.isPaid,
            createdAt: invoice.createdAt,
            updatedAt: invoice.updatedAt,
        }
    }

    static collection(invoices: Invoice[]) {
        return invoices.map(i => this.single(i))
    }
}
```

### Aturan Serializer

- Nama class: `{Nama}Serializer`
- Method `single(entity)`: transform satu entity
- Method `collection(entities)`: transform array entity via `map`
- Optional fields: return `null` jika kosong (`field || null`)
- **Jangan** expose field sensitif (password, token, dll)
- Jika perlu resolusi async (misal MinIO presigned URL), gunakan `async` method

---

## Langkah 10: Buat Module (Composition Root)

**File**: `src/modules/invoice/invoice.module.ts`

```typescript
import { TypeOrmInvoiceRepository } from "./repositories/invoice.repository"
import { InvoiceService } from "./invoice.service"
import { InvoiceController } from "./invoice.controller"

const invoiceRepository = new TypeOrmInvoiceRepository()
const invoiceService = new InvoiceService(invoiceRepository)

export const invoiceController = new InvoiceController(invoiceService)
```

### Aturan Module

- Ini adalah **Composition Root** — tempat satu-satunya untuk wiring dependency
- Urutan wiring: `Repository → Service → Controller`
- Export hanya yang dibutuhkan oleh luar module (biasanya controller)
- Jika service dibutuhkan module lain, export juga service-nya (contoh: `userService`)

---

## Langkah 11: Daftarkan Entity di Database Config

**File**: `src/config/database.ts`

```typescript
import { Invoice } from "../modules/invoice/entities/invoice.entity"

export const AppDataSource = new DataSource({
    // ... config
    entities: [User, Contact, Invoice],  // ← Tambahkan di sini
})
```

> ⚠️ **WAJIB** — Entity yang tidak didaftarkan di sini tidak akan dibuatkan tabelnya oleh TypeORM.

---

## Langkah 12: Tambahkan Route

**File**: `src/routes/api.ts`

```typescript
// ── Validators ──
import { CreateInvoiceValidator, UpdateInvoiceValidator } from "../modules/invoice/validators/invoice.validator"

// ── Modules ──
import { invoiceController } from "../modules/invoice/invoice.module"

// ── Routes ──
// Invoice
routes.get("/invoice", authMiddleware, (c) => invoiceController.index(c))
routes.get("/invoice/:id", authMiddleware, (c) => invoiceController.show(c))
routes.post("/invoice", authMiddleware, zValidator("json", CreateInvoiceValidator, validationHook), (c) => invoiceController.store(c))
routes.put("/invoice/:id", authMiddleware, zValidator("json", UpdateInvoiceValidator, validationHook), (c) => invoiceController.update(c))
routes.delete("/invoice/:id", authMiddleware, (c) => invoiceController.destroy(c))
```

### Aturan Route

- Base path: `/{resource}` (singular atau plural, konsisten)
- CRUD pattern: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`
- Middleware order: `authMiddleware` → `zValidator` → handler
- Handler: `(c) => xxxController.method(c)` (arrow function wrapper)
- Kelompokkan route per module dengan section comment

---

## Langkah 13: Update Swagger (Opsional tapi Disarankan)

Tambahkan definisi di `swagger.yaml`:

1. Tambahkan schemas baru di `components.schemas`
2. Tambahkan paths baru di `paths`
3. Ikuti pola yang sudah ada (lihat Contact sebagai contoh CRUD)

---

## Checklist Module Baru

```
☐ enum/{nama}.enum.ts (opsional, jika ada field enum)
☐ entities/{nama}.entity.ts
☐ interfaces/{nama}.repository.interface.ts
☐ repositories/{nama}.repository.ts
☐ {nama}.service.ts
☐ {nama}.controller.ts
☐ validators/{nama}.validator.ts
☐ serializers/{nama}.serialize.ts
☐ {nama}.module.ts
☐ Entity didaftarkan di src/config/database.ts
☐ Route ditambahkan di src/routes/api.ts
☐ Swagger spec diperbarui (swagger.yaml)
```
