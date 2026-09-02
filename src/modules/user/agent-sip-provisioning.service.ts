import { randomBytes } from "node:crypto"
import { writeFile } from "node:fs/promises"
import { Repository } from "typeorm"
import { AppDataSource } from "../../config/database"
import { User } from "./entities/user.entity"
import { UserSipCredential } from "./entities/user-sip-credential.entity"
import { ariClient } from "../../infrastructure/asterisk/ari.client"
import { config } from "../../config/config"
import { logger } from "../../core/helpers/logger"

const GENERATED_HEADER = `; ============================================================================
; DIHASILKAN OTOMATIS oleh NusaCall (AgentSipProvisioningService).
; Jangan diedit manual — perubahan akan tertimpa saat sinkronisasi user.
; Berisi endpoint SIP-over-WebSocket untuk tiap agent.
; ============================================================================
`

export class AgentSipProvisioningService {
    private get credentials(): Repository<UserSipCredential> {
        return AppDataSource.getRepository(UserSipCredential)
    }

    private get users(): Repository<User> {
        return AppDataSource.getRepository(User)
    }

    static usernameFor(userId: number): string {
        return `agent-${userId}`
    }

    async ensureCredential(userId: number): Promise<UserSipCredential> {
        const existing = await this.credentials.findOneBy({ userId })
        if (existing) return existing

        return await this.credentials.save({
            userId,
            username: AgentSipProvisioningService.usernameFor(userId),
            password: randomBytes(24).toString("base64url"),
        })
    }

    async getCredential(userId: number): Promise<UserSipCredential> {
        return await this.ensureCredential(userId)
    }

    async syncAll(): Promise<{ endpoints: number }> {
        const activeUsers = await this.users.find({ where: { isActive: true }, select: { id: true } })

        const sections: string[] = [GENERATED_HEADER]
        for (const user of activeUsers) {
            const credential = await this.ensureCredential(user.id)
            sections.push(this.renderEndpoint(credential))
        }

        await writeFile(config.asterisk.agentConfigPath, sections.join("\n"), "utf8")
        await ariClient.reloadModule("res_pjsip.so")

        logger.info("Agent SIP endpoints provisioned", { endpoints: activeUsers.length })
        return { endpoints: activeUsers.length }
    }

    private renderEndpoint(credential: UserSipCredential): string {
        const name = credential.username
        return [
            `[${name}]`,
            "type=auth",
            "auth_type=userpass",
            `username=${name}`,
            `password=${credential.password}`,
            "",
            `[${name}]`,
            "type=aor",
            "max_contacts=3",
            "remove_existing=yes",
            "",
            `[${name}]`,
            "type=endpoint",
            "transport=transport-ws",
            "context=nusacall-agent",
            "disallow=all",
            "allow=opus",
            "webrtc=yes",
            `auth=${name}`,
            `aors=${name}`,
            "",
        ].join("\n")
    }
}

export const agentSipProvisioningService = new AgentSipProvisioningService()
