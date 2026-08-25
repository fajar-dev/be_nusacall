import { Hono } from "hono"
import crypto from "crypto"
import { zValidator } from "@hono/zod-validator"

import { LoginValidator, GoogleLoginValidator, RefreshTokenValidator } from "../modules/auth/validators/auth.validator"
import { UpdatePhoneNumberValidator } from "../modules/phone-number/validators/phone-number.validator"

import { authMiddleware } from "../core/middlewares/auth.middleware"
import { validationHook } from "../core/helpers/validator"
import { BadRequestException } from "../core/exceptions/base"

import { authController } from "../modules/auth/auth.module"
import { callController } from "../modules/call/call.module"
import { phoneNumberController } from "../modules/phone-number/phone-number.module"
import { permissionController } from "../modules/permission/permission.module"
import { RequestPermissionValidator } from "../modules/permission/validators/permission.validator"
import { RequestOutboundCallValidator } from "../modules/call/validators/call.validator"
import { userController } from "../modules/user/user.module"
import { CreateUserValidator, UpdateUserValidator } from "../modules/user/validators/user.validator"
import { organizationController } from "../modules/organization/organization.module"

const routes = new Hono()

// /wh and /ws are mounted outside /api — see src/index.ts.

routes.post("/auth/login", zValidator("json", LoginValidator, validationHook), (c) => authController.nusaworkLogin(c))
routes.post("/auth/google", zValidator("json", GoogleLoginValidator, validationHook), (c) => authController.google(c))
routes.post("/auth/refresh", zValidator("json", RefreshTokenValidator, validationHook), (c) => authController.refreshToken(c))
routes.post("/auth/logout", authMiddleware, (c) => authController.logout(c))
routes.get("/auth/me", authMiddleware, (c) => authController.me(c))

// Auth - QR Code Login (public, no auth required)
routes.get("/auth/qrcode/generate", (c) => authController.generateQrCode(c))
routes.get("/auth/qrcode/:token/status", (c) => authController.qrCodeStatus(c))
routes.post("/auth/qrcode/login", (c) => authController.qrCodeLogin(c))

routes.get("/user", authMiddleware, (c) => userController.index(c))
routes.get("/user/options", authMiddleware, (c) => userController.options(c))
routes.get("/user/me", authMiddleware, (c) => userController.me(c))
routes.get("/user/available", authMiddleware, (c) => userController.available(c))
routes.get("/user/:id", authMiddleware, (c) => userController.show(c))
routes.post("/user", authMiddleware, zValidator("json", CreateUserValidator, validationHook), (c) => userController.store(c))
routes.put("/user/:id", authMiddleware, zValidator("json", UpdateUserValidator, validationHook), (c) => userController.update(c))
routes.delete("/user/:id", authMiddleware, (c) => userController.destroy(c))

routes.get("/organization/list", authMiddleware, (c) => organizationController.list(c))

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

routes.get("/permission", authMiddleware, (c) => permissionController.check(c))
routes.post("/permission/request", authMiddleware, zValidator("json", RequestPermissionValidator, validationHook), (c) => permissionController.request(c))

routes.post("/call/outbound", authMiddleware, zValidator("json", RequestOutboundCallValidator, validationHook), (c) => callController.outbound(c))

routes.post("/upload", authMiddleware, async (c) => {
    const body = await c.req.parseBody()
    const file = body["file"]

    if (!file || !(file instanceof File)) {
        throw new BadRequestException("No file uploaded or invalid file")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extension = file.name.split(".").pop() || "bin"
    const objectName = `uploads/${crypto.randomUUID()}.${extension}`

    const { minio } = await import("../infrastructure/minio/minio.client")
    await minio.upload(objectName, buffer, file.type)

    const { ApiResponse } = await import("../core/helpers/response")
    return ApiResponse.success(c, { path: objectName }, "File uploaded successfully")
})

routes.get("/proxy", async (c) => {
    const path = c.req.query("path")
    if (!path) return c.json({ message: "Missing 'path' query parameter" }, 400)

    const { minio } = await import("../infrastructure/minio/minio.client")
    return minio.proxyHandler(path)
})

export default routes
