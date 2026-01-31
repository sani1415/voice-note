import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import AppComponent from './App';

// When loading from a URL (CAPACITOR_SERVER_URL), reload the page when the app
// comes back to the foreground so users see the latest deploy without fully closing the app.
if (Capacitor.isNativePlatform()) {
  let hasBeenInBackground = false;
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      hasBeenInBackground = true;
      return;
    }
    if (!hasBeenInBackground) return;
    hasBeenInBackground = false;
    const { protocol, hostname } = window.location;
    const isRemoteUrl = protocol === 'https:' && hostname !== 'localhost';
    if (isRemoteUrl) window.location.reload();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AppComponent />
  </React.StrictMode>
);
