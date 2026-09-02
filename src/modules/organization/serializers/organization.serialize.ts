import { Organization } from "../entities/organization.entity"

export class OrganizationSerializer {
    static single(org: Organization) {
        return {
            id: org.id,
            parentId: org.parentId,
            parent: org.parent ? { id: org.parent.id, name: org.parent.name } : null,
            name: org.name,
            type: org.type,
            description: org.description || null,
            isActive: org.isActive,
            createdAt: org.createdAt,
            updatedAt: org.updatedAt,
        }
    }

    static collection(orgs: Organization[]) {
        return orgs.map((o) => this.single(o))
    }

    static listItem(org: Organization) {
        return { id: org.id, name: org.name }
    }

    static listCollection(orgs: Organization[]) {
        return orgs.map((o) => this.listItem(o))
    }
}
