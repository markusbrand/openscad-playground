// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import GitHubIcon from '@mui/icons-material/GitHub';
import InfoIcon from '@mui/icons-material/Info';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PaletteIcon from '@mui/icons-material/Palette';

interface HelpLink {
  label: string;
  icon: React.ReactNode;
  url: string;
}

const helpLinks: HelpLink[] = [
  {
    label: 'openscad-playground',
    icon: <GitHubIcon fontSize="small" />,
    url: 'https://github.com/openscad/openscad-playground/',
  },
  {
    label: 'LICENSES',
    icon: <InfoIcon fontSize="small" />,
    url: 'https://github.com/openscad/openscad-playground/blob/main/LICENSE.md',
  },
  {
    label: 'OpenSCAD Docs',
    icon: <MenuBookIcon fontSize="small" />,
    url: 'https://openscad.org/documentation.html',
  },
  {
    label: 'Customizer Syntax',
    icon: <MenuBookIcon fontSize="small" />,
    url: 'https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer',
  },
  {
    label: 'OpenSCAD Cheatsheet',
    icon: <PaletteIcon fontSize="small" />,
    url: 'https://openscad.org/cheatsheet/',
  },
  {
    label: 'BOSL2 Cheatsheet',
    icon: <PaletteIcon fontSize="small" />,
    url: 'https://github.com/BelfrySCAD/BOSL2/wiki/CheatSheet',
  },
];

export default function HelpMenu({className, style}: {className?: string, style?: CSSProperties}) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <>
      <IconButton
        title={t('help.menuTitle')}
        style={style}
        className={className}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        <HelpOutlineIcon />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {helpLinks.map((link) => (
          <MenuItem
            key={link.url}
            component="a"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAnchorEl(null)}
          >
            <ListItemIcon>{link.icon}</ListItemIcon>
            <ListItemText>{link.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
