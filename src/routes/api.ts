import { Hono } from "hono"
import crypto from "crypto"
import { zValidator } from "@hono/zod-validator"

import { UpdateAgentValidator, SetAvailabilityValidator } from "../modules/agent/validators/agent.validator"
import { LoginValidator, GoogleLoginValidator } from "../modules/auth/validators/auth.validator"
import { UpdatePhoneNumberValidator } from "../modules/phone-number/validators/phone-number.validator"

import { authMiddleware } from "../core/middlewares/auth.middleware"
import { validationHook } from "../core/helpers/validator"
import { BadRequestException } from "../core/exceptions/base"

import { agentController } from "../modules/agent/agent.module"
import { authController } from "../modules/auth/auth.module"
import { contactController } from "../modules/contact/contact.module"
import { callController } from "../modules/call/call.module"
import { phoneNumberController } from "../modules/phone-number/phone-number.module"

const routes = new Hono()

// permission/recording routes land incrementally per docs/ROADMAP.md.
// /wh and /ws are mounted outside /api — see src/index.ts.

routes.post("/auth/login", zValidator("json", LoginValidator, validationHook), (c) => authController.login(c))
routes.post("/auth/login/google", zValidator("json", GoogleLoginValidator, validationHook), (c) => authController.loginGoogle(c))
routes.post("/auth/logout", authMiddleware, (c) => authController.logout(c))
routes.get("/auth/me", authMiddleware, (c) => agentController.me(c))

routes.get("/agent", authMiddleware, (c) => agentController.index(c))
routes.get("/agent/available", authMiddleware, (c) => agentController.available(c))
routes.get("/agent/me", authMiddleware, (c) => agentController.me(c))
routes.put("/agent/me/availability", authMiddleware, zValidator("json", SetAvailabilityValidator, validationHook), (c) => agentController.setMyAvailability(c))
routes.put("/agent/:username", authMiddleware, zValidator("json", UpdateAgentValidator, validationHook), (c) => agentController.update(c))

// Read-only proxy over nusawa — NusaCall owns no contact data of its own.
routes.get("/contact", authMiddleware, (c) => contactController.index(c))

routes.get("/call", authMiddleware, (c) => callController.index(c))
routes.get("/call/stats", authMiddleware, (c) => callController.stats(c))
routes.get("/call/:id", authMiddleware, (c) => callController.show(c))
routes.get("/call/:id/recording", authMiddleware, (c) => callController.recording(c))
routes.get("/call/:id/transcript", authMiddleware, (c) => callController.transcript(c))

routes.get("/phone-number", authMiddleware, (c) => phoneNumberController.index(c))
routes.get("/phone-number/:id", authMiddleware, (c) => phoneNumberController.show(c))
routes.put("/phone-number/:id", authMiddleware, zValidator("json", UpdatePhoneNumberValidator, validationHook), (c) => phoneNumberController.update(c))
routes.post("/phone-number/:id/sync", authMiddleware, (c) => phoneNumberController.sync(c))
routes.get("/phone-number/:id/health", authMiddleware, (c) => phoneNumberController.health(c))

// Generic — reused by the recording module in Fase 2.
routes.post("/upload", authMiddleware, async (c) => {
    const body = await c.req.parseBody()
    const file = body["file"]

    if (!file || !(file instanceof File)) {
        throw new BadRequestException("No file uploaded or invalid file")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extension = file.name.split(".").pop() || "bin"
    const objectName = `uploads/${crypto.randomUUID()}.${extension}`

    const { minio } = await import("../core/helpers/minio")
    await minio.upload(objectName, buffer, file.type)

    const { ApiResponse } = await import("../core/helpers/response")
    return ApiResponse.success(c, { path: objectName }, "File uploaded successfully")
})

routes.get("/proxy", async (c) => {
    const path = c.req.query("path")
    if (!path) return c.json({ message: "Missing 'path' query parameter" }, 400)

    const { minio } = await import("../core/helpers/minio")
    return minio.proxyHandler(path)
})

export default routes
