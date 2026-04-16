import React from 'react';
import { Alert, Button, Snackbar } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Prompts when a new service worker is ready (`registerType: 'prompt'` in vite-plugin-pwa).
 * Registration runs via `useRegisterSW` (not `virtual:pwa-register` in the entry bundle).
 */
export default function PwaUpdateSnackbar() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration failed:', error);
    },
  });

  const handleReload = () => {
    void updateServiceWorker(true);
  };

  const handleDismissUpdate = () => {
    setNeedRefresh(false);
  };

  const handleDismissOffline = () => {
    setOfflineReady(false);
  };

  if (needRefresh) {
    return (
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 72, sm: 24 } }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={handleDismissUpdate}
          sx={{ alignItems: 'center', width: '100%', maxWidth: 480 }}
          action={
            <Button color="inherit" size="small" variant="text" onClick={handleReload}>
              Reload
            </Button>
          }
        >
          A new version of the app is available.
        </Alert>
      </Snackbar>
    );
  }

  if (offlineReady) {
    return (
      <Snackbar
        open
        autoHideDuration={6000}
        onClose={handleDismissOffline}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 72, sm: 24 } }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={handleDismissOffline}
          sx={{ width: '100%', maxWidth: 420 }}
        >
          Content cached — you can use this page offline.
        </Alert>
      </Snackbar>
    );
  }

  return null;
}
