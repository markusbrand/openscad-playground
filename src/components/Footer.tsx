// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelContext } from './contexts.ts';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Box, Button, Chip, LinearProgress } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import SubjectIcon from '@mui/icons-material/Subject';
import HelpMenu from './HelpMenu.tsx';
import ExportButton from './ExportButton.tsx';
import SettingsMenu from './SettingsMenu.tsx';
import MultimaterialColorsDialog from './MultimaterialColorsDialog.tsx';


export default function Footer({style}: {style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const { t } = useTranslation();
  const state = model.state;

  const severityByMarkerSeverity = new Map<monaco.MarkerSeverity, 'error' | 'warning' | 'info'>([
    [monaco.MarkerSeverity.Error, 'error'],
    [monaco.MarkerSeverity.Warning, 'warning'],
    [monaco.MarkerSeverity.Info, 'info'],
  ]);

  const muiColorMap: Record<string, 'error' | 'warning' | 'info' | 'success'> = {
    error: 'error',
    warning: 'warning',
    info: 'info',
  };

  const markers = state.lastCheckerRun?.markers ?? [];
  const getBadge = (s: monaco.MarkerSeverity) => {
    const count = markers.filter(m => m.severity == s).length;
    const sev = severityByMarkerSeverity.get(s) ?? 'info';
    return <>{count > 0 && <Chip label={count} color={muiColorMap[sev]} size="small" sx={{ ml: 0.5 }} />}</>;
  };

  const maxMarkerSeverity = markers.length == 0 ? undefined : markers.map(m => m.severity).reduce((a, b) => Math.max(a, b));
  const maxSeverityLabel = maxMarkerSeverity ? severityByMarkerSeverity.get(maxMarkerSeverity) : undefined;
  
  return <>
    <LinearProgress
      sx={{
        mx: '5px',
        visibility: state.rendering || state.previewing || state.checkingSyntax || state.exporting
          ? 'visible' : 'hidden',
        height: '6px',
      }}
    />
      
    <Box sx={{
      display: 'flex',
      flexDirection: 'row',
      gap: 1,
      alignItems: 'center',
      m: '5px',
      ...(style ?? {})
    }}>
      {state.output && !state.output.isPreview
        ? (
            <ExportButton />
        ) : state.previewing ? (
          <Button
            startIcon={<BoltIcon />}
            disabled
            size="small"
            variant="outlined"
          >
            {t('footer.previewing')}
          </Button>
        ) : state.output && state.output.isPreview ? (
            <Button
              startIcon={<BoltIcon />}
              onClick={() => model.render({isPreview: false, now: true})}
              size="small"
              variant="outlined"
              disabled={state.rendering}
            >
              {state.rendering ? t('footer.rendering') : t('footer.render')}
            </Button>
        ) : undefined
      }
      <MultimaterialColorsDialog />
      
      {(state.lastCheckerRun || state.output) &&
        <Button
          color={maxSeverityLabel ? muiColorMap[maxSeverityLabel] : 'inherit'}
          startIcon={<SubjectIcon />}
          variant={state.view.logs ? 'contained' : 'text'}
          onClick={() => model.logsVisible = !state.view.logs}
          size="small"
        >
          {getBadge(monaco.MarkerSeverity.Error)}
          {getBadge(monaco.MarkerSeverity.Warning)}
          {getBadge(monaco.MarkerSeverity.Info)}
        </Button>}

      <Box sx={{ flex: 1 }} />

      <SettingsMenu />

      <HelpMenu style={{
          position: 'absolute',
          right: 0,
          top: '4px',
        }} />
    </Box>
  </>
}
