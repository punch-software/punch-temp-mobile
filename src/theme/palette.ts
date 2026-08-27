import { useColorScheme } from "react-native";

/**
 * Raw color values for the places NativeWind classes can't reach
 * (icon `color` props, ActivityIndicator, shadows). Mirrors global.css.
 */
const light = {
  background: "#FAF9F5",
  surface: "#FFFFFF",
  surfaceHigh: "#F4F2EC",
  bubble: "#F0EEE6",
  foreground: "#262521",
  muted: "#706D64",
  faint: "#A4A197",
  line: "#EAE8DF",
  lineStrong: "#DBD8CE",
  accent: "#C15F3C",
  onAccent: "#FFFFFF",
  danger: "#BA372A",
  codeFg: "#E8E6DD",
};

const dark: typeof light = {
  background: "#262624",
  surface: "#30302D",
  surfaceHigh: "#3A3935",
  bubble: "#3C3B37",
  foreground: "#ECEAE4",
  muted: "#A8A59B",
  faint: "#7C7970",
  line: "#3A3935",
  lineStrong: "#4A4944",
  accent: "#D97757",
  onAccent: "#FFFFFF",
  danger: "#E26456",
  codeFg: "#E2E0D8",
};

export type Palette = typeof light;

export const usePalette = (): Palette => {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
};

export const SERIF_FONT = { ios: "Georgia", android: "serif", default: "serif" };
