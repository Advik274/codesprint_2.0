import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AnnouncementOverlay } from './components/shared/Announcement.jsx';
import { MasterPauseOverlay } from './components/shared/MasterPause.jsx';
import JoinTeam from './pages/JoinTeam';
import TeamDashboard from './pages/TeamDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Spectator from './pages/Spectator';
import ZoneOperator from './pages/ZoneOperator';
import ThankYou from './pages/ThankYou';
import './styles/index.css';

// Root layout wraps AnnouncementOverlay so it shows on EVERY page
function RootLayout({ children }) {
  return (
    <>
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
          </Routes>
        </RootLayout>
      </BrowserRouter>
    </AppProvider>
  );
}
