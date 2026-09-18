import { RU } from "../i18n/ru";

/**
 * Two languages, with the Kazakh text itself as the key.
 *
 * The site was written in Kazakh, so `t("Шығындар")` returns the Russian when Russian is chosen and
 * the original otherwise. Nothing has to be invented or renamed, a string with no translation yet
 * still reads correctly, and a message that arrives from the server in Kazakh can be translated the
 * same way, because the dictionary is keyed by the words themselves.
 */
export type Locale = "kk" | "ru";
export const LOCALES: { id: Locale; label: string; short: string }[] = [
  { id: "kk", label: "Қазақша", short: "ҚАЗ" },
  { id: "ru", label: "Русский", short: "РУС" },
];

const COOKIE = "payroll_locale";

/** Russian agreement after a numeral: 1 операция · 2 операции · 5 операций. */
function pluralForm(forms: string[], count: number): string {
  if (forms.length < 3) return forms[0] ?? "";
  const n = Math.abs(Math.round(count));
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0]!;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return forms[1]!;
  return forms[2]!;
}

export function useLocale() {
  const locale = useState<Locale>("app:locale", () => "kk");
  // A cookie rather than localStorage, so the choice survives a reload and is available to the server.
  const stored = useCookie<Locale>(COOKIE, { sameSite: "lax", maxAge: 60 * 60 * 24 * 365, default: () => "kk" });
  if (stored.value === "ru" || stored.value === "kk") locale.value = stored.value;

  function setLocale(next: Locale) {
    locale.value = next;
    stored.value = next;
    if (import.meta.client) document.documentElement.lang = next;
  }

  /**
   * Translates a Kazakh string. Unknown text is returned unchanged, which is what makes a partial
   * dictionary safe: the page stays readable instead of showing a missing-key placeholder.
   *
   * Pass `count` for a word that follows a number. Russian needs three forms — 1 операция,
   * 2 операции, 5 операций — and a translation supplies them separated by «|». Kazakh needs none:
   * its nouns do not change after a numeral, which is why the key itself is a single word.
   */
  function t(text: string, count?: number): string {
    if (locale.value !== "ru") return text;
    const lookup = (value: string) => {
      const hit = RU[value];
      if (hit === undefined) return undefined;
      return hit.includes("|") ? pluralForm(hit.split("|"), count ?? 0) : hit;
    };
    const direct = lookup(text);
    if (direct !== undefined) return direct;
    // A trailing colon, dash or punctuation is common in labels; translate the stem and keep the rest.
    const match = /^(.*?)([\s:·,.!?—-]+)$/.exec(text);
    const stem = match ? lookup(match[1]!) : undefined;
    return stem === undefined ? text : stem + match![2];
  }

  return { locale, setLocale, t, locales: LOCALES };
}

/** Shorthand for templates: `t("Шығындар")`. */
export const useT = () => useLocale().t;
