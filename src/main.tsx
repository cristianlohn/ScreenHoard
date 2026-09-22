import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import { RecorderOverlay } from './components/RecorderOverlay';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento root não encontrado no documento.');
}

const Root: React.FC = () => {
  const [isOverlay, setIsOverlay] = useState(false);

  useEffect(() => {
    try {
      if (getCurrentWindow().label === 'recorder_overlay') {
        setIsOverlay(true);
      }
    } catch {}
  }, []);

  if (isOverlay) {
    return <RecorderOverlay />;
  }

  return <App />;
};

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
