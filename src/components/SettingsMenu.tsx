// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useContext, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import LanguageIcon from '@mui/icons-material/Language';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useTranslation } from 'react-i18next';
import { ModelContext, ThemeModeContext } from './contexts.ts';
import { setUiLocale } from '../i18n/init';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from '../i18n/locales';
import { isInStandaloneMode } from '../utils.ts';

export default function SettingsMenu({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;
  const { mode, toggleMode } = useContext(ThemeModeContext);
  const { t, i18n } = useTranslation();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleMenuClose = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        title={t('settingsMenu.title')}
        style={style}
        className={className}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        <SettingsIcon />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          handleMenuClose();
          model.changeLayout(state.view.layout.mode === 'multi' ? 'single' : 'multi');
        }}>
          <ListItemIcon><ViewColumnIcon fontSize="small" /></ListItemIcon>
          <ListItemText>
            {state.view.layout.mode === 'multi'
              ? t('settingsMenu.layoutMulti')
              : t('settingsMenu.layoutSingle')}
          </ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => {
          handleMenuClose();
          model.mutate(s => s.view.showAxes = !s.view.showAxes);
        }}>
          <ListItemIcon><ThreeDRotationIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{state.view.showAxes ? t('settingsMenu.axesHide') : t('settingsMenu.axesShow')}</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => {
          handleMenuClose();
          model.mutate(s => s.view.lineNumbers = !s.view.lineNumbers);
        }}>
          <ListItemIcon><FormatListNumberedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{state.view.lineNumbers ? t('settingsMenu.lineNumbersHide') : t('settingsMenu.lineNumbersShow')}</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => {
          handleMenuClose();
          toggleMode();
        }}>
          <ListItemIcon>
            {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{mode === 'light' ? t('settingsMenu.themeDark') : t('settingsMenu.themeLight')}</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem disabled sx={{ opacity: 0.85, py: 0.5, minHeight: 0 }}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <LanguageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }}>
            {t('settingsMenu.language')}
          </ListItemText>
        </MenuItem>
        {SUPPORTED_LOCALES.map((loc: AppLocale) => (
          <MenuItem
            key={loc}
            dense
            selected={i18n.resolvedLanguage === loc}
            onClick={() => {
              setUiLocale(loc);
              handleMenuClose();
            }}
          >
            <ListItemText inset>{LOCALE_LABELS[loc]}</ListItemText>
          </MenuItem>
        ))}

        {isInStandaloneMode() && [
          <Divider key="div-clear" />,
          <MenuItem key="clear" onClick={() => {
            handleMenuClose();
            setConfirmOpen(true);
          }}>
            <ListItemIcon><DeleteForeverIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{t('settingsMenu.clearStorage')}</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('settingsMenu.clearTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('settingsMenu.clearBody')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              localStorage.clear();
              location.reload();
            }}
          >
            {t('settingsMenu.clearConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
