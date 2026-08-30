import { Organization } from "./entities/organization.entity"
import { Type } from "./enums/type"

export interface NusaworkOrganizationNode {
    id: number
    pid: number
    name: string
    type: Type
    description: string | null
    is_active: boolean
    childs?: NusaworkOrganizationNode[]
}

export function flattenNusaworkOrganizations(nodes: NusaworkOrganizationNode[]): Partial<Organization>[] {
    const seen = new Map<number, Partial<Organization>>()

    const visit = (list: NusaworkOrganizationNode[]) => {
        for (const node of list) {
            seen.set(node.id, {
                id: node.id,
                parentId: node.pid ? node.pid : null,
                name: node.name,
                type: node.type,
                description: node.description ?? null,
                isActive: node.is_active,
            })
            if (node.childs?.length) visit(node.childs)
        }
    }

    visit(nodes)
    return Array.from(seen.values())
}