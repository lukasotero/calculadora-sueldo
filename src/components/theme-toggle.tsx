"use client";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar tema claro u oscuro"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun
        data-icon="inline-start"
        className="hidden dark:block"
        aria-hidden="true"
      />
      <Moon
        data-icon="inline-start"
        className="block dark:hidden"
        aria-hidden="true"
      />
    </Button>
  );
}
