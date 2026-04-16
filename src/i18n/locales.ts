/**
 * Supported UI locales. To add a language:
 * 1. Add its code here and in `resources/` as `<code>.json`.
 * 2. Import the JSON in `init.ts` and register it under `resources.<code>.translation`.
 * 3. Add a label in `LOCALE_LABELS`.
 */
export const SUPPORTED_LOCALES = ['en', 'de'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: AppLocale = 'en';

/** Used when no stored preference and browser language is not supported. */
export const DEFAULT_LOCALE: AppLocale = 'en';

export const LOCALE_STORAGE_KEY = 'openscad.ui.locale';

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  de: 'Deutsch',
};

export function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
