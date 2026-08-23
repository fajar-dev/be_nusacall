import { transporter } from "../../config/smtp"
import { config } from "../../config/config"
import { logger } from "./logger"

interface MailPayload {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

class Mail {
    /**
     * Internal method to send email via SMTP
     * Handles centering of logic, logging, and error handling.
     */
    private async transmit(payload: MailPayload) {
        const { to, subject, text, html } = payload

        try {
            const info = await transporter.sendMail({
                from: config.mail.from,
                to,
                subject,
                text: text || (html ? "Please view this email in an HTML-compatible client." : ""),
                html,
            })
            
            logger.info('Email sent', { to, subject, messageId: info.messageId })
            return info
        } catch (error) {
            logger.error('Failed to send email', { to, subject, err: error })
            throw new Error(`Failed to send email to ${to}: ${(error as Error).message}`)
        }
    }

    /**
     * Send a plain text email via SMTP
     * @param to Recipient email address
     * @param subject Email subject
     * @param text Plain text content
     */
    async sendText(to: string, subject: string, text: string) {
        return this.transmit({ to, subject, text })
    }

    /**
     * Send an HTML email via SMTP
     * @param to Recipient email address
     * @param subject Email subject
     * @param html HTML content
     * @param text Optional plain text content fallback
     */
    async sendHtml(to: string, subject: string, html: string, text?: string) {
        return this.transmit({ to, subject, html, text })
    }
}

// Export a singleton instance
export const mail = new Mail()
export default mail
