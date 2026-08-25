import { Organization } from "./entities/organization.entity"
import { Type } from "./enums/type"

/** Shape of one node in the Nusawork `GET /emp/api/organization` response tree. */
export interface NusaworkOrganizationNode {
    id: number
    pid: number
    name: string
    type: Type
    description: string | null
    is_active: boolean
    childs?: NusaworkOrganizationNode[]
}

/**
 * Flatten the Nusawork response into unique-by-id rows ready to upsert. The API repeats every
 * node both as a top-level array entry and nested under each ancestor's `childs`, so later
 * visits of the same id simply overwrite earlier (identical) ones in the map.
 */
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