"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  themeClasses: {
    background: string;
    backgroundSecondary: string;
    backgroundTertiary: string;
    backgroundCard: string;
    surfaceElevated: string;
    text: string;
    textSecondary: string;
    textTertiary: string;
    textInvert: string;
    border: string;
    borderLight: string;
    borderHeavy: string;
    hover: string;
    active: string;
    focus: string;
    accent: string;
    accentHover: string;
    accentLight: string;
    accentDark: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    gradientPrimary: string;
    gradientSecondary: string;
    gradientAccent: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(true); // Default dark for trading

  useEffect(() => {
    const savedTheme = localStorage.getItem("goldstrike-theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const shouldUseDark =
      savedTheme === "dark" || (!savedTheme && systemPrefersDark) || !savedTheme;
    setIsDarkMode(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    localStorage.setItem("goldstrike-theme", newTheme ? "dark" : "light");
    document.documentElement.classList.toggle("dark", newTheme);
  };

  const themeClasses = {
    background: isDarkMode ? "bg-slate-950" : "bg-gray-50",
    backgroundSecondary: isDarkMode ? "bg-slate-900" : "bg-white",
    backgroundTertiary: isDarkMode ? "bg-slate-800" : "bg-gray-100",
    backgroundCard: isDarkMode
      ? "bg-slate-900/90 backdrop-blur-sm"
      : "bg-white",
    surfaceElevated: isDarkMode
      ? "bg-slate-800/80 backdrop-blur-md"
      : "bg-white shadow-sm",

    text: isDarkMode ? "text-slate-100" : "text-gray-900",
    textSecondary: isDarkMode ? "text-slate-300" : "text-gray-600",
    textTertiary: isDarkMode ? "text-slate-400" : "text-gray-500",
    textInvert: isDarkMode ? "text-slate-900" : "text-white",

    border: isDarkMode ? "border-slate-700/50" : "border-gray-200",
    borderLight: isDarkMode ? "border-slate-800/30" : "border-gray-100",
    borderHeavy: isDarkMode ? "border-slate-600" : "border-gray-300",

    hover: isDarkMode ? "hover:bg-slate-800/60" : "hover:bg-gray-50",
    active: isDarkMode ? "active:bg-slate-700/60" : "active:bg-gray-100",
    focus: isDarkMode
      ? "focus:ring-gold-400/30 focus:border-gold-400"
      : "focus:ring-gold-500/30 focus:border-gold-500",

    accent: isDarkMode ? "text-gold-400" : "text-gold-600",
    accentHover: isDarkMode ? "hover:text-gold-300" : "hover:text-gold-700",
    accentLight: isDarkMode
      ? "bg-gold-500/10 text-gold-300"
      : "bg-gold-50 text-gold-700",
    accentDark: isDarkMode
      ? "bg-gold-600 text-white"
      : "bg-gold-600 text-white",

    success: isDarkMode ? "text-emerald-400" : "text-emerald-600",
    warning: isDarkMode ? "text-amber-400" : "text-amber-600",
    error: isDarkMode ? "text-red-400" : "text-red-600",
    info: isDarkMode ? "text-blue-400" : "text-blue-600",

    gradientPrimary: isDarkMode
      ? "bg-gradient-to-br from-slate-950 via-gold-900/20 to-slate-950"
      : "bg-gradient-to-br from-gold-50 via-white to-amber-50",
    gradientSecondary: isDarkMode
      ? "bg-gradient-to-r from-slate-900 to-slate-800"
      : "bg-gradient-to-r from-white to-gray-50",
    gradientAccent: isDarkMode
      ? "bg-gradient-to-r from-gold-600 via-amber-500 to-gold-400"
      : "bg-gradient-to-r from-gold-600 via-amber-500 to-gold-400",
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, themeClasses }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { isDarkMode, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg transition-all duration-200 ${className}`}
      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDarkMode ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}
