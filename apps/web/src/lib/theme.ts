export type ThemeMode = "dark" | "light" | "contrast";
export type ThemePalette = "ocean" | "forest" | "rose" | "violet";

export type ThemePreference = {
  mode: ThemeMode;
  palette: ThemePalette;
};

export type ThemeModeOption = {
  value: ThemeMode;
  label: string;
  description: string;
  swatch: string;
};

export type ThemePaletteOption = {
  value: ThemePalette;
  label: string;
  shortLabel: string;
  description: string;
  swatch: string;
};

export const themeModeOptions: ThemeModeOption[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces and dark type for daytime use.",
    swatch: "linear-gradient(135deg, #ffffff 0 50%, #dbe4ec 50%)",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Low-glare surfaces for evenings and focused work.",
    swatch: "linear-gradient(135deg, #070b16 0 50%, #27344a 50%)",
  },
  {
    value: "contrast",
    label: "High Contrast",
    description: "Maximum separation and strong borders with your chosen palette.",
    swatch: "linear-gradient(135deg, #000000 0 48%, #ffffff 48% 56%, #00e5ff 56%)",
  },
];

export const themePaletteOptions: ThemePaletteOption[] = [
  {
    value: "ocean",
    label: "Ocean",
    shortLabel: "Ocean",
    description: "Clear cyan with a cool blue secondary.",
    swatch: "linear-gradient(135deg, #164e63 0 48%, #67e8f9 48% 72%, #818cf8 72%)",
  },
  {
    value: "forest",
    label: "Forest & Wood",
    shortLabel: "Forest",
    description: "Soft leafy greens grounded by warm cedar tones.",
    swatch: "linear-gradient(135deg, #244b35 0 48%, #8fbc8f 48% 72%, #a66a43 72%)",
  },
  {
    value: "rose",
    label: "Rose",
    shortLabel: "Rose",
    description: "Rosy red accents with warm white or wine-dark surfaces.",
    swatch: "linear-gradient(135deg, #7f1d3b 0 48%, #fb7185 48% 72%, #fff1f2 72%)",
  },
  {
    value: "violet",
    label: "Violet",
    shortLabel: "Violet",
    description: "Polished purple with a soft electric highlight.",
    swatch: "linear-gradient(135deg, #4c1d95 0 48%, #c084fc 48% 72%, #818cf8 72%)",
  },
];

const MODE_KEY = "jarvis-theme-mode";
const PALETTE_KEY = "jarvis-theme-palette";
const LEGACY_THEME_KEY = "jarvis-theme";
const THEME_EVENT = "jarvis-theme-change";
const defaultTheme: ThemePreference = { mode: "dark", palette: "ocean" };
const modeValues = new Set<ThemeMode>(themeModeOptions.map((option) => option.value));
const paletteValues = new Set<ThemePalette>(themePaletteOptions.map((option) => option.value));
let themeUpdateTimer: number | undefined;

const legacyThemes: Record<string, ThemePreference> = {
  dark: { mode: "dark", palette: "ocean" },
  light: { mode: "light", palette: "ocean" },
  luxe: { mode: "dark", palette: "forest" },
  bloom: { mode: "dark", palette: "rose" },
  nature: { mode: "dark", palette: "forest" },
  contrast: { mode: "contrast", palette: "ocean" },
};

function isThemeMode(value: string | null): value is ThemeMode {
  return Boolean(value && modeValues.has(value as ThemeMode));
}

function isThemePalette(value: string | null): value is ThemePalette {
  return Boolean(value && paletteValues.has(value as ThemePalette));
}

function normalizeTheme(theme: Partial<ThemePreference>): ThemePreference {
  return {
    mode: isThemeMode(theme.mode ?? null) ? (theme.mode as ThemeMode) : defaultTheme.mode,
    palette: isThemePalette(theme.palette ?? null) ? (theme.palette as ThemePalette) : defaultTheme.palette,
  };
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const storedMode = window.localStorage.getItem(MODE_KEY);
    const storedPalette = window.localStorage.getItem(PALETTE_KEY);
    if (isThemeMode(storedMode) || isThemePalette(storedPalette)) {
      return normalizeTheme({ mode: storedMode as ThemeMode, palette: storedPalette as ThemePalette });
    }

    const legacyTheme = window.localStorage.getItem(LEGACY_THEME_KEY);
    return legacyTheme && legacyThemes[legacyTheme] ? legacyThemes[legacyTheme] : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function applyThemeToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  const next = normalizeTheme(theme);
  const root = document.documentElement;
  root.dataset.themeUpdating = "true";
  root.dataset.theme = next.mode;
  root.dataset.palette = next.palette;
  document.body?.setAttribute("data-theme", next.mode);
  document.body?.setAttribute("data-palette", next.palette);

  const updateBrowserChrome = () => {
    const background = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (background) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
    }
  };
  updateBrowserChrome();

  if (typeof window !== "undefined") {
    window.clearTimeout(themeUpdateTimer);
    themeUpdateTimer = window.setTimeout(() => {
      delete root.dataset.themeUpdating;
      themeUpdateTimer = undefined;
    }, 80);
  }
}

export function applyTheme(theme: ThemePreference) {
  const next = normalizeTheme(theme);
  applyThemeToDocument(next);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODE_KEY, next.mode);
    window.localStorage.setItem(PALETTE_KEY, next.palette);
    window.localStorage.setItem(LEGACY_THEME_KEY, next.mode);
  } catch {
    // The selected appearance still applies for this session if storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
}

export function updateThemePreference(patch: Partial<ThemePreference>): ThemePreference {
  const next = normalizeTheme({ ...getStoredTheme(), ...patch });
  applyTheme(next);
  return next;
}

export function onThemeChange(callback: (theme: ThemePreference) => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = (event: Event) => {
    const next = (event as CustomEvent<ThemePreference>).detail ?? getStoredTheme();
    callback(normalizeTheme(next));
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === MODE_KEY || event.key === PALETTE_KEY || event.key === LEGACY_THEME_KEY) {
      const next = getStoredTheme();
      applyThemeToDocument(next);
      callback(next);
    }
  };
  window.addEventListener(THEME_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
