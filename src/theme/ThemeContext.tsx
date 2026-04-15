import React, {createContext, useContext, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from '@react-navigation/native';
import {getThemeColors} from './colors';
import type {AppColors, ThemeMode} from './colors';

const STORAGE_KEY = 'notes-app-theme-mode';

type ThemeContextValue = {
  colors: AppColors;
  mode: ThemeMode;
  navigationTheme: typeof NavigationDarkTheme;
  setMode: (mode: ThemeMode) => void;
  statusBarStyle: 'light-content' | 'dark-content';
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({children}: {children: React.ReactNode}) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const storedMode = await AsyncStorage.getItem(STORAGE_KEY);
        if (mounted && (storedMode === 'dark' || storedMode === 'light')) {
          setModeState(storedMode);
        }
      } catch (_) {}
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = (nextMode: ThemeMode) => {
    setModeState(nextMode);
    AsyncStorage.setItem(STORAGE_KEY, nextMode).catch(() => {});
  };

  const toggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const colors = getThemeColors(mode);
  const baseNavigationTheme =
    mode === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      background: colors.bg,
      border: colors.border,
      card: colors.surface,
      notification: colors.accent,
      primary: colors.accent,
      text: colors.text,
    },
  };

  return (
    <ThemeContext.Provider
      value={{
        colors,
        mode,
        navigationTheme,
        setMode,
        statusBarStyle: mode === 'dark' ? 'light-content' : 'dark-content',
        toggleTheme,
      }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used inside ThemeProvider');
  }
  return value;
};
