export type Theme = "light" | "dark";

/**
 * Light or dark, remembered in a cookie and written onto `<html>` as `data-theme`.
 *
 * Every colour in the stylesheets comes from a custom property, so the switch is a matter of
 * redefining those properties — no component knows which theme is on.
 */
export function useTheme() {
  const theme = useState<Theme>("app:theme", () => "light");
  const stored = useCookie<Theme>("payroll_theme", {
    sameSite: "lax", maxAge: 60 * 60 * 24 * 365, default: () => "light",
  });
  if (stored.value === "dark" || stored.value === "light") theme.value = stored.value;

  function apply(next: Theme) {
    theme.value = next;
    stored.value = next;
    if (import.meta.client) {
      document.documentElement.dataset.theme = next;
      // Tells the browser to draw form controls and scrollbars to match.
      document.documentElement.style.colorScheme = next;
    }
  }

  const toggle = () => apply(theme.value === "dark" ? "light" : "dark");
  return { theme, setTheme: apply, toggle };
}
