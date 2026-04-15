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
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ThreeDRotationIcon from '@mui/icons-material/ThreeDRotation';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { ModelContext, ThemeModeContext } from './contexts.ts';
import { isInStandaloneMode } from '../utils.ts';

export default function SettingsMenu({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;
  const { mode, toggleMode } = useContext(ThemeModeContext);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleMenuClose = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        title="Settings menu"
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
              ? 'Switch to single panel mode'
              : 'Switch to side-by-side mode'}
          </ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => {
          handleMenuClose();
          model.mutate(s => s.view.showAxes = !s.view.showAxes);
        }}>
          <ListItemIcon><ThreeDRotationIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{state.view.showAxes ? 'Hide axes' : 'Show axes'}</ListItemText>
        </MenuItem>

        <MenuItem onClick={() => {
          handleMenuClose();
          model.mutate(s => s.view.lineNumbers = !s.view.lineNumbers);
        }}>
          <ListItemIcon><FormatListNumberedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{state.view.lineNumbers ? 'Hide line numbers' : 'Show line numbers'}</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={() => {
          handleMenuClose();
          toggleMode();
        }}>
          <ListItemIcon>
            {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText>{mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}</ListItemText>
        </MenuItem>

        {isInStandaloneMode() && [
          <Divider key="div-clear" />,
          <MenuItem key="clear" onClick={() => {
            handleMenuClose();
            setConfirmOpen(true);
          }}>
            <ListItemIcon><DeleteForeverIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Clear local storage</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Clear local storage</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will clear all the edits you've made and files you've created in this playground
            and will reset it to factory defaults.
            Are you sure you wish to proceed? (you might lose your models!)
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              localStorage.clear();
              location.reload();
            }}
          >
            Clear all files!
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
