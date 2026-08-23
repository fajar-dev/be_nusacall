import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import crypto from "crypto"

// ── Validators ──────────────────────────────────────────────────────────────
import { LoginValidator, GoogleLoginValidator } from "../modules/auth/validators/auth.validator"
import { CreateContactValidator, UpdateContactValidator } from "../modules/contact/validators/contact.validator"
import { CreateUserValidator, UpdateUserValidator } from "../modules/user/validators/user.validator"

// ── Middlewares ──────────────────────────────────────────────────────────────
import { authMiddleware } from "../core/middlewares/auth.middleware"
import { validationHook } from "../core/helpers/validator"
import { BadRequestException } from "../core/exceptions/base"

// ── Modules (controllers wired with their dependencies) ──────────────────────
import { authController } from "../modules/auth/auth.module"
import { contactController } from "../modules/contact/contact.module"
import { userController } from "../modules/user/user.module"

// ── Routes ───────────────────────────────────────────────────────────────────
const routes = new Hono()

// Auth
routes.post("/auth/login", zValidator("json", LoginValidator, validationHook), (c) => authController.login(c))
routes.post("/auth/google", zValidator("json", GoogleLoginValidator, validationHook), (c) => authController.google(c))
routes.post("/auth/logout", authMiddleware, (c) => authController.logout(c))



// Contact
routes.get("/contact", authMiddleware, (c) => contactController.index(c))
routes.get("/contact/:id", authMiddleware, (c) => contactController.show(c))
routes.post("/contact", authMiddleware, zValidator("json", CreateContactValidator, validationHook), (c) => contactController.store(c))
routes.put("/contact/:id", authMiddleware, zValidator("json", UpdateContactValidator, validationHook), (c) => contactController.update(c))
routes.delete("/contact/:id", authMiddleware, (c) => contactController.destroy(c))

// User
routes.get("/user", authMiddleware, (c) => userController.index(c))
routes.get("/user/:id", authMiddleware, (c) => userController.show(c))
routes.post("/user", authMiddleware, zValidator("json", CreateUserValidator, validationHook), (c) => userController.store(c))
routes.put("/user/:id", authMiddleware, zValidator("json", UpdateUserValidator, validationHook), (c) => userController.update(c))
routes.delete("/user/:id", authMiddleware, (c) => userController.destroy(c))

// Upload
routes.post("/upload", authMiddleware, async (c) => {
    const body = await c.req.parseBody()
    const file = body["file"]

    if (!file || !(file instanceof File)) {
        throw new BadRequestException("No file uploaded or invalid file")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const extension = file.name.split(".").pop() || "jpg"
    const objectName = `users/${crypto.randomUUID()}.${extension}`

    const { minio } = await import("../core/helpers/minio")
    await minio.upload(objectName, buffer, file.type)

    const { ApiResponse } = await import("../core/helpers/response")
    return ApiResponse.success(c, { path: objectName }, "File uploaded successfully")
})

// Proxy MinIO
routes.get("/proxy", async (c) => {
    const path = c.req.query("path")
    if (!path) return c.json({ message: "Missing 'path' query parameter" }, 400)

    const { minio } = await import("../core/helpers/minio")
    return minio.proxyHandler(path)
})

export default routes
