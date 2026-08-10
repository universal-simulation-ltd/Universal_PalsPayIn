import { create } from 'zustand';

// Light mode is the DEFAULT until the user explicitly chooses otherwise —
// 'system' is an explicit choice here, never the starting point (suite rule,
// Docs_UNI_SIM/landmines.md → Standing policies).

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'unisim-palspayin-theme';

function load(): ThemePref {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'dark' || v === 'system' ? v : 'light';
}

function isDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(pref: ThemePref) {
  const dark = isDark(pref);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

interface ThemeState {
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = load();
  apply(initial);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { pref } = useThemeStore.getState();
    if (pref === 'system') apply(pref);
  });
  return {
    pref: initial,
    setPref: (pref) => {
      localStorage.setItem(STORAGE_KEY, pref);
      apply(pref);
      set({ pref });
    },
  };
});
