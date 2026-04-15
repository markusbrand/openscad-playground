import React from "react";
import { Model } from "../state/model.ts";

export const FSContext = React.createContext<FS | undefined>(undefined);

export const ModelContext = React.createContext<Model | null>(null);

export type ThemeMode = 'light' | 'dark';

export const ThemeModeContext = React.createContext<{
  mode: ThemeMode;
  toggleMode: () => void;
}>({
  mode: 'light',
  toggleMode: () => {},
});
