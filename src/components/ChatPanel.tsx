import React, { CSSProperties, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import StopIcon from '@mui/icons-material/Stop';
import CloseIcon from '@mui/icons-material/Close';
import BugReportIcon from '@mui/icons-material/BugReport';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import debug from 'debug';
import { v4 as uuidv4 } from 'uuid';
import { ModelContext } from './contexts';
import {
  ChatMessage as ApiChatMessage,
  ModelInfo,
  StreamEvent,
  UploadedFile,
  autodebug,
  getModels,
  streamChat,
} from '../services/api';
import SettingsDialog from './SettingsDialog';

const log = debug('app:chat');

const ACCEPTED_FILE_TYPES = '.stl,.scad,.png,.jpg,.jpeg';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  code?: string;
  timestamp: Date;
  isStreaming?: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Remove all ``` … ``` blocks so chat never shows fenced code. */
function stripMarkdownCodeBlocks(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SCAD_MARKERS = [
  'module ',
  'difference(',
  'union(',
  'intersection(',
  'translate(',
  'rotate(',
  'scale(',
  'linear_extrude',
  'rotate_extrude',
  'hull(',
  'minkowski(',
  'cube(',
  'sphere(',
  'cylinder(',
  'polygon(',
  'polyhedron(',
  'circle(',
  'square(',
  'text(',
  '$fn',
  '$fa',
  '$fs',
  'include <',
  'use <',
] as const;

function scadMarkerCount(s: string): number {
  const t = s.toLowerCase();
  return SCAD_MARKERS.filter(m => t.includes(m)).length;
}

/** True if fenced or raw text is plausibly OpenSCAD (relaxed for small models). */
function looksLikeOpenScadSource(s: string): boolean {
  const t = s.trim();
  if (t.length < 20 || t.includes('```')) return false;
  const n = scadMarkerCount(t);
  if (n >= 2) return true;
  if (n >= 1 && t.length >= 35) return true;
  return false;
}

/**
 * Extract OpenSCAD from the model reply: prefer ```openscad``` / ```scad``` (longest if several),
 * then any fenced block whose body looks like SCAD, then prose + raw SCAD heuristics.
 */
function inferOpenScadCodeFromModelReply(full: string): string | undefined {
  const t = full.trim();
  if (!t) return undefined;

  const labeledRe = /```\s*(?:openscad|scad)\s*\n?([\s\S]*?)```/gi;
  let bestLabeled = '';
  let m: RegExpExecArray | null;
  while ((m = labeledRe.exec(t)) !== null) {
    const body = m[1].trim();
    if (body.length > bestLabeled.length) bestLabeled = body;
  }
  if (bestLabeled) return bestLabeled;

  const genericRe = /```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/g;
  const genericBodies: string[] = [];
  while ((m = genericRe.exec(t)) !== null) genericBodies.push(m[1].trim());
  genericBodies.sort((a, b) => b.length - a.length);
  for (const body of genericBodies) {
    if (looksLikeOpenScadSource(body)) return body;
  }

  const bareRe = /```\s*\n([\s\S]*?)```/g;
  while ((m = bareRe.exec(t)) !== null) {
    const body = m[1].trim();
    if (looksLikeOpenScadSource(body)) return body;
  }

  if (t.includes('```')) return undefined;
  const blocks = t.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const codeBlocks = blocks.filter(b => looksLikeOpenScadSource(b));
  if (codeBlocks.length) {
    return codeBlocks.reduce((a, b) => (b.length > a.length ? b : a));
  }
  if (looksLikeOpenScadSource(t)) return t;
  return undefined;
}

/** Reminder appended only to the API payload (not shown in the chat bubble). */
const EDITOR_APPLY_REMINDER =
  '\n\n(App integration: you must include exactly one ```openscad fenced block with the complete runnable script, or the editor will not update. Prose-only answers are not applied.)';

function MessageContent({ text }: { text: string }) {
  const prose = stripMarkdownCodeBlocks(text);
  if (!prose) return null;
  return (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {prose}
    </Typography>
  );
}

export default function ChatPanel({ className, style }: { className?: string; style?: CSSProperties }) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  /** Must match an id from GET /api/v1/models (default until loadModels runs). */
  const [selectedModel, setSelectedModel] = useState('gemini/gemini-2.5-flash');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autodebugRunning, setAutodebugRunning] = useState(false);
  const [newSketchDialogOpen, setNewSketchDialogOpen] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  /** Keep the message list pinned to the latest entry (runs after layout so scrollHeight is correct). */
  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(raf);
  }, [messages, error]);

  const loadModels = async () => {
    try {
      const models = await getModels();
      setAvailableModels(models);
      if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }
    } catch (err) {
      log('Failed to load models: %O', err);
      const msg = err instanceof Error ? err.message : 'Failed to load models';
      setError(
        `${msg}. Is the API running (uvicorn / python dev.py) and is the Vite dev proxy pointing at the same BACKEND_PORT?`,
      );
      console.error('[ChatPanel] getModels failed:', err);
    }
  };

  const applyCodeToEditor = useCallback((code: string) => {
    model.source = code;
    model.render({ isPreview: true, now: true });
  }, [model]);

  const handleNewSketch = useCallback(() => {
    model.source = '';
    model.render({ isPreview: true, now: true });
    setMessages([]);
    setNewSketchDialogOpen(false);
    setError(null);
  }, [model]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    setError(null);
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    const existingCode = model.source.trim();
    const contextPrefix = existingCode
      ? `[EXISTING_OPENSCAD_CODE]\n${existingCode}\n[/EXISTING_OPENSCAD_CODE]\n\n`
      : '';

    const apiMessages: ApiChatMessage[] = [
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: contextPrefix + trimmed + EDITOR_APPLY_REMINDER },
    ];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let streamPaintRaf: number | null = null;

    try {
      let fullContent = '';
      let extractedCode: string | undefined;
      let latestStreamText = '';
      const scheduleAssistantStreamPaint = () => {
        latestStreamText = fullContent;
        if (streamPaintRaf != null) return;
        streamPaintRaf = requestAnimationFrame(() => {
          streamPaintRaf = null;
          const paint = latestStreamText;
          setMessages(prev => prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: paint, isStreaming: true }
              : m,
          ));
        });
      };

      for await (const event of streamChat(
        apiMessages,
        selectedModel,
        uploadedFiles.length > 0 ? uploadedFiles : undefined,
        abortController.signal,
      )) {
        if (event.error) {
          throw new Error(event.error);
        }
        if (event.token) {
          fullContent += event.token;
          scheduleAssistantStreamPaint();
        }

        if (event.done) {
          if (event.full_response) fullContent = event.full_response;
          if (event.code) extractedCode = event.code;
        }
      }

      if (streamPaintRaf != null) {
        cancelAnimationFrame(streamPaintRaf);
        streamPaintRaf = null;
      }

      const codeToApply = extractedCode ?? inferOpenScadCodeFromModelReply(fullContent);

      const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();
      let displayText = stripMarkdownCodeBlocks(fullContent);
      if (codeToApply) {
        displayText = norm(displayText).replace(norm(codeToApply), '');
        displayText = stripMarkdownCodeBlocks(displayText).trim();
        if (!displayText || displayText.length < 8) {
          displayText = 'OpenSCAD code was applied to the editor. Open the Code tab when you want to view or edit it.';
        }
      } else {
        displayText = displayText.trim() || fullContent.trim() || '(No response text)';
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id
          ? { ...m, content: displayText, code: codeToApply, isStreaming: false }
          : m
      ));

      if (codeToApply) {
        const addSystemMessage = (text: string) => {
          const sysMsg: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, sysMsg]);
        };

        const result = await model.autoDebugAndRender(
          codeToApply,
          selectedModel,
          (status) => addSystemMessage(`\u{1F527} ${status}`),
        );

        if (result.success) {
          addSystemMessage('\u{2705} Model compiled and rendered successfully.');
        } else {
          const detail = (result.error ?? '').trim() || '(no diagnostic text)';
          addSystemMessage(
            `\u{274C} Auto-debug failed after retries.\n\nError:\n${detail}`,
          );
        }
      }

      setUploadedFiles([]);
    } catch (err) {
      if (abortController.signal.aborted) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false, content: m.content || '(cancelled)' }
            : m
        ));
      } else {
        log('Chat error: %O', err);
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[ChatPanel] stream failed:', err);
        setError(errorMsg);
        setMessages(prev => prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, isStreaming: false, content: `**Error:** ${errorMsg}` }
            : m
        ));
      }
    } finally {
      if (streamPaintRaf != null) {
        cancelAnimationFrame(streamPaintRaf);
        streamPaintRaf = null;
      }
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      try {
        const base64 = await fileToBase64(file);
        newFiles.push({
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          data_base64: base64,
        });
      } catch (err) {
        log('Failed to read file %s: %O', file.name, err);
      }
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleModelChange = (e: SelectChangeEvent) => {
    setSelectedModel(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAutodebug = async () => {
    const state = model.state;
    const errors = (state.currentRunLogs ?? [])
      .filter(([type]) => type === 'stderr')
      .map(([, text]) => text)
      .join('\n');

    if (!errors.trim()) {
      setError('No errors found in the current build log.');
      return;
    }

    setAutodebugRunning(true);
    setError(null);

    try {
      const result = await autodebug({
        code: model.source,
        errors,
        model: selectedModel,
        attempt: 1,
      });

      const msg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `**Auto-debug** (confidence: ${result.confidence})\n\n${result.explanation}\n\n(Fixed code was applied to the editor.)`,
        code: result.fixed_code,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, msg]);
      applyCodeToEditor(result.fixed_code);
    } catch (err) {
      log('Autodebug error: %O', err);
      setError(err instanceof Error ? err.message : 'Autodebug failed');
    } finally {
      setAutodebugRunning(false);
    }
  };

  const hasErrors = (model.state.currentRunLogs ?? []).some(([type]) => type === 'stderr');

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Toolbar */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}>
        <Select
          value={selectedModel}
          onChange={handleModelChange}
          size="small"
          sx={{ flex: 1, minWidth: 0 }}
          displayEmpty
        >
          {availableModels.length === 0 && (
            <MenuItem value={selectedModel}>
              <Typography variant="body2" noWrap>{selectedModel}</Typography>
            </MenuItem>
          )}
          {availableModels.map((m) => (
            <MenuItem key={m.id} value={m.id}>
              <Typography variant="body2" noWrap>{m.name}</Typography>
            </MenuItem>
          ))}
        </Select>

        <Tooltip title="Auto-debug current errors">
          <span>
            <IconButton
              onClick={handleAutodebug}
              disabled={!hasErrors || autodebugRunning || isStreaming}
              color={hasErrors ? 'warning' : 'default'}
              size="small"
            >
              {autodebugRunning ? <CircularProgress size={20} /> : <BugReportIcon />}
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="API key settings">
          <IconButton onClick={() => setSettingsOpen(true)} size="small">
            <SettingsIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Start a new sketch from scratch">
          <IconButton
            onClick={() => setNewSketchDialogOpen(true)}
            disabled={isStreaming}
            size="small"
            color="error"
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Messages area */}
      <Box
        ref={messagesContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 1,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.length === 0 && (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            gap: 1,
            opacity: 0.5,
          }}>
            <SmartToyIcon sx={{ fontSize: 48 }} />
            <Typography variant="body2" textAlign="center">
              Ask me to generate OpenSCAD code, or describe the 3D model you want to create.
            </Typography>
          </Box>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 1,
                ...(isUser ? { flexDirection: 'row-reverse' } : {}),
              }}
            >
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: isUser
                    ? theme.palette.primary.main
                    : theme.palette.grey[600],
                  mt: 0.5,
                }}
              >
                {isUser
                  ? <PersonIcon sx={{ fontSize: 18 }} />
                  : <SmartToyIcon sx={{ fontSize: 18 }} />
                }
              </Avatar>

              <Paper
                elevation={1}
                sx={{
                  maxWidth: '80%',
                  px: 1.5,
                  py: 1,
                  bgcolor: isUser
                    ? theme.palette.primary.main
                    : theme.palette.mode === 'dark'
                      ? 'grey.800'
                      : 'grey.100',
                  color: isUser
                    ? theme.palette.primary.contrastText
                    : theme.palette.text.primary,
                  borderRadius: 2,
                  ...(isUser
                    ? { borderTopRightRadius: 4 }
                    : { borderTopLeftRadius: 4 }
                  ),
                }}
              >
                {isUser ? (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </Typography>
                ) : (
                  <MessageContent text={msg.content} />
                )}

                {msg.isStreaming && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <CircularProgress size={12} />
                    <Typography variant="caption" color="text.secondary">
                      Generating response…
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Box>
          );
        })}

        <div ref={messagesEndRef} />
      </Box>

      {/* Error display */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ mx: 1 }}
        >
          {error}
        </Alert>
      )}

      {/* Uploaded files chips */}
      {uploadedFiles.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 1, pt: 0.5 }}>
          {uploadedFiles.map((file, i) => (
            <Chip
              key={i}
              label={file.name}
              size="small"
              onDelete={() => handleRemoveFile(i)}
              deleteIcon={<CloseIcon />}
            />
          ))}
        </Box>
      )}

      {/* Input area */}
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 0.5,
        p: 1,
        borderTop: 1,
        borderColor: 'divider',
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          hidden
          onChange={handleFileUpload}
        />

        <Tooltip title="Attach files (.stl, .scad, .png, .jpg)">
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            size="small"
          >
            <AttachFileIcon />
          </IconButton>
        </Tooltip>

        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your 3D model..."
          multiline
          maxRows={6}
          fullWidth
          size="small"
          disabled={isStreaming}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
        />

        {isStreaming ? (
          <Tooltip title="Stop generation">
            <IconButton onClick={handleStop} color="error" size="small">
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Send message (Enter)">
            <span>
              <IconButton
                onClick={handleSend}
                disabled={!input.trim()}
                color="primary"
                size="small"
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Dialog
        open={newSketchDialogOpen}
        onClose={() => setNewSketchDialogOpen(false)}
      >
        <DialogTitle>New Sketch</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will clear the editor and the entire chat history. You will lose
            the current model and conversation. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewSketchDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleNewSketch} color="error" variant="contained">
            Delete &amp; Start Fresh
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
