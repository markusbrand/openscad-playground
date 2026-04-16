import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from '@mui/material';
import { exportScad } from '../services/api.ts';

function triggerBlobDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ScadDownloadDialogProps {
  open: boolean;
  onClose: () => void;
  source: string;
  defaultFilename: string;
}

/** Download current source; optionally optimize via backend for FreeCAD. */
export function ScadDownloadDialog({ open, onClose, source, defaultFilename }: ScadDownloadDialogProps) {
  const { t } = useTranslation();
  const [optimizeForFreecad, setOptimizeForFreecad] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setOptimizeForFreecad(false);
      onClose();
    }
  };

  const handleDownload = async () => {
    setError(null);
    if (!optimizeForFreecad) {
      triggerBlobDownload(source, defaultFilename, 'text/plain');
      handleClose();
      return;
    }
    setLoading(true);
    try {
      const res = await exportScad({ code: source, optimize_for_freecad: true });
      triggerBlobDownload(res.code, res.filename, 'text/plain');
      handleClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('SCAD export (optimize for FreeCAD) failed:', e);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('scadDialogs.downloadTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('scadDialogs.downloadBody')}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={optimizeForFreecad}
              onChange={(_, c) => setOptimizeForFreecad(c)}
              disabled={loading}
            />
          }
          label={t('scadDialogs.optimizeCheckbox')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleDownload} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : null}>
          {t('common.download')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface FreeCadExportDialogProps {
  open: boolean;
  onClose: () => void;
  source: string;
}

/** Export SCAD optimized for FreeCAD via POST /api/v1/export/scad. */
export function FreeCadExportDialog({ open, onClose, source }: FreeCadExportDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!loading) {
      setError(null);
      onClose();
    }
  };

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await exportScad({ code: source, optimize_for_freecad: true });
      triggerBlobDownload(res.code, res.filename, 'text/plain');
      handleClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('FreeCAD SCAD export failed:', e);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('scadDialogs.exportTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('scadDialogs.freecadInfo')}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          {t('scadDialogs.freecadBackendNote')}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleExport} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : null}>
          {t('scadDialogs.downloadOptimizedScad')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
