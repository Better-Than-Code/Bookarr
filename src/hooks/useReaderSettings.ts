import { useState, useEffect } from "react";

export type ReaderTheme =
  | "light"
  | "sepia"
  | "soft"
  | "dusk"
  | "night"
  | "amoled";
export type FontFamily = "sans" | "serif" | "mono" | "dyslexic";
export type MarginSize = "narrow" | "normal" | "wide";
export type LineSpacing = "compact" | "comfort" | "loose";
export type TextAlign = "left" | "justify";

export function useReaderSettings(bookId: string) {
  const [theme, setTheme] = useState<ReaderTheme>(
    () => (localStorage.getItem("bookrr-pref-theme") as ReaderTheme) || "sepia",
  );
  const [fontSize, setFontSize] = useState<number>(() =>
    parseInt(localStorage.getItem("bookrr-pref-fontSize") || "18"),
  );
  const [fontFamily, setFontFamily] = useState<FontFamily>(
    () =>
      (localStorage.getItem("bookrr-pref-fontFamily") as FontFamily) || "serif",
  );
  const [margins, setMargins] = useState<MarginSize>(
    () =>
      (localStorage.getItem("bookrr-pref-margins") as MarginSize) || "normal",
  );
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(
    () =>
      (localStorage.getItem("bookrr-pref-lineSpacing") as LineSpacing) ||
      "comfort",
  );
  const [textAlign, setTextAlign] = useState<TextAlign>(
    () =>
      (localStorage.getItem("bookrr-pref-textAlign") as TextAlign) || "justify",
  );
  const [isDualPage, setIsDualPage] = useState(
    () => localStorage.getItem("bookrr-pref-isDualPage") === "true",
  );
  const [isPagedMode, setIsPagedMode] = useState(
    () => localStorage.getItem("bookrr-pref-isPagedMode") === "true",
  );

  useEffect(() => {
    localStorage.setItem("bookrr-pref-theme", theme);
    localStorage.setItem("bookrr-pref-fontSize", fontSize.toString());
    localStorage.setItem("bookrr-pref-fontFamily", fontFamily);
    localStorage.setItem("bookrr-pref-margins", margins);
    localStorage.setItem("bookrr-pref-lineSpacing", lineSpacing);
    localStorage.setItem("bookrr-pref-textAlign", textAlign);
    localStorage.setItem("bookrr-pref-isDualPage", isDualPage.toString());
    localStorage.setItem("bookrr-pref-isPagedMode", isPagedMode.toString());
  }, [
    theme,
    fontSize,
    fontFamily,
    margins,
    lineSpacing,
    textAlign,
    isDualPage,
    isPagedMode,
  ]);

  return {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    fontFamily,
    setFontFamily,
    margins,
    setMargins,
    lineSpacing,
    setLineSpacing,
    textAlign,
    setTextAlign,
    isDualPage,
    setIsDualPage,
    isPagedMode,
    setIsPagedMode,
  };
}
