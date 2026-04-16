import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './resources/en.json';
import de from './resources/de.json';
import {
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  type AppLocale,
} from './locales';

export function resolveInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) {
      return stored;
    }
  } catch {
    /* private mode / blocked storage */
  }
  if (typeof navigator !== 'undefined') {
    const primary = navigator.language?.split('-')[0]?.toLowerCase();
    if (primary && isSupportedLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
}

let initPromise: Promise<typeof i18n> | null = null;

/** Call once before React renders; safe to call multiple times. */
export function initI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    return Promise.resolve(i18n);
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: resolveInitialLocale(),
    fallbackLng: FALLBACK_LOCALE,
    interpolation: { escapeValue: false },
  });
  return initPromise;
}

export function setUiLocale(locale: AppLocale): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
