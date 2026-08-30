import { Hono } from "hono"
import crypto from "crypto"
import { zValidator } from "@hono/zod-validator"
import { LoginValidator, GoogleLoginValidator, RefreshTokenValidator } from "../modules/auth/validators/auth.validator"
import { UpdateAccountValidator } from "../modules/account/validators/account.validator"
import { authMiddleware } from "../core/middlewares/auth.middleware"
import { validationHook } from "../core/helpers/validator"
import { BadRequestException } from "../core/exceptions/base"
import { authController } from "../modules/auth/auth.module"
import { callController } from "../modules/call/call.module"
import { accountController } from "../modules/account/account.module"
import { permissionController } from "../modules/permission/permission.module"
import { RequestPermissionValidator } from "../modules/permission/validators/permission.validator"
import { RequestOutboundCallValidator } from "../modules/call/validators/call.validator"
import { userController } from "../modules/user/user.module"
import { CreateUserValidator, UpdateUserValidator } from "../modules/user/validators/user.validator"
import { organizationController } from "../modules/organization/organization.module"
import { contactController } from "../modules/contact/contact.module"
import { CreateContactValidator, UpdateContactValidator } from "../modules/contact/validators/contact.validator"
import { branchController } from "../modules/branch/branch.module"

const routes = new Hono()

routes.post("/auth/login", zValidator("json", LoginValidator, validationHook), (c) => authController.nusaworkLogin(c))
routes.post("/auth/google", zValidator("json", GoogleLoginValidator, validationHook), (c) => authController.google(c))
routes.post("/auth/refresh", zValidator("json", RefreshTokenValidator, validationHook), (c) => authController.refreshToken(c))
routes.post("/auth/logout", authMiddleware, (c) => authController.logout(c))
routes.get("/auth/me", authMiddleware, (c) => authController.me(c))

routes.get("/auth/qrcode/generate", (c) => authController.generateQrCode(c))
routes.get("/auth/qrcode/:token/status", (c) => authController.qrCodeStatus(c))
routes.post("/auth/qrcode/login", (c) => authController.qrCodeLogin(c))

routes.get("/user", authMiddleware, (c) => userController.index(c))
routes.get("/user/options", authMiddleware, (c) => userController.options(c))
routes.get("/user/me", authMiddleware, (c) => userController.me(c))
routes.get("/user/available", authMiddleware, (c) => userController.available(c))
routes.get("/user/online", authMiddleware, (c) => userController.online(c))
routes.get("/user/:id", authMiddleware, (c) => userController.show(c))
routes.post("/user", authMiddleware, zValidator("json", CreateUserValidator, validationHook), (c) => userController.store(c))
routes.put("/user/:id", authMiddleware, zValidator("json", UpdateUserValidator, validationHook), (c) => userController.update(c))
routes.delete("/user/:id", authMiddleware, (c) => userController.destroy(c))

routes.get("/organization/list", authMiddleware, (c) => organizationController.list(c))
routes.get("/branch/list", authMiddleware, (c) => branchController.list(c))

routes.get("/call", authMiddleware, (c) => callController.index(c))
routes.get("/call/stats", authMiddleware, (c) => callController.stats(c))
routes.get("/call/:id", authMiddleware, (c) => callController.show(c))
routes.get("/call/:id/recording", authMiddleware, (c) => callController.recording(c))

routes.get("/account", authMiddleware, (c) => accountController.index(c))
routes.get("/account/:id", authMiddleware, (c) => accountController.show(c))
routes.put("/account/:id", authMiddleware, zValidator("json", UpdateAccountValidator, validationHook), (c) => accountController.update(c))
routes.post("/account/:id/sync", authMiddleware, (c) => accountController.sync(c))
routes.get("/account/:id/health", authMiddleware, (c) => accountController.health(c))

routes.get("/contact", authMiddleware, (c) => contactController.index(c))
routes.get("/contact/:id", authMiddleware, (c) => contactController.show(c))
routes.post("/contact", authMiddleware, zValidator("json", CreateContactValidator, validationHook), (c) => contactController.store(c))
routes.put("/contact/:id", authMiddleware, zValidator("json", UpdateContactValidator, validationHook), (c) => contactController.update(c))
routes.delete("/contact/:id", authMiddleware, (c) => contactController.destroy(c))

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

    const { minioClient } = await import("../infrastructure/minio/minio.client")
    await minioClient.upload(objectName, buffer, file.type)

    const { ApiResponse } = await import("../core/helpers/response")
    return ApiResponse.success(c, { path: objectName }, "File uploaded successfully")
})

routes.get("/proxy", async (c) => {
    const path = c.req.query("path")
    if (!path) return c.json({ message: "Missing 'path' query parameter" }, 400)

    const { minioClient } = await import("../infrastructure/minio/minio.client")
    return minioClient.proxyHandler(path)
})

export default routes
