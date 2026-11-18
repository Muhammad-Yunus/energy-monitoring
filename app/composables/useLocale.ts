import { messages, type Locale, type TranslationKey } from '~/i18n/messages'

const LOCALE_COOKIE = 'em-locale'
const LOCALE_MAX_AGE = 60 * 60 * 24 * 365

type FormatParams = Record<string, string | number>

export function useLocale() {
  const cookie = useCookie<Locale>(LOCALE_COOKIE, {
    default: () => 'id',
    maxAge: LOCALE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
  })
  const locale = useState<Locale>('em-locale-state', () => cookie.value ?? 'id')

  watch(locale, (value) => {
    cookie.value = value
  })

  const dateLocale = computed(() => locale.value === 'en' ? 'en-GB' : 'id-ID')

  function t(key: TranslationKey) {
    return messages[locale.value]?.[key] ?? messages.id[key] ?? key
  }

  function tf(key: TranslationKey, params: FormatParams = {}) {
    return t(key).replace(/\{(\w+)\}/g, (match, name: string) => (
      name in params ? String(params[name] ?? '') : match
    ))
  }

  function setLocale(value: Locale) {
    locale.value = value
  }

  return { locale, dateLocale, t, tf, setLocale }
}
