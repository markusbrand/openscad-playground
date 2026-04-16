import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import debug from 'debug';
import { useTranslation } from 'react-i18next';
import { ApiKeyInfo, getApiKeys, setApiKey, deleteApiKey } from '../services/api';

const log = debug('app:settings');

interface ProviderConfig {
  id: string;
  label: string;
  helpUrl: string;
  helpLabel: string;
  placeholder: string;
  hasEndpoint?: boolean;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    helpUrl: 'https://aistudio.google.com/apikey',
    helpLabel: 'Get Gemini API key',
    placeholder: 'AIza...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    helpUrl: 'https://platform.openai.com/api-keys',
    helpLabel: 'Get OpenAI API key',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    helpLabel: 'Get Anthropic API key',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    helpUrl: 'https://console.mistral.ai/api-keys/',
    helpLabel: 'Get Mistral API key',
    placeholder: 'M...',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    helpUrl: 'https://ollama.ai/',
    helpLabel: 'Install Ollama',
    placeholder: 'Not required for local Ollama',
    hasEndpoint: true,
  },
];

interface ProviderTabProps {
  provider: ProviderConfig;
  keyInfo?: ApiKeyInfo;
  onSave: (provider: string, key: string) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
}

function ProviderTab({ provider, keyInfo, onSave, onDelete }: ProviderTabProps) {
  const { t } = useTranslation();
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [endpointValue, setEndpointValue] = useState('http://localhost:11434');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = keyInfo?.configured ?? false;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const keyToSave = provider.hasEndpoint
        ? `endpoint:${endpointValue}`
        : apiKeyValue;
      await onSave(provider.id, keyToSave);
      setApiKeyValue('');
    } catch (err) {
      log('Failed to save API key for %s: %O', provider.id, err);
      setError(err instanceof Error ? err.message : t('settingsDialog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      await onDelete(provider.id);
    } catch (err) {
      log('Failed to delete API key for %s: %O', provider.id, err);
      setError(err instanceof Error ? err.message : t('settingsDialog.deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          {provider.label}
        </Typography>
        <Chip
          icon={configured ? <CheckCircleIcon /> : <CancelIcon />}
          label={configured ? t('settingsDialog.configured') : t('settingsDialog.notConfigured')}
          color={configured ? 'success' : 'default'}
          size="small"
          variant="outlined"
        />
      </Box>

      {configured && keyInfo?.masked_key && (
        <Typography variant="body2" color="text.secondary">
          {t('settingsDialog.currentKey')} {keyInfo.masked_key}
        </Typography>
      )}

      {!provider.hasEndpoint ? (
        <TextField
          label={t('settingsDialog.apiKey')}
          type={showKey ? 'text' : 'password'}
          value={apiKeyValue}
          onChange={(e) => setApiKeyValue(e.target.value)}
          placeholder={provider.placeholder}
          fullWidth
          size="small"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowKey(!showKey)}
                    edge="end"
                    size="small"
                  >
                    {showKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      ) : (
        <TextField
          label={t('settingsDialog.endpointUrl')}
          value={endpointValue}
          onChange={(e) => setEndpointValue(e.target.value)}
          placeholder="http://localhost:11434"
          fullWidth
          size="small"
        />
      )}

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || (!provider.hasEndpoint && !apiKeyValue.trim())}
          size="small"
        >
          {saving ? t('settingsDialog.saving') : t('settingsDialog.save')}
        </Button>
        {configured && (
          <Button
            variant="outlined"
            color="error"
            onClick={handleDelete}
            disabled={saving}
            size="small"
          >
            {t('settingsDialog.remove')}
          </Button>
        )}
      </Box>

      <Link href={provider.helpUrl} target="_blank" rel="noopener" variant="body2">
        {provider.helpLabel}
      </Link>
    </Box>
  );
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [keyInfos, setKeyInfos] = useState<ApiKeyInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const keys = await getApiKeys();
      setKeyInfos(keys);
      setLoadError(null);
    } catch (err) {
      log('Failed to load API keys: %O', err);
      setLoadError(
        err instanceof Error ? err.message : t('settingsDialog.loadKeysFailed'),
      );
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      loadKeys();
    }
  }, [open, loadKeys]);

  const handleSave = async (provider: string, key: string) => {
    await setApiKey(provider, key);
    await loadKeys();
  };

  const handleDelete = async (provider: string) => {
    await deleteApiKey(provider);
    await loadKeys();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('settingsDialog.title')}</DialogTitle>
      <DialogContent>
        {loadError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}

        <Tabs
          value={activeTab}
          onChange={(_e, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {PROVIDERS.map((p) => {
            const info = keyInfos.find((k) => k.provider === p.id);
            return (
              <Tab
                key={p.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {p.label}
                    {info?.configured && (
                      <CheckCircleIcon color="success" sx={{ fontSize: 14 }} />
                    )}
                  </Box>
                }
              />
            );
          })}
        </Tabs>

        {PROVIDERS.map((provider, index) => (
          <Box
            key={provider.id}
            role="tabpanel"
            hidden={activeTab !== index}
          >
            {activeTab === index && (
              <ProviderTab
                provider={provider}
                keyInfo={keyInfos.find((k) => k.provider === provider.id)}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            )}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('settingsDialog.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
