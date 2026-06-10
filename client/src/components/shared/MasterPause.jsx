import { useApp } from '../../context/AppContext';
import { useLocation } from 'react-router-dom';

// Full-screen freeze overlay shown on ALL screens (except admin) when master_paused = true
export function MasterPauseOverlay() {
  const { state } = useApp();
  const location = useLocation();

  // Admin can still operate during pause — don't block them
  if (location.pathname === '/admin') return null;
  if (!state.app_state.master_paused) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.93)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 72, marginBottom: 20, animation: 'pulse-accent 2s infinite', color: 'var(--warning)' }}>⏸</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--warning)', letterSpacing: '0.1em', marginBottom: 16 }}>
          EVENT PAUSED
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--text2)', marginBottom: 8 }}>
          {state.app_state.master_pause_reason || 'Technical issue — please stand by'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text3)' }}>
          The event will resume shortly. Do not close this page.
        </div>
      </div>
    </div>
  );
}
