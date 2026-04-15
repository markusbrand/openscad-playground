// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext } from 'react';
import { ModelContext } from './contexts.ts';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { Parameter } from '../state/customizer-types.ts';

export default function CustomizerPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;

  const handleChange = (name: string, value: any) => {
    model.setVar(name, value);
  };

  const groupedParameters = (state.parameterSet?.parameters ?? []).reduce((acc, param) => {
    if (!acc[param.group]) {
      acc[param.group] = [];
    }
    acc[param.group].push(param);
    return acc;
  }, {} as { [key: string]: any[] });

  const groups = Object.entries(groupedParameters);
  const collapsedTabSet = new Set(state.view.collapsedCustomizerTabs ?? []);
  const setTabOpen = (name: string, open: boolean) => {
    if (open) {
      collapsedTabSet.delete(name);
    } else {
      collapsedTabSet.add(name)
    }
    model.mutate(s => s.view.collapsedCustomizerTabs = Array.from(collapsedTabSet));
  }

  return (
    <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          overflow: 'auto',
          ...style,
          bottom: 'unset',
        }}>
      {groups.map(([group, params]) => (
        <Accordion
          key={group}
          expanded={!collapsedTabSet.has(group)}
          onChange={(_e, expanded) => setTabOpen(group, expanded)}
          sx={{
            mx: '10px',
            my: '5px',
            backgroundColor: 'rgba(255,255,255,0.4)',
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>{group}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {params.map((param: Parameter) => (
              <ParameterInput
                key={param.name}
                value={(state.params.vars ?? {})[param.name]}
                param={param}
                handleChange={handleChange} />
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
};

function ParameterInput({param, value, className, style, handleChange}: {param: Parameter, value: any, className?: string, style?: CSSProperties, handleChange: (key: string, value: any) => void}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ...style }}>
      <Box sx={{
        flex: 1,
        display: 'flex',
        m: '10px -10px 10px 5px',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="subtitle2" fontWeight="bold">{param.name}</Typography>
          <Typography variant="caption">{param.caption}</Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {param.type === 'number' && 'options' in param && (
            <Select
              size="small"
              sx={{ flex: 1 }}
              value={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.target.value)}
            >
              {(param.options ?? []).map((opt: any) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.name}</MenuItem>
              ))}
            </Select>
          )}
          {param.type === 'string' && param.options && (
            <Select
              size="small"
              value={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.target.value)}
            >
              {param.options.map((opt: any) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.name}</MenuItem>
              ))}
            </Select>
          )}
          {param.type === 'boolean' && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={value ?? param.initial}
                  onChange={(e) => handleChange(param.name, e.target.checked)}
                />
              }
              label=""
            />
          )}
          {!Array.isArray(param.initial) && param.type === 'number' && !('options' in param) && (
            <TextField
              type="number"
              size="small"
              value={value ?? param.initial}
              onChange={(e) => handleChange(param.name, Number(e.target.value))}
              sx={{ width: 120 }}
            />
          )}
          {param.type === 'string' && !param.options && (
            <TextField
              size="small"
              sx={{ flex: 1 }}
              value={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.target.value)}
            />
          )}
          {Array.isArray(param.initial) && 'min' in param && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 0.5 }}>
              {param.initial.map((_: any, index: number) => (
                <TextField
                  key={index}
                  type="number"
                  size="small"
                  sx={{ flex: 1 }}
                  value={value?.[index] ?? (param.initial as any)[index]}
                  inputProps={{
                    min: param.min,
                    max: param.max,
                    step: param.step,
                  }}
                  onChange={(e) => {
                    const newArray = [...(value ?? param.initial)];
                    newArray[index] = Number(e.target.value);
                    handleChange(param.name, newArray);
                  }}
                />
              ))}
            </Box>
          )}
          <IconButton
            onClick={() => handleChange(param.name, param.initial)}
            sx={{
              mr: 0,
              visibility: value === undefined || (JSON.stringify(value) === JSON.stringify(param.initial)) ? 'hidden' : 'visible',
            }}
            title="Reset to default"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {!Array.isArray(param.initial) && param.type === 'number' && param.min !== undefined && (
        <Slider
          sx={{
            flex: 1,
            minHeight: '5px',
            mx: '5px',
            mr: '40px',
            my: '5px',
          }}
          value={value ?? param.initial}
          min={param.min}
          max={param.max}
          step={param.step}
          onChange={(_e, val) => handleChange(param.name, val)}
        />
      )}
    </Box>
  );
}
