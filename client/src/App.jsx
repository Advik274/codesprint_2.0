import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { AnnouncementOverlay } from './components/shared/Announcement.jsx';
import { MasterPauseOverlay } from './components/shared/MasterPause.jsx';
import JoinTeam from './pages/JoinTeam';
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

// Root layout wraps AnnouncementOverlay so it shows on EVERY page
function RootLayout({ children }) {
  return (
    <>
      <ConnectionBanner />
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
