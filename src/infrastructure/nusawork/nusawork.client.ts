import axios, { AxiosInstance } from "axios"
import { config } from "../../config/config"

export class NusaworkClient {
    private readonly http: AxiosInstance = axios.create({
        baseURL: config.nusawork.apiUrl,
        headers: {
            Accept: 'application/json',
        },
    })

    private async getToken(): Promise<string> {
        const res = await this.http.post<any>('/auth/api/oauth/token', {
            grant_type: 'client_credentials',
            client_id: config.nusawork.clientId,
            client_secret: config.nusawork.clientSecret,
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })

        return res.data.access_token as string
    }

    async getEmployees(): Promise<any[]> {
        const token = await this.getToken()

        const res = await this.http.post<any>('/emp/api/v4.2/client/employee/filter', {
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

        return (res?.data?.data as any[]) ?? []
    }

    async getOrganization(): Promise<any[]> {
        const token = await this.getToken()

        const res = await this.http.get<any>('/emp/api/organization', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })

        return (res?.data?.data as any[]) ?? []
    }

    async authLogin(email: string, password: string): Promise<boolean> {
        try {
            const res = await this.http.post<any>('/auth/api/oauth/token', {
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

    async getBranch(): Promise<any[]> {
        const token = await this.getToken()

        const res = await this.http.get<any>('/emp/api/branch', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        })

        return (res?.data?.data as any[]) ?? []
    }
}

export const nusaworkClient = new NusaworkClient()