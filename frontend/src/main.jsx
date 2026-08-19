import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import { AuthGateProvider } from './context/AuthGateProvider.jsx';
import ThemeProvider from './context/ThemeProvider.jsx';
import ToastProvider from './context/ToastProvider.jsx';
import LiveProvider from './context/LiveProvider.jsx';
import CallProvider from './context/CallProvider.jsx';
import SocketProvider from './socket/SocketProvider.jsx';
import CallOverlay from './components/call/CallOverlay.jsx';
import './index.css';

// Order matters: the socket needs the session, and the live counters and
// calls both need the socket. CallOverlay sits beside <App/>, not inside a
// route, so a ring or an active call survives navigating between pages
// rather than belonging to whichever screen happened to start it.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <ToastProvider>
              <LiveProvider>
                <CallProvider>
                  <AuthGateProvider>
                    <App />
                  </AuthGateProvider>
                  <CallOverlay />
                </CallProvider>
              </LiveProvider>
            </ToastProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
