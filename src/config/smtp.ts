import nodemailer from "nodemailer"
import { config } from "./config"

export const transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: {
        user: config.mail.user,
        pass: config.mail.pass,
    },
})
