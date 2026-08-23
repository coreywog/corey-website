export const THEMES = ["light", "dark", "creamsicle"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  creamsicle: "Creamsicle",
};

export const THEME_STORAGE_KEY = "theme";
