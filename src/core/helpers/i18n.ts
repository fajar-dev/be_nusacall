import { Context } from "hono"
import en from "../i18n/en.json"
import id from "../i18n/id.json"

type SupportedLanguage = "en" | "id"
type MessageGroup = Record<string, string>
type LocaleFile = Record<string, MessageGroup>

// Flattens the grouped locale JSON (common/auth/user/...) into one lookup table.
function flatten(locale: LocaleFile): MessageGroup {
    return Object.values(locale).reduce((flat, group) => ({ ...flat, ...group }), {})
}

const locales: Record<SupportedLanguage, MessageGroup> = {
    en: flatten(en as LocaleFile),
    id: flatten(id as LocaleFile),
}

// Falls back to the original English message if not found in the dictionary.
export function translate(c: Context, message: string): string {
    const lang = (c.get("language") as SupportedLanguage | undefined) ?? "en"
    return locales[lang]?.[message] ?? message
}
