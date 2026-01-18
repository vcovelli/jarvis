export type ThemeMode = "dark" | "light";

const THEME_KEY = "jarvis-theme";
const THEME_EVENT = "jarvis-theme-change";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "light" ? "light" : "dark";
}

export function applyTheme(next: ThemeMode) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new CustomEvent(THEME_EVENT));
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
    document.body?.setAttribute("data-theme", next);
  }
}

export function onThemeChange(callback: (theme: ThemeMode) => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = () => callback(getStoredTheme());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      callback(getStoredTheme());
    }
  };
  window.addEventListener(THEME_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
