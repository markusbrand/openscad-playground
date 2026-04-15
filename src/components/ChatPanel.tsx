import React, { CSSProperties, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import BugReportIcon from '@mui/icons-material/BugReport';
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

function CodeBlock({ code, onApply }: { code: string; onApply: () => void }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box sx={{ position: 'relative', my: 1 }}>
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        px: 1.5,
        py: 0.5,
        bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}>
        <Typography variant="caption" color="text.secondary">OpenSCAD</Typography>
        <Box>
          <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Apply to editor">
            <IconButton size="small" onClick={onApply} color="primary">
              <SmartToyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          overflow: 'auto',
          maxHeight: 300,
          fontSize: '0.8rem',
          fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {code}
      </Box>
    </Box>
  );
}

function MessageContent({ text, onApplyCode }: { text: string; onApplyCode: (code: string) => void }) {
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(?:openscad|scad)?\s*\n?([\s\S]*?)\n?```$/);
        if (codeMatch) {
          const code = codeMatch[1].trim();
          return <CodeBlock key={i} code={code} onApply={() => onApplyCode(code)} />;
        }
        if (part.trim()) {
          return (
            <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {part}
            </Typography>
          );
        }
        return null;
      })}
    </>
  );
}

export default function ChatPanel({ className, style }: { className?: string; style?: CSSProperties }) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini/gemini-2.5-flash');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autodebugRunning, setAutodebugRunning] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadModels = async () => {
    try {
      const models = await getModels();
      setAvailableModels(models);
      if (models.length > 0 && !models.find(m => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }
    } catch (err) {
      log('Failed to load models: %O', err);
    }
  };

  const applyCodeToEditor = useCallback((code: string) => {
    model.source = code;
    model.render({ isPreview: true, now: true });
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

    const apiMessages: ApiChatMessage[] = [
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: trimmed },
    ];

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let fullContent = '';
      let extractedCode: string | undefined;

      for await (const event of streamChat(
        apiMessages,
        selectedModel,
        uploadedFiles.length > 0 ? uploadedFiles : undefined,
        abortController.signal,
      )) {
        if (event.token) {
          fullContent += event.token;
          setMessages(prev => prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: fullContent }
              : m
          ));
        }

        if (event.done) {
          if (event.full_response) fullContent = event.full_response;
          if (event.code) extractedCode = event.code;
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMessage.id
          ? { ...m, content: fullContent, code: extractedCode, isStreaming: false }
          : m
      ));

      if (extractedCode) {
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
          extractedCode,
          selectedModel,
          (status) => addSystemMessage(`\u{1F527} ${status}`),
        );

        if (result.success) {
          addSystemMessage('\u{2705} Model compiled and rendered successfully.');
        } else {
          addSystemMessage(
            `\u{274C} Auto-debug failed after retries.\n\n**Error:**\n\`\`\`\n${result.error}\n\`\`\``,
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
        setError(errorMsg);
        setMessages(prev => prev.filter(m => m.id !== assistantMessage.id));
      }
    } finally {
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
        content: `**Auto-debug** (confidence: ${result.confidence})\n\n${result.explanation}\n\n\`\`\`openscad\n${result.fixed_code}\n\`\`\``,
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
      </Box>

      {/* Messages area */}
      <Box sx={{
        flex: 1,
        overflow: 'auto',
        px: 1,
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}>
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
                  <MessageContent text={msg.content} onApplyCode={applyCodeToEditor} />
                )}

                {msg.isStreaming && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <CircularProgress size={12} />
                    <Typography variant="caption" color="text.secondary">
                      thinking...
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
    </Box>
  );
}
