import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AnnouncementOverlay } from './components/shared/Announcement.jsx';
import { MasterPauseOverlay } from './components/shared/MasterPause.jsx';
import JoinTeam from './pages/JoinTeam';
import SelfRegister from './pages/SelfRegister';
import TeamDashboard from './pages/TeamDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Spectator from './pages/Spectator';
import ZoneOperator from './pages/ZoneOperator';
import ThankYou from './pages/ThankYou';
import Guide from './pages/Guide';
import './styles/index.css';

// Shows on every screen when the socket drops — event WiFi is flaky, and a
// silent disconnect otherwise looks identical to "everything is fine".
function ConnectionBanner() {
  const { state } = useApp();
  if (state.connected) return null;
  return <div className="conn-banner">⚠ Reconnecting to server...</div>;
}

// BUG FIX: once the admin sent everyone to the Thank You page (event truly
// over), a participant could just edit the URL back to /team/:id or /
// and keep using the app as if nothing had ended — there was nothing
// actually enforcing "the event is over" beyond the page you happened to
// be on when the broadcast arrived. This redirects any non-admin route
// back to /thankyou for the rest of the browser session once that
// broadcast has fired. Admin stays exempt — they still need Backup/
// Analytics/Archive access after the event ends.
function ThankYouGuard() {
  const { state } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  // state.app_state.thankyou_shown is persisted server-side and arrives on
  // every state:sync (including after a hard reload); state.showThankYou
  // is the ephemeral live broadcast for tabs already open when it fires.
  // Checking both covers "already on the page" and "just reloaded".
  const thankYouActive = state.showThankYou || state.app_state?.thankyou_shown;

  useEffect(() => {
    const isAdmin = location.pathname === '/admin';
    if (thankYouActive && location.pathname !== '/thankyou' && !isAdmin) {
      navigate('/thankyou', { replace: true });
    }
  }, [thankYouActive, location.pathname]);

  return null;
}

// Root layout wraps AnnouncementOverlay so it shows on EVERY page
function RootLayout({ children }) {
  return (
    <>
      <ConnectionBanner />
      <ThankYouGuard />
      <AnnouncementOverlay />
      <MasterPauseOverlay />
      {children}
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <RootLayout>
          <Routes>
            <Route path="/" element={<JoinTeam />} />
            <Route path="/register" element={<SelfRegister />} />
            <Route path="/team/:teamId" element={<TeamDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/spectator" element={<Spectator />} />
            <Route path="/zone/:zoneId" element={<ZoneOperator />} />
            <Route path="/thankyou" element={<ThankYou />} />
            <Route path="/guide" element={<Guide />} />
          </Routes>
        </RootLayout>
      </BrowserRouter>
    </AppProvider>
  );
}
