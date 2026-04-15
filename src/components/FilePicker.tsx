// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useMemo } from 'react';
import { Autocomplete, TextField, Box } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import HomeIcon from '@mui/icons-material/Home';
import GitHubIcon from '@mui/icons-material/GitHub';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { ModelContext, FSContext } from './contexts.ts';
import { getParentDir, join } from '../fs/filesystem.ts';
import { defaultSourcePath } from '../state/initial-state.ts';
import { zipArchives } from '../fs/zip-archives.ts';

interface FileOption {
  label: string;
  value: string;
  group: string;
  icon: React.ReactNode;
  isLink?: boolean;
}

const biasedCompare = (a: string, b: string) => 
  a === 'openscad' ? -1 : b === 'openscad' ? 1 : a.localeCompare(b);

function flattenFiles(fs: FS, path: string, group: string, accept?: (path: string) => boolean): FileOption[] {
  const result: FileOption[] = [];
  
  let entries: string[];
  try {
    entries = fs.readdirSync(path);
  } catch {
    return result;
  }

  const files: [string, string][] = [];
  const dirs: [string, string][] = [];

  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const childPath = join(path, name);
    if (accept && !accept(childPath)) continue;
    
    let stat;
    try {
      stat = fs.lstatSync(childPath);
    } catch {
      continue;
    }
    const isDirectory = stat.isDirectory();
    if (!isDirectory && !name.endsWith('.scad')) continue;
    (isDirectory ? dirs : files).push([name, childPath]);
  }
  [files, dirs].forEach(arr => arr.sort(([a], [b]) => biasedCompare(a, b)));

  for (const [name, filePath] of files) {
    result.push({
      label: name,
      value: filePath,
      group,
      icon: filePath === defaultSourcePath
        ? <HomeIcon fontSize="small" sx={{ mr: 1 }} />
        : <InsertDriveFileIcon fontSize="small" sx={{ mr: 1 }} />,
    });
  }

  for (const [name, dirPath] of dirs) {
    if (dirPath.lastIndexOf('/') === 0) {
      const config = zipArchives[name];
      if (config?.gitOrigin) {
        result.push({
          label: config.gitOrigin.repoUrl.replaceAll('https://github.com/', ''),
          value: config.gitOrigin.repoUrl,
          group: name,
          icon: <GitHubIcon fontSize="small" sx={{ mr: 1 }} />,
          isLink: true,
        });
        for (const [docLabel, link] of Object.entries(config.docs ?? [])) {
          result.push({
            label: docLabel,
            value: link,
            group: name,
            icon: <MenuBookIcon fontSize="small" sx={{ mr: 1 }} />,
            isLink: true,
          });
        }
      }
    }
    const childGroup = group ? `${group} / ${name}` : name;
    result.push(...flattenFiles(fs, dirPath, childGroup, accept));
  }

  return result;
}

export default function FilePicker({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const fs = useContext(FSContext);

  const options = useMemo(() => {
    const items: FileOption[] = [];

    for (const {path} of state.params.sources) {
      const parent = getParentDir(path);
      if (parent === '/') {
        items.push({
          label: path.split('/').pop() ?? path,
          value: path,
          group: 'Project',
          icon: <HomeIcon fontSize="small" sx={{ mr: 1 }} />,
        });
      }
    }

    if (fs) {
      items.push(...flattenFiles(fs, '/', ''));
    }

    return items;
  }, [fs, state.params.sources]);

  const currentOption = options.find(o => o.value === state.params.activePath) ?? undefined;

  return (
    <Autocomplete
      className={className}
      style={style}
      size="small"
      options={options}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => option.label}
      value={currentOption}
      isOptionEqualToValue={(option, value) => option.value === value.value}
      onChange={(_e, newValue) => {
        if (!newValue) return;
        if (newValue.isLink || newValue.value.startsWith('https://')) {
          window.open(newValue.value, '_blank');
        } else {
          model.openFile(newValue.value);
        }
      }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.value} sx={{ display: 'flex', alignItems: 'center' }}>
          {option.icon}
          {option.label}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Select file..."
          title="OpenSCAD Playground Files"
        />
      )}
      disableClearable
    />
  );
}
