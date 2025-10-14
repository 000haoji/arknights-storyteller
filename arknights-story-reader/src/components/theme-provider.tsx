import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"
type ThemeColor = "default" | "book" | "emerald" | "noctilucent"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  themeColor: ThemeColor
  setThemeColor: (color: ThemeColor) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  themeColor: "default",
  setTheme: () => null,
  setThemeColor: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  const [themeColor, setThemeColorState] = useState<ThemeColor>(() => {
    const stored = localStorage.getItem(`${storageKey}-color`) as ThemeColor | null
    if (stored && ["default", "book", "emerald", "noctilucent"].includes(stored)) {
      return stored
    }
    return "default"
  })

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"

      root.classList.add(systemTheme)
      
      // Listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      const handleChange = (e: MediaQueryListEvent) => {
        root.classList.remove("light", "dark")
        root.classList.add(e.matches ? "dark" : "light")
      }
      mediaQuery.addEventListener("change", handleChange)
      return () => mediaQuery.removeEventListener("change", handleChange)
    }

    root.classList.add(theme)
    console.log("[ThemeProvider] HTML 元素类名已更新为:", theme, "完整类名:", root.className);
  }, [theme])

  useEffect(() => {
    const root = window.document.documentElement
    root.dataset.themeColor = themeColor
    localStorage.setItem(`${storageKey}-color`, themeColor)
    console.log("[ThemeProvider] 主题色已更新:", themeColor)
  }, [storageKey, themeColor])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      console.log("[ThemeProvider] setTheme 被调用，新主题:", theme);
      localStorage.setItem(storageKey, theme)
      setThemeState(theme)
      console.log("[ThemeProvider] localStorage 和 state 已更新");
    },
    themeColor,
    setThemeColor: (color: ThemeColor) => {
      console.log("[ThemeProvider] setThemeColor 被调用，新主题色:", color)
      setThemeColorState(color)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
