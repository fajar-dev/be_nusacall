import { Agent } from "../../agent/entities/agent.entity"

export class AuthSerializer {
    static loginResponse(agent: Agent, accessToken: string, expiresIn: number) {
        return {
            accessToken,
            expiresIn,
            tokenType: "Bearer",
            user: {
                username: agent.username,
                displayName: agent.displayName,
                role: agent.role,
                canReceiveCalls: agent.canReceiveCalls,
            },
        }
    }
}
