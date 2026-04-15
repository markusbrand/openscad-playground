// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useState } from 'react';
import Editor, { loader, Monaco } from '@monaco-editor/react';
import openscadEditorOptions from '../language/openscad-editor-options.ts';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Box, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Divider, TextField } from '@mui/material';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ShareIcon from '@mui/icons-material/Share';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import SearchIcon from '@mui/icons-material/Search';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { buildUrlForStateParams } from '../state/fragment-state.ts';
import { getBlankProjectState, defaultSourcePath } from '../state/initial-state.ts';
import { ModelContext } from './contexts.ts';
import FilePicker from './FilePicker.tsx';

const isMonacoSupported = (() => {
  const ua = window.navigator.userAgent;
  const iosWk = ua.match(/iPad|iPhone/i) && ua.match(/WebKit/i);
  const android = ua.match(/Android/i);
  return !(iosWk || android);
})();

let monacoInstance: Monaco | null = null;
if (isMonacoSupported) {
  loader.init().then(mi => monacoInstance = mi);
}

export default function EditorPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;

  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  if (editor) {
    const checkerRun = state.lastCheckerRun;
    const editorModel = editor.getModel();
    if (editorModel) {
      if (checkerRun && monacoInstance) {
        monacoInstance.editor.setModelMarkers(editorModel, 'openscad', checkerRun.markers);
      }
    }
  }

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.addAction({
      id: "openscad-render",
      label: "Render OpenSCAD",
      run: () => model.render({isPreview: false, now: true})
    });
    editor.addAction({
      id: "openscad-preview",
      label: "Preview OpenSCAD",
      run: () => model.render({isPreview: true, now: true})
    });
    editor.addAction({
      id: "openscad-save-do-nothing",
      label: "Save (disabled)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {}
    });
    editor.addAction({
      id: "openscad-save-project",
      label: "Save OpenSCAD project",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
      run: () => model.saveProject()
    });
    setEditor(editor)
  }

  const menuItems = [
    {
      label: "New project",
      icon: <AddCircleOutlineIcon fontSize="small" />,
      onClick: () => window.open(buildUrlForStateParams(getBlankProjectState()), '_blank'),
    },
    {
      label: 'Share project',
      icon: <ShareIcon fontSize="small" />,
      disabled: true,
    },
    { divider: true },
    {
      label: "New file",
      icon: <NoteAddIcon fontSize="small" />,
      disabled: true,
    },
    {
      label: "Copy to new file",
      icon: <ContentCopyIcon fontSize="small" />,
      disabled: true,
    },
    {
      label: "Upload file(s)",
      icon: <UploadIcon fontSize="small" />,
      disabled: true,
    },
    {
      label: 'Download sources',
      icon: <DownloadIcon fontSize="small" />,
      disabled: true,
    },
    { divider: true },
    {
      label: 'Select All',
      icon: <SelectAllIcon fontSize="small" />,
      onClick: () => editor?.trigger(state.params.activePath, 'editor.action.selectAll', null),
    },
    { divider: true },
    {
      label: 'Find',
      icon: <SearchIcon fontSize="small" />,
      onClick: () => editor?.trigger(state.params.activePath, 'actions.find', null),
    },
  ];

  return (
    <div className={`editor-panel ${className ?? ''}`} style={{
      display: 'flex',
      flexDirection: 'column',
      ...(style ?? {})
    }}>
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, m: '5px', alignItems: 'center' }}>
          
        <IconButton
          title="Editor menu"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          {menuItems.map((item, i) => 
            'divider' in item ? (
              <Divider key={i} />
            ) : (
              <MenuItem
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setMenuAnchor(null);
                  item.onClick?.();
                }}
              >
                {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
                <ListItemText>{item.label}</ListItemText>
              </MenuItem>
            )
          )}
        </Menu>
        
        <FilePicker style={{ flex: 1 }} />

        {state.params.activePath !== defaultSourcePath && 
          <IconButton
            onClick={() => model.openFile(defaultSourcePath)} 
            title={`Go back to ${defaultSourcePath}`}
          >
            <ChevronLeftIcon />
          </IconButton>
        }
      </Box>

      
      <div style={{
        position: 'relative',
        flex: 1
      }}>
        {isMonacoSupported && (
          <Editor
            className="openscad-editor absolute-fill"
            defaultLanguage="openscad"
            path={state.params.activePath}
            value={model.source}
            onChange={s => model.source = s ?? ''}
            onMount={onMount}
            options={{
              ...openscadEditorOptions,
              fontSize: 16,
              lineNumbers: state.view.lineNumbers ? 'on' : 'off',
            }}
          />
        )}
        {!isMonacoSupported && (
          <TextField
            className="openscad-editor absolute-fill"
            value={model.source}
            onChange={s => model.source = s.target.value ?? ''}
            multiline
            fullWidth
            variant="outlined"
            sx={{ height: '100%' }}
          />
        )}
      </div>

      <div style={{
        display: state.view.logs ? undefined : 'none',
        overflowY: 'scroll',
        height: 'calc(min(200px, 30vh))',
      }}>
        {(state.currentRunLogs ?? []).map(([type, text], i) => (
          <pre key={i}>{text}</pre>
        ))}
      </div>
    
    </div>
  )
}
