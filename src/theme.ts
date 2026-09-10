import React, { createContext, useContext, useMemo } from "react";

export type KanbanTheme = {
  primary: string;
  background: string;
  card: string;
  text: string;
  heading: string;
  placeholder: string;
  border: string;
  black: string;
  white: string;
  muted: string;
  lightPrimary: string;
  dragHighlight: string;
  swipeForward: string;
  swipeBack: string;
  daysBadgeBg: string;
  daysBadgeText: string;
  notesDisabledBg: string;
  assigneeOverflow: string;
  emptyIcon: string;
  countBadgeFallback: string;
  campaignPillBg: string;
  campaignPillText: string;
  sourcePills: Array<{ backgroundColor: string; color: string }>;
};

export const defaultKanbanTheme: KanbanTheme = {
  primary: "#4FAA3A",
  background: "#FFFFFF",
  card: "#F7F8FC",
  text: "#31333B",
  heading: "#31333B",
  placeholder: "#777777",
  border: "#F2F2F2",
  black: "#000000",
  white: "#FFFFFF",
  muted: "#6B7280",
  lightPrimary: "#E1FFEE",
  dragHighlight: "#3B82F6",
  swipeForward: "#4FAA3A",
  swipeBack: "#BE3025",
  daysBadgeBg: "#E3F2FD",
  daysBadgeText: "#1976D2",
  notesDisabledBg: "#F5F5F5",
  assigneeOverflow: "#6C757D",
  emptyIcon: "#CCCCCC",
  countBadgeFallback: "#1976D2",
  campaignPillBg: "#F3E8FF",
  campaignPillText: "#7C3AED",
  sourcePills: [
    { backgroundColor: "#E8F5E9", color: "#2E7D32" },
    { backgroundColor: "#E3F2FD", color: "#1565C0" },
    { backgroundColor: "#FFF3E0", color: "#EF6C00" },
    { backgroundColor: "#FCE4EC", color: "#C2185B" },
    { backgroundColor: "#E0F7FA", color: "#00838F" },
  ],
};

const KanbanThemeContext = createContext<KanbanTheme>(defaultKanbanTheme);

export type KanbanThemeProviderProps = {
  theme?: Partial<KanbanTheme>;
  children: React.ReactNode;
};

export const KanbanThemeProvider: React.FC<KanbanThemeProviderProps> = ({
  theme,
  children,
}) => {
  const value = useMemo(
    () => ({ ...defaultKanbanTheme, ...theme }),
    [theme]
  );
  return React.createElement(KanbanThemeContext.Provider, { value }, children);
};

export const useKanbanTheme = (): KanbanTheme => useContext(KanbanThemeContext);

export const createKanbanTheme = (
  overrides: Partial<KanbanTheme> = {}
): KanbanTheme => ({
  ...defaultKanbanTheme,
  ...overrides,
});
