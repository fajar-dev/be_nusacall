# 🗄️ Panduan Database

Dokumen ini menjelaskan standar dan panduan untuk entity, repository, TypeORM, dan manajemen database.

---

## 1. Database yang Didukung

| Database | Driver | Default Port |
|----------|--------|-------------|
| MySQL | `mysql2` | 3306 |

MySQL adalah satu-satunya database yang didukung — `type: "mysql"` di-hardcode di
`src/config/database.ts`, tidak ada environment variable untuk memilih database lain.

---

## 2. TypeORM Configuration

**File**: `src/config/database.ts`

```typescript
export const AppDataSource = new DataSource({
    type: "mysql",
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.pass,
    database: config.database.name,
    synchronize: config.database.sync,  // true = auto-sync schema
    entities: [Call, CallEvent, NusawaLogQueue, PhoneNumber, Agent],  // ← Daftarkan semua entity di sini
    migrations: [],
    subscribers: [],
})
```

### Aturan Penting

- **Selalu daftarkan entity baru** di array `entities`
- `synchronize: true` — Gunakan hanya di **development**. Di production, set `DB_SYNC=false`
- Entity diimport langsung (bukan glob pattern)
- Migrations belum diimplementasikan — gunakan `synchronize` untuk development

---

## 3. Entity Conventions

### Template Entity Standar

```typescript
import { 
    Entity, 
    PrimaryGeneratedColumn, 
    Column, 
    CreateDateColumn, 
    UpdateDateColumn 
} from "typeorm"

@Entity("table_name_plural")       // snake_case, plural
export class EntityName {           // PascalCase, singular
    @PrimaryGeneratedColumn()
    id!: number

    // ── Required Fields ──
    @Column()
    name!: string

    // ── Optional Fields ──
    @Column({ nullable: true })
    description?: string

    // ── Mapped Column Names ──
    @Column({ name: "is_active", default: true })
    isActive!: boolean

    // ── Sensitive Fields (excluded from SELECT) ──
    @Column({ select: false, nullable: true })
    password?: string

    // ── Typed Columns ──
    @Column({ type: "decimal", precision: 12, scale: 2 })
    amount!: number

    @Column({ type: "timestamp", nullable: true })
    expiresAt?: Date

    // ── Timestamps (WAJIB) ──
    @CreateDateColumn({ name: "created_at" })
    createdAt!: Date

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt!: Date
}
```

### Tipe Kolom Umum

| TypeScript Type | Column Config | Contoh |
|----------------|---------------|--------|
| `string` (required) | `@Column()` | `name!: string` |
| `string` (optional) | `@Column({ nullable: true })` | `photo?: string` |
| `string` (unique) | `@Column({ unique: true })` | `email!: string` |
| `boolean` | `@Column({ default: true })` | `isActive!: boolean` |
| `number` (integer) | `@Column()` | `quantity!: number` |
| `number` (decimal) | `@Column({ type: "decimal", precision: 12, scale: 2 })` | `amount!: number` |
| `Date` (auto) | `@CreateDateColumn({ name: "..." })` | `createdAt!: Date` |
| `Date` (nullable) | `@Column({ type: "timestamp", nullable: true })` | `expiresAt?: Date` |
| `string` (hidden) | `@Column({ select: false })` | `password?: string` |

---

## 4. Repository Pattern

### Interface → Implementation

```
IInvoiceRepository (interface)
    │
    └── TypeOrmInvoiceRepository (implementation)
            │
            └── AppDataSource.getRepository(Invoice)
```

### Standard Repository Methods

| Method | Return Type | Deskripsi |
|--------|------------|-----------|
| `findAll(page, limit, q, sortBy?, order?)` | `Promise<{ data: T[]; total: number }>` | List dengan pagination + sorting (lihat §5) |
| `findById(id)` | `Promise<T \| null>` | Cari by ID |
| `save(data, manager?)` | `Promise<T>` | Simpan (create/update) |
| `merge(entity, data)` | `T` | Merge data partial ke entity |
| `delete(id)` | `Promise<void>` | Hapus by ID |

### Transaction Support

```typescript
// Di service layer:
import { AppDataSource } from "../../config/database"
import { EntityManager } from "typeorm"

await AppDataSource.transaction(async (manager: EntityManager) => {
    await this.service.save(data1, manager)
    await this.otherService.save(data2, manager)
})

// Di repository:
async save(data: Partial<T>, manager?: EntityManager): Promise<T> {
    const repo = manager ? manager.getRepository(Entity) : this.repository
    return await repo.save(data)
}
```

---

## 5. Query Builder Patterns

### Basic Pagination dengan Search dan Sorting

```typescript
import { SortOrder } from "../../core/interfaces/base.repository.interface"

// Whitelist kolom yang boleh di-sort — JANGAN masukkan sortBy langsung ke .orderBy() (SQL injection)
const SORTABLE_COLUMNS: Record<string, string> = {
    name: "alias.name",
    email: "alias.email",
    createdAt: "alias.createdAt",
}

async findAll(page: number, limit: number, q: string, sortBy?: string, order: SortOrder = "DESC") {
    const offset = (page - 1) * limit
    const query = this.repository.createQueryBuilder("alias")

    if (q) {
        query.where(
            "(alias.name LIKE :q OR alias.email LIKE :q)",
            { q: `%${q}%` }
        )
    }

    const total = await query.getCount()
    const orderColumn = (sortBy && SORTABLE_COLUMNS[sortBy]) || "alias.id"
    const data = await query
        .orderBy(orderColumn, order)
        .skip(offset)
        .take(limit)
        .getMany()

    return { data, total }
}
```

Controller membaca `sortBy`/`order` dari query string:

```typescript
const sortBy = c.req.query("sortBy") || undefined
const order = c.req.query("order")?.toUpperCase() === "ASC" ? "ASC" : "DESC"
```

> Kalau repository pakai `.getRawMany()` (select manual dengan `AS` alias, contoh: `UserRepository`), `SORTABLE_COLUMNS` harus mengarah ke nama kolom SQL asli (`alias.is_active`, `alias.created_at`), bukan nama alias hasil `AS`.

### Filter Query

```typescript
if (filters.isActive !== undefined && filters.isActive !== "") {
    query.andWhere("alias.is_active = :isActive", { 
        isActive: filters.isActive === "1" 
    })
}
```

### Custom Select (Raw Query)

```typescript
const query = this.repository.createQueryBuilder("user")
    .select([
        "user.id AS id",
        "user.name AS name",
        "user.is_active AS isActive",
    ])

const data = await query.getRawMany()
```

### Include Hidden Fields

```typescript
// Untuk field dengan { select: false }
const user = await this.repository.createQueryBuilder("user")
    .where("user.email = :email", { email })
    .addSelect("user.password")
    .getOne()
```

### Dynamic Sorting

```typescript
const sortMap: Record<string, string> = {
    name: "alias.name",
    email: "alias.email",
    createdAt: "alias.created_at",
}
const finalSort = sortMap[sort] || "alias.id"
const finalOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC"

query.orderBy(finalSort, finalOrder)
```

---

## 6. Entity yang Ada

### User Entity

| Kolom | Tipe | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | int (PK, auto) | ❌ | auto | |
| `name` | varchar | ❌ | - | |
| `photo` | varchar | ✅ | null | Path di MinIO |
| `email` | varchar (unique) | ❌ | - | |
| `password` | varchar | ✅ | null | `select: false`, hashed |
| `reset_password_token` | varchar | ✅ | null | |
| `reset_password_expires` | timestamp | ✅ | null | |
| `is_active` | boolean | ❌ | true | |
| `created_at` | timestamp | ❌ | auto | |
| `updated_at` | timestamp | ❌ | auto | |

### Contact Entity

| Kolom | Tipe | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | int (PK, auto) | ❌ | auto | |
| `name` | varchar | ❌ | - | |
| `email` | varchar | ✅ | null | |
| `phone` | varchar | ✅ | null | |
| `created_at` | timestamp | ❌ | auto | |
| `updated_at` | timestamp | ❌ | auto | |

---

## 7. Relasi (Belum Diimplementasikan)

Proyek saat ini belum menggunakan relasi TypeORM. Jika diperlukan:

```typescript
// One-to-Many
@OneToMany(() => Invoice, invoice => invoice.user)
invoices!: Invoice[]

// Many-to-One
@ManyToOne(() => User, user => user.invoices)
@JoinColumn({ name: "user_id" })
user!: User

@Column({ name: "user_id" })
userId!: number
```

### Konvensi Relasi

- Foreign key column: `{entity}_id` (snake_case)
- Property FK: `{entity}Id` (camelCase)
- `@JoinColumn` wajib dengan `{ name: "fk_column" }`
- Gunakan **eager loading** secara default hanya jika diperlukan
