export type AppLocale = "ko" | "en";

const LOCALE_KEY = "hue_locale";
const LOCALE_COOKIE = "hue_locale";

export function getInitialLocale(): AppLocale {
  if (typeof window === "undefined") return "ko";
  return "ko";
}

export function persistLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
