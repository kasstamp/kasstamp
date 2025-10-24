import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = stored ? stored === 'dark' : prefersDark;

    setIsDark(shouldBeDark);
    applyTheme(shouldBeDark);

    if (!stored) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setIsDark(e.matches);
        applyTheme(e.matches);
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const applyTheme = (dark: boolean) => {
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    if (dark) {
      root.style.setProperty('--background', '#0E1118');
      root.style.setProperty('--background-contrast', '#171B27');
      root.style.setProperty('--background-outline', '#212A3E');
      root.style.setProperty('--background-shadow', '#0f0f16');
      root.style.setProperty('--text', '#7f8699');
      root.style.setProperty('--text-strong', '#F5F5F5');
      root.style.setProperty('--primary', '#00B676');
      root.style.setProperty('--dialog-contrast-opacity', '70%');
    } else {
      root.style.setProperty('--background', '#eaecf2');
      root.style.setProperty('--background-contrast', '#FFFFFF');
      root.style.setProperty('--background-outline', '#E7F0F4');
      root.style.setProperty('--background-shadow', '#797979');
      root.style.setProperty('--text', '#676e80');
      root.style.setProperty('--text-strong', '#33394B');
      root.style.setProperty('--primary', '#00B676');
      root.style.setProperty('--dialog-contrast-opacity', '95%');
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDark;
    setIsDark(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center gap-1 text-xs text-[color:var(--text)] transition-colors hover:text-[color:var(--primary)]"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
