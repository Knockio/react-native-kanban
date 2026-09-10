import { Dimensions, PixelRatio } from "react-native";
import type { KanbanTheme } from "./theme";

const { width, height } = Dimensions.get("window");

export const responsiveSize = (size: number): number => {
  const screenWidth = width < height ? width : height;
  let scale = screenWidth / 410;
  if (width > 470) {
    scale = screenWidth / 700;
  }
  return PixelRatio.roundToNearestPixel(size * scale);
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const cleaned = hex.replace("#", "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getTextColor = (bgColor?: string): string => {
  if (!bgColor) return "black";
  const color = bgColor.replace("#", "");
  const fullHex =
    color.length === 3
      ? color
          .split("")
          .map((c) => c + c)
          .join("")
      : color;
  const r = parseInt(fullHex.substr(0, 2), 16);
  const g = parseInt(fullHex.substr(2, 2), 16);
  const b = parseInt(fullHex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128 ? "white" : "black";
};

export const trimText = (text: string, maxLength: number): string => {
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export const formatCardDate = (iso?: string): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getDate()} / ${months[date.getMonth()]} / ${date.getFullYear()}`;
};

export const scheduleIdle = (
  callback: () => void,
  options?: { timeout?: number }
): { cancel: () => void } => {
  const timeout = options?.timeout ?? 100;
  if (typeof (globalThis as any).requestIdleCallback !== "undefined") {
    const id = (globalThis as any).requestIdleCallback(callback, { timeout });
    return { cancel: () => (globalThis as any).cancelIdleCallback(id) };
  }
  const id = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(id) };
};

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export type MetaPillColors = {
  backgroundColor: string;
  color: string;
};

export const getSourcePillColors = (
  source: string,
  theme: KanbanTheme
): MetaPillColors => {
  const key = source.trim().toLowerCase();
  const palette = theme.sourcePills;
  let entry = palette[0];
  if (key.includes("door") || key.includes("knock")) {
    entry = palette[0];
  } else if (key.includes("referral")) {
    entry = palette[1] ?? palette[0];
  } else if (key.includes("website") || key.includes("form")) {
    entry = palette[2] ?? palette[0];
  } else {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash + key.charCodeAt(i) * (i + 1)) % palette.length;
    }
    entry = palette[hash] ?? palette[0];
  }
  return entry;
};

export const getCampaignPillColors = (theme: KanbanTheme): MetaPillColors => ({
  backgroundColor: theme.campaignPillBg,
  color: theme.campaignPillText,
});
