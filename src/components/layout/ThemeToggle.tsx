import { useAppContext } from "@/contexts/AppContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useAppContext();

  return (
    <button type="button" className="theme-toggle" onClick={toggleTheme}>
      {theme === "dark" ? "light" : "dark"}
    </button>
  );
}
