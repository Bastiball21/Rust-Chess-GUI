import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Mock Tauri invoke for Playwright environment
// @ts-ignore
if (!window.__TAURI_INTERNALS__) {
    // @ts-ignore
    window.__TAURI_INTERNALS__ = {};
    // @ts-ignore
    window.__TAURI_IPC__ = (message) => {
        console.log('IPC Message:', message);
        // Simulate response for invoke
        if (message.cmd === 'invoke') {
             // Mock query_engine_options
             if (message.payload?.cmd === 'query_engine_options') {
                 // Return promise resolving to sample options
                 return Promise.resolve([
                     { name: 'Hash', option_type: 'spin', default: '16', min: 1, max: 1024, var: [] },
                     { name: 'Threads', option_type: 'spin', default: '1', min: 1, max: 64, var: [] },
                     { name: 'Style', option_type: 'combo', default: 'Normal', min: null, max: null, var: ['Normal', 'Aggressive', 'Solid'] }
                 ]);
             }
        }
    };
    // Mock window.__TAURI__.invoke which is usually what @tauri-apps/api/core uses
    // But since we use @tauri-apps/api/core, it might try to use internals.
    // The easiest way is to mock the module if possible, or just catch the error.
    // However, for React visual testing, as long as we don't crash on load, we are good.
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
