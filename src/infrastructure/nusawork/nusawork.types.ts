import { OrganizationType } from "../../modules/organization/enums/organization-type.enum"

export interface NusaworkTokenResponse {
    access_token: string
    token_type?: string
    expires_in?: number
}

export interface NusaworkEmployee {
    user_id: number
    employee_id: string
    full_name: string
    email: string
    photo_profile?: string | null
    active_status?: string
    organization_name?: string
    branch_id?: string | number
    [key: string]: unknown
}

export interface NusaworkOrganizationNode {
    id: number
    pid: number
    name: string
    type: OrganizationType
    description: string | null
    is_active: boolean
    childs?: NusaworkOrganizationNode[]
}

export interface NusaworkBranch {
    id: number
    id_parent: number | string
    branch_id: string
    name: string
    email: string
    branch_phone_number: string
    branch_address: string
    [key: string]: unknown
}

export interface NusaworkEmployeeFilterPayload {
    fields: {
        active_status: string[]
    }
    is_paginate: boolean
    multi_value: boolean
    currentPage: number
}

export interface NusaworkApiResponse<T> {
    data?: T
    message?: string
    status?: number | string
}
