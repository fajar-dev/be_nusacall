import { Context, Next } from 'hono'
import { languageDetector } from 'hono/language'

const detectLanguage = languageDetector({
    supportedLanguages: ['en', 'id'],
    fallbackLanguage: 'en',
    order: ['header'],
    caches: false,
})

export const languageMiddleware = async (c: Context, next: Next) => {
    await detectLanguage(c, async () => {
        c.header('Content-Language', c.get('language'))
        await next()
    })
}
