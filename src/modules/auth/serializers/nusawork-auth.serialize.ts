export class NusaworkAuthSerializer {

    static generate(data: { token: string; qrCode: string; timeoutMinutes: number; expired: string }) {
        return {
            token: data.token,
            qrCode: data.qrCode,
            timeoutMinutes: data.timeoutMinutes,
            expired: data.expired,
        }
    }

    static status(body: any) {
        const profile = body.data?.profile ? {
            firstName: body.data.profile.first_name,
            lastName: body.data.profile.last_name,
            email: body.data.profile.email,
            photo: body.data.profile.photo,
            company: body.data.profile.company || null,
        } : null

        // Success: token is present
        if (body.data?.token) {
            return {
                status: "success" as const,
                panelToken: body.data.token as string,
                profile,
            }
        }

        // Confirmation: scanned but not approved
        if (body.data?.profile) {
            return {
                status: "confirmation" as const,
                panelToken: null,
                profile,
            }
        }

        // Waiting
        return {
            status: "waiting" as const,
            panelToken: null,
            profile: null,
        }
    }
}