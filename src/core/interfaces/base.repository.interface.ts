import { EntityManager } from "typeorm"

export type SortOrder = "ASC" | "DESC"

export interface IBaseRepository<T> {
    findById(id: number): Promise<T | null>
    save(data: Partial<T>, manager?: EntityManager): Promise<T>
    merge(entity: T, data: Partial<T>): T
    delete(id: number): Promise<void>
}
