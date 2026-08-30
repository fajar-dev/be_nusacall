import { DeepPartial, EntityManager, EntityTarget, ObjectLiteral, Repository } from "typeorm"
import { AppDataSource } from "../../config/database"
import { IBaseRepository } from "../interfaces/base.repository.interface"

export abstract class BaseRepository<T extends ObjectLiteral> implements IBaseRepository<T> {
    protected readonly repository: Repository<T>

    constructor(private readonly entity: EntityTarget<T>) {
        this.repository = AppDataSource.getRepository(entity)
    }

    async findById(id: number): Promise<T | null> {
        return await this.repository.findOneBy({ id } as never)
    }

    async save(data: Partial<T>, manager?: EntityManager): Promise<T> {
        const repo = manager ? manager.getRepository(this.entity) : this.repository
        return await repo.save(data as DeepPartial<T>) as T
    }

    merge(entity: T, data: Partial<T>): T {
        return this.repository.merge(entity, data as DeepPartial<T>)
    }

    async delete(id: number): Promise<void> {
        await this.repository.delete(id)
    }
}
