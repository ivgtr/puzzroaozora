import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface AppContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
  notice: string;
  noticeKey: number;
  showNotice: (message: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [notice, setNotice] = useState("");
  const [noticeKey, setNoticeKey] = useState(0);

  useEffect(() => {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "dark" || stored === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration sync from _document.tsx inline script
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(id);
  }, [notice, noticeKey]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    setNoticeKey((k) => k + 1);
  }, []);

  return (
    <AppContext value={{ theme, toggleTheme, notice, noticeKey, showNotice }}>
      {children}
    </AppContext>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
