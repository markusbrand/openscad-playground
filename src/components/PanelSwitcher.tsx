// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { useContext } from 'react';
import { SingleLayoutComponentId } from '../state/app-state.ts'
import { Tabs, Tab, ToggleButtonGroup, ToggleButton, Box } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import EditIcon from '@mui/icons-material/Edit';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import TuneIcon from '@mui/icons-material/Tune';
import { ModelContext } from './contexts.ts';

const iconMap: Record<SingleLayoutComponentId, React.ReactElement> = {
  chat: <SmartToyIcon />,
  editor: <EditIcon />,
  viewer: <ViewInArIcon />,
  customizer: <TuneIcon />,
};

export default function PanelSwitcher() {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;
  const activeView = state.view.activeView ?? 'chat';

  const singleTargets: {id: SingleLayoutComponentId, label: string}[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'editor', label: 'Code' },
    { id: 'viewer', label: 'View' },
  ];
  if ((state.parameterSet?.parameters?.length ?? 0) > 0) {
    singleTargets.push({ id: 'customizer', label: 'Customize' });
  }

  const multiTargets: {id: string, label: string}[] = [
    { id: 'chat', label: 'Chat' },
    { id: 'editor', label: 'Code' },
  ];

  const handleMultiViewToggle = (id: string) => {
    if (id === 'chat' || id === 'editor') {
      model.mutate(s => {
        s.view.activeView = id === 'chat' ? 'chat' : 'code';
      });
    }
  };

  const handleSingleTabChange = (_e: React.SyntheticEvent, newValue: number) => {
    const target = singleTargets[newValue];
    if (target.id === 'chat') {
      model.mutate(s => {
        s.view.activeView = 'chat';
        if (s.view.layout.mode === 'single') {
          s.view.layout.focus = 'chat';
        }
      });
    } else if (target.id === 'editor') {
      model.mutate(s => {
        s.view.activeView = 'code';
        if (s.view.layout.mode === 'single') {
          s.view.layout.focus = 'editor';
        }
      });
    } else {
      model.changeSingleVisibility(target.id);
    }
  };

  const getSingleTabValue = (): number => {
    if (state.view.layout.mode === 'single') {
      const focus = state.view.layout.focus;
      if (focus === 'chat') return 0;
      if (focus === 'editor') return 1;
      return singleTargets.findIndex(t => t.id === focus);
    }
    return activeView === 'chat' ? 0 : 1;
  };

  return (
    <Box sx={{ px: 0.5, pt: 0.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'row', m: '5px', position: 'relative' }}>

        {state.view.layout.mode === 'multi'
          ? <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, justifyContent: 'center', flex: 1, m: '5px' }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={activeView === 'chat' ? 'chat' : 'editor'}
                onChange={(_e, newId) => {
                  if (newId === null) return;
                  handleMultiViewToggle(newId);
                }}
              >
                {multiTargets.map(({ label, id }) => (
                  <ToggleButton key={id} value={id}>
                    {iconMap[id as SingleLayoutComponentId]}
                    <Box component="span" sx={{ ml: 0.5 }}>{label}</Box>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          : <Tabs
              value={getSingleTabValue()}
              onChange={handleSingleTabChange}
              sx={{ flex: 1 }}
              variant="fullWidth"
            >
              {singleTargets.map(({label, id}) => (
                <Tab key={id} icon={iconMap[id]} label={label} iconPosition="start" />
              ))}
            </Tabs>
        }
      </Box>
    </Box>
  );
}
