import App from './App.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import { AuthGateProvider } from './context/AuthGateProvider.jsx';
import ThemeProvider from './context/ThemeProvider.jsx';
import ToastProvider from './context/ToastProvider.jsx';
import LiveProvider from './context/LiveProvider.jsx';
import CallProvider from './context/CallProvider.jsx';
import SocketProvider from './socket/SocketProvider.jsx';
import CallOverlay from './components/call/CallOverlay.jsx';
import WakingNotice from './components/layout/WakingNotice.jsx';

/**
 * The whole app below the router.
 *
 * This lived inline in main.jsx until the routes started being prerendered to
 * static HTML. The prerender has to render the same tree the browser does, and
 * the only difference between them is the router — BrowserRouter needs a URL
 * bar, the build does not have one — so the router is supplied by the caller
 * and everything else is here, rendered once and identically by both.
 *
 * Keeping it in one place is the point: a provider added to main.jsx and not
 * to the prerender produces static HTML that renders a different app from the
 * one that hydrates over it, which React reports as a hydration mismatch a
 * long way from the cause.
 *
 * Order matters: the socket needs the session, and the live counters and
 * calls both need the socket. CallOverlay sits beside <App/>, not inside a
 * route, so a ring or an active call survives navigating between pages
 * rather than belonging to whichever screen happened to start it.
 */
const Root = () => (
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
              {/* Outside the routes, like CallOverlay: a slow API is a
                  property of the session, not of whichever screen happened to
                  make the request, and navigating must not dismiss it. */}
              <WakingNotice />
            </CallProvider>
          </LiveProvider>
        </ToastProvider>
      </SocketProvider>
    </AuthProvider>
  </ThemeProvider>
);

export default Root;
