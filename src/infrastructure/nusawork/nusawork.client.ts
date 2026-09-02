import axios, { AxiosInstance } from "axios"
import { config } from "../../config/config"
import type {
    NusaworkApiResponse,
    NusaworkBranch,
    NusaworkEmployee,
    NusaworkOrganizationNode,
    NusaworkTokenResponse,
} from "./nusawork.types"

export type * from "./nusawork.types"

export class NusaworkClient {
    private readonly http: AxiosInstance = axios.create({
        baseURL: config.nusawork.apiUrl,
        headers: {
            Accept: 'application/json',
        },
    })

    private async getToken(): Promise<string> {
        const res = await this.http.post<NusaworkTokenResponse>('/auth/api/oauth/token', {
            grant_type: 'client_credentials',
            client_id: config.nusawork.clientId,
            client_secret: config.nusawork.clientSecret,
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })

        return res.data.access_token
    }

    async getEmployees(): Promise<NusaworkEmployee[]> {
        const token = await this.getToken()

        const res = await this.http.post<NusaworkApiResponse<NusaworkEmployee[]>>('/emp/api/v4.2/client/employee/filter', {
            fields: { active_status: ['active', 'Resign'] },
            is_paginate: false,
            multi_value: false,
            currentPage: 1,
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })

        return res.data?.data ?? []
    }

    async getOrganization(): Promise<NusaworkOrganizationNode[]> {
        const token = await this.getToken()

        const res = await this.http.get<NusaworkApiResponse<NusaworkOrganizationNode[]>>('/emp/api/organization', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })

        return res.data?.data ?? []
    }

    async authLogin(email: string, password: string): Promise<boolean> {
        try {
            const res = await this.http.post('/auth/api/oauth/token', {
                grant_type: 'password',
                username: email,
                password: password,
                client_id: config.nusawork.auth.clientId,
                client_secret: config.nusawork.auth.clientSecret,
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                validateStatus: () => true,
            })

            return res.status === 200
        } catch {
            return false
        }
    }

    async getBranch(): Promise<NusaworkBranch[]> {
        const token = await this.getToken()

        const res = await this.http.get<NusaworkApiResponse<NusaworkBranch[]>>('/emp/api/branch', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })

        return res.data?.data ?? []
    }
}

export const nusaworkClient = new NusaworkClient()
