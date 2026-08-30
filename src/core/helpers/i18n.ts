import { Context } from "hono"
import en from "../i18n/en.json"
import id from "../i18n/id.json"

import { SupportedLanguage } from "../enums/supported-language.enum"
type MessageGroup = Record<string, string>
type LocaleFile = Record<string, MessageGroup>

function flatten(locale: LocaleFile): MessageGroup {
    return Object.values(locale).reduce((flat, group) => ({ ...flat, ...group }), {})
}

const locales: Record<SupportedLanguage, MessageGroup> = {
    en: flatten(en as LocaleFile),
    id: flatten(id as LocaleFile),
}

export function translate(c: Context, message: string): string {
    const lang = (c.get("language") as SupportedLanguage | undefined) ?? SupportedLanguage.EN
    return locales[lang]?.[message] ?? message
}
