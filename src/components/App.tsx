// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, useMediaQuery, Box } from '@mui/material';
import { MultiLayoutComponentId, State, StatePersister } from '../state/app-state'
import { Model } from '../state/model';
import ChatPanel from './ChatPanel';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanel';
import Footer from './Footer';
import { ModelContext, FSContext, ThemeModeContext, ThemeMode } from './contexts';
import PanelSwitcher from './PanelSwitcher';
import CustomizerPanel from './CustomizerPanel';
import PwaUpdateSnackbar from './PwaUpdateSnackbar';


export function App({initialState, statePersister, fs}: {initialState: State, statePersister: StatePersister, fs: FS}) {
  const [state, setState] = useState(initialState);
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [themeMode, setThemeMode] = useState<ThemeMode>(prefersDarkMode ? 'dark' : 'light');

  const theme = useMemo(() => createTheme({
    palette: {
      mode: themeMode,
      primary: { main: '#1976d2' },
      secondary: { main: '#9c27b0' },
    },
    typography: {
      fontFamily: "'Roboto', 'Helvetica', 'Arial', sans-serif",
    },
    components: {
      MuiButton: {
        defaultProps: { size: 'small' },
      },
      MuiIconButton: {
        defaultProps: { size: 'small' },
      },
    },
  }), [themeMode]);

  const themeModeContextValue = useMemo(() => ({
    mode: themeMode,
    toggleMode: () => setThemeMode(prev => prev === 'light' ? 'dark' : 'light'),
  }), [themeMode]);

  const modelRef = useRef<Model | null>(null);
  if (modelRef.current === null) {
    modelRef.current = new Model(fs, initialState, setState, statePersister);
  }
  const model = modelRef.current;
  model.state = state;

  useEffect(() => {
    modelRef.current?.init();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const m = modelRef.current;
      if (!m) return;
      if (event.key === 'F5') {
        event.preventDefault();
        m.render({ isPreview: true, now: true });
      } else if (event.key === 'F6') {
        event.preventDefault();
        m.render({ isPreview: false, now: true });
      } else if (event.key === 'F7') {
        event.preventDefault();
        void m.export();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const activeView = state.view.activeView ?? 'chat';
  const layout = state.view.layout;
  const mode = layout.mode;

  const zIndexOfPanelsDependingOnFocus = {
    chat: {
      chat: 3,
      editor: 2,
      viewer: 1,
      customizer: 0,
    },
    editor: {
      chat: 0,
      editor: 3,
      viewer: 1,
      customizer: 0,
    },
    viewer: {
      chat: 0,
      editor: 2,
      viewer: 3,
      customizer: 1,
    },
    customizer: {
      chat: 0,
      editor: 0,
      viewer: 1,
      customizer: 3,
    }
  };

  function getPanelStyle(id: MultiLayoutComponentId | 'chat'): CSSProperties {
    if (layout.mode === 'multi') {
      // Multi layout uses a dedicated left column (chat/code) + right viewer in JSX;
      // only customizer styling is handled here.
      if (id === 'chat' || id === 'editor' || id === 'viewer') {
        return {};
      }
      // customizer in multi mode - hidden (accessed via single mode)
      return { display: 'none' };
    } else {
      const focus = layout.focus;
      const focusKey = focus === 'chat' ? 'chat' : focus;
      return {
        flex: 1,
        zIndex: Number((zIndexOfPanelsDependingOnFocus as any)[focusKey]?.[id] ?? 0),
      };
    }
  }

  const singleFocus = layout.mode === 'single' ? layout.focus : undefined;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PwaUpdateSnackbar />
      <ThemeModeContext.Provider value={themeModeContextValue}>
        <ModelContext.Provider value={model}>
          <FSContext.Provider value={fs}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <PanelSwitcher />
        
              <Box sx={{
                display: 'flex',
                flexDirection: mode === 'multi' ? 'row' : 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                ...(mode !== 'multi' ? { position: 'relative' } : {}),
              }}>

                {mode === 'multi' ? (
                  <>
                    <Box sx={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '50%',
                      minHeight: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                    }}>
                      <ChatPanel
                        className="opacity-animated"
                        style={{
                          flex: 1,
                          minHeight: 0,
                          display: activeView === 'chat' ? 'flex' : 'none',
                        }}
                      />
                      <EditorPanel
                        className="opacity-animated"
                        style={{
                          flex: 1,
                          minHeight: 0,
                          display: activeView === 'code' ? 'flex' : 'none',
                        }}
                      />
                    </Box>
                    <ViewerPanel
                      className=""
                      style={{
                        flex: 1,
                        minWidth: 0,
                        maxWidth: '50%',
                        minHeight: 0,
                        display: 'flex',
                      }}
                    />
                    <CustomizerPanel style={getPanelStyle('customizer')} />
                  </>
                ) : (
                  <>
                    <ChatPanel
                      className={`
                        opacity-animated
                        ${singleFocus !== 'chat' ? 'opacity-0' : ''}
                        absolute-fill
                      `}
                      style={getPanelStyle('chat')}
                    />
                    <EditorPanel
                      className={`
                        opacity-animated
                        ${singleFocus !== 'editor' ? 'opacity-0' : ''}
                        absolute-fill
                      `}
                      style={getPanelStyle('editor')}
                    />
                    <ViewerPanel className="absolute-fill" style={getPanelStyle('viewer')} />
                    <CustomizerPanel
                      className={`
                        opacity-animated
                        ${singleFocus !== 'customizer' ? 'opacity-0' : ''}
                        absolute-fill
                      `}
                      style={getPanelStyle('customizer')}
                    />
                  </>
                )}
              </Box>

              <Footer />
            </Box>
          </FSContext.Provider>
        </ModelContext.Provider>
      </ThemeModeContext.Provider>
    </ThemeProvider>
  );
}
