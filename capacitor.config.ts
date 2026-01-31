/// <reference types="@capawesome/capacitor-live-update" />
import type { CapacitorConfig } from '@capacitor/cli';

// When set, the app loads from this URL instead of the local bundle.
// Same native feel (no URL bar); users get updates when you deploy the site.
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.swarolipi.ai',
  appName: 'Swarolipi AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    ...(serverUrl ? { url: serverUrl } : {}),
  },
  plugins: {
    LiveUpdate: {
      readyTimeout: 10000,
    },
  },
};

export default config;
