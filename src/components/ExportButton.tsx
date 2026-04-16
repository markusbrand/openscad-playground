import React, { useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelContext } from './contexts.ts';
import {
  Box,
  Button,
  ButtonGroup,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SettingsIcon from '@mui/icons-material/Settings';
import CodeIcon from '@mui/icons-material/Code';
import HandymanIcon from '@mui/icons-material/Handyman';
import { FreeCadExportDialog, ScadDownloadDialog } from './ScadExportDialogs.tsx';

interface ExportMenuItem {
  data?: string;
  buttonLabel?: string;
  label?: string;
  icon: React.ReactNode;
  command?: () => void;
  separator?: boolean;
  disabled?: boolean;
}

function defaultScadDownloadName(activePath: string): string {
  const name = activePath.split('/').pop()?.trim() || 'model.scad';
  if (name.toLowerCase().endsWith('.scad')) {
    return name;
  }
  const withoutExt = name.includes('.') ? name.replace(/\.[^/.]+$/, '') : name;
  return `${withoutExt || 'model'}.scad`;
}

export default function ExportButton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const { t } = useTranslation();
  const state = model.state;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [scadDownloadOpen, setScadDownloadOpen] = useState(false);
  const [freecadExportOpen, setFreecadExportOpen] = useState(false);

  const hasSource = model.source.trim().length > 0;
  const meshExportDisabled =
    !state.output || state.output.isPreview || state.rendering || state.exporting;
  const dropdownDisabled = meshExportDisabled && !hasSource;

  const scadFileName = useMemo(() => defaultScadDownloadName(state.params.activePath), [state.params.activePath]);

  const scadMenuItems: ExportMenuItem[] = [
    {
      data: 'scad',
      buttonLabel: t('export.downloadScad'),
      label: t('export.scadSource'),
      icon: <CodeIcon fontSize="small" />,
      disabled: !hasSource,
      command: () => setScadDownloadOpen(true),
    },
    {
      data: 'freecad_scad',
      label: t('export.freecad'),
      icon: <HandymanIcon fontSize="small" />,
      disabled: !hasSource,
      command: () => setFreecadExportOpen(true),
    },
  ];

  const dropdownModel: ExportMenuItem[] = state.is2D
    ? [
        {
          data: 'svg',
          buttonLabel: t('export.svg'),
          label: t('export.svgLabel'),
          icon: <DownloadIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats('svg', undefined),
        },
        {
          data: 'dxf',
          buttonLabel: t('export.dxf'),
          label: t('export.dxfLabel'),
          icon: <DownloadIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats('dxf', undefined),
        },
        { separator: true, icon: null },
        ...scadMenuItems,
      ]
    : [
        {
          data: 'glb',
          buttonLabel: t('export.downloadGlb'),
          label: t('export.glbLabel'),
          icon: <InsertDriveFileIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats(undefined, 'glb'),
        },
        {
          data: 'stl',
          buttonLabel: t('export.downloadStl'),
          label: t('export.stlBinary'),
          icon: <InsertDriveFileIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats(undefined, 'stl'),
        },
        {
          data: 'off',
          buttonLabel: t('export.downloadOff'),
          label: t('export.offLabel'),
          icon: <InsertDriveFileIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats(undefined, 'off'),
        },
        {
          data: '3mf',
          buttonLabel: t('export.download3mf'),
          label: t('export.threeMfShort'),
          icon: <InsertDriveFileIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.setFormats(undefined, '3mf'),
        },
        { separator: true, icon: null },
        ...scadMenuItems,
        { separator: true, icon: null },
        {
          label:
            t('export.editMaterials') +
            ((state.params.extruderColors ?? []).length > 0
              ? ` (${(state.params.extruderColors ?? []).length})`
              : ''),
          icon: <SettingsIcon fontSize="small" />,
          disabled: meshExportDisabled,
          command: () => model!.mutate(s => (s.view.extruderPickerVisibility = 'editing')),
        },
      ];

  const exportFormat = state.is2D ? state.params.exportFormat2D : state.params.exportFormat3D;
  const selectedItem = dropdownModel.filter(item => item.data === exportFormat)[0] || dropdownModel[0]!;

  return (
    <Box className={className} style={style}>
      <ButtonGroup variant="outlined" size="small" color="secondary">
        <Button startIcon={<DownloadIcon />} disabled={meshExportDisabled} onClick={() => model!.export()}>
          {selectedItem.buttonLabel}
        </Button>
        <Button size="small" disabled={dropdownDisabled} onClick={e => setAnchorEl(e.currentTarget)}>
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {dropdownModel.map((item, i) =>
          item.separator ? (
            <Divider key={i} />
          ) : (
            <MenuItem
              key={i}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                setAnchorEl(null);
                item.command?.();
              }}
            >
              {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
              <ListItemText>{item.label}</ListItemText>
            </MenuItem>
          ),
        )}
      </Menu>
      <ScadDownloadDialog
        open={scadDownloadOpen}
        onClose={() => setScadDownloadOpen(false)}
        source={model.source}
        defaultFilename={scadFileName}
      />
      <FreeCadExportDialog
        open={freecadExportOpen}
        onClose={() => setFreecadExportOpen(false)}
        source={model.source}
      />
    </Box>
  );
}
