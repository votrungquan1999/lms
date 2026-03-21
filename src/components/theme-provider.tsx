"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface ThemeContextValue {
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({ isDark: false });

/**
 * Provides a `isDark` boolean to any descendant component via `useTheme()`.
 * Watches the document element's class list for Tailwind's `dark` class.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return <ThemeContext value={{ isDark }}>{children}</ThemeContext>;
}

/**
 * Hook to access the current theme. Returns `{ isDark: boolean }`.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
