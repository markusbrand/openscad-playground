import chroma from 'chroma-js';
import React, { useContext, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import { ModelContext } from './contexts.ts';

export default function MultimaterialColorsDialog() {
    const model = useContext(ModelContext);
    if (!model) throw new Error('No model');
    const state = model.state;

    const [tempExtruderColors, setTempExtruderColors] = useState<string[]>(state.params.extruderColors ?? []);

    function setColor(index: number, color: string) {
        setTempExtruderColors(tempExtruderColors.map((c, i) => i === index ? color : c));
    }
    function removeColor(index: number) {
        setTempExtruderColors(tempExtruderColors.filter((_c, i) => i !== index));
    }
    function addColor() {
        setTempExtruderColors([...tempExtruderColors, '']);
    }

    const cancelExtruderPicker = () => {
        setTempExtruderColors(state.params.extruderColors ?? []);
        model!.mutate(s => s.view.extruderPickerVisibility = undefined);
    };
    const canAddColor = !tempExtruderColors.some(c => c.trim() === '');
    
    return (
        <Dialog 
            open={!!state.view.extruderPickerVisibility} 
            onClose={cancelExtruderPicker}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>Multimaterial Color Picker</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        To print on a multimaterial printer using PrusaSlicer, BambuSlicer or OrcaSlicer, we map the model's colors to the closest match in the list of extruder colors.
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Please define the colors of your extruders below.
                    </Typography>
                    
                    <Box sx={{ p: 2, width: '100%' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {tempExtruderColors.map((color, index) => (
                                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <input
                                        type="color"
                                        value={chroma.valid(color) ? chroma(color).hex() : '#000000'}
                                        onChange={(e) => setColor(index, chroma(e.target.value).name())}
                                        style={{
                                            width: 40,
                                            height: 40,
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            borderRadius: 4,
                                        }}
                                    />
                                    <TextField
                                        size="small"
                                        value={color}
                                        autoFocus={color === ''}
                                        error={color.trim() === '' || !chroma.valid(color)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && canAddColor) {
                                                e.preventDefault();
                                                addColor();
                                            }
                                        }}
                                        onChange={(e) => {
                                            let newColor = e.target.value.trim();
                                            try {
                                                newColor = chroma(newColor).name();
                                                console.log(`color: ${e.target.value} -> ${newColor}`);
                                            } catch (err) {
                                                console.error(err);
                                            }
                                            setColor(index, newColor);
                                        }}
                                        sx={{ flex: 1 }}
                                    />
                                    <IconButton
                                        color="error"
                                        size="small"
                                        onClick={() => removeColor(index)}
                                    >
                                        <CloseIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ))}
                            <Box>
                                <Button
                                    disabled={!canAddColor}
                                    startIcon={<AddIcon />}
                                    size="small"
                                    onClick={addColor}
                                >
                                    Add Color
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={cancelExtruderPicker}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    disabled={!tempExtruderColors.every(c => chroma.valid(c) || c.trim() === '')}
                    onClick={() => {
                        const wasExporting = state.view.extruderPickerVisibility === 'exporting';
                        model!.mutate(s => {
                            s.params.extruderColors = tempExtruderColors.filter(c => c.trim() !== '');
                            s.view.extruderPickerVisibility = undefined;
                        });
                        if (wasExporting) {
                            model!.export();
                        }
                    }}
                >
                    {state.view.extruderPickerVisibility == 'exporting' ? 'Export' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
