// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useEffect, useMemo, useState } from 'react';
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

  const model = new Model(fs, state, setState, statePersister);
  useEffect(() => model.init());

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F5') {
        event.preventDefault();
        model.render({isPreview: true, now: true})
      } else if (event.key === 'F6') {
        event.preventDefault();
        model.render({isPreview: false, now: true})
      } else if (event.key === 'F7') {
        event.preventDefault();
        model.export();
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
      if (id === 'chat') {
        return {
          flex: 1,
          maxWidth: '50%',
          display: activeView === 'chat' ? 'flex' : 'none',
        };
      }
      if (id === 'editor') {
        return {
          flex: 1,
          maxWidth: '50%',
          display: activeView === 'code' ? 'flex' : 'none',
        };
      }
      if (id === 'viewer') {
        return {
          flex: 1,
          maxWidth: '50%',
          display: 'flex',
        };
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
      <ThemeModeContext.Provider value={themeModeContextValue}>
        <ModelContext.Provider value={model}>
          <FSContext.Provider value={fs}>
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              
              <PanelSwitcher />
        
              <Box sx={{
                display: 'flex',
                flexDirection: mode === 'multi' ? 'row' : 'column',
                flex: 1,
                ...(mode !== 'multi' ? { position: 'relative' } : {}),
              }}>

                <ChatPanel
                  className={`
                    opacity-animated
                    ${mode === 'single' && singleFocus !== 'chat' ? 'opacity-0' : ''}
                    ${mode === 'single' ? 'absolute-fill' : ''}
                  `}
                  style={getPanelStyle('chat')}
                />
                <EditorPanel className={`
                  opacity-animated
                  ${mode === 'single' && singleFocus !== 'editor' ? 'opacity-0' : ''}
                  ${mode === 'single' ? 'absolute-fill' : ''}
                `} style={getPanelStyle('editor')} />
                <ViewerPanel className={mode === 'single' ? `absolute-fill` : ''} style={getPanelStyle('viewer')} />
                <CustomizerPanel className={`
                  opacity-animated
                  ${mode === 'single' && singleFocus !== 'customizer' ? 'opacity-0' : ''}
                  ${mode === 'single' ? `absolute-fill` : ''}
                `} style={getPanelStyle('customizer')} />
              </Box>

              <Footer />
            </Box>
          </FSContext.Provider>
        </ModelContext.Provider>
      </ThemeModeContext.Provider>
    </ThemeProvider>
  );
}
