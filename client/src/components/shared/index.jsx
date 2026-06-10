import { useApp } from '../../context/AppContext';
import { useCountdown } from '../../hooks/useTimer';

// ── Navbar ───────────────────────────────────────────────────────
export function Navbar({ title, subtitle }) {
  const { state } = useApp();
  const cfg = state.app_state?.event_config;
  const eventName = cfg?.event_name || 'CODE SPRINT 2.0';
  const collegeName = cfg?.college_name || '';
  const phase = state.app_state.current_phase;

  const phaseColors = {
    lobby: '#5a5a70',
    phase1: '#ffaa00',
    phase2: '#00ff88',
    phase3: '#00aaff',
    results: '#aa55ff',
  };

  return (
    <nav style={{
      background: 'var(--bg2)',
      borderBottom: `1px solid var(--border)`,
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)' }}>
          {eventName}
        </div>
        {collegeName && <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{collegeName}</div>}
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          padding: '4px 12px',
          borderRadius: 4,
          border: `1px solid ${phaseColors[phase]}33`,
          background: `${phaseColors[phase]}11`,
          color: phaseColors[phase],
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {phase.replace('phase', 'Phase ').toUpperCase()}
        </div>
        {title && <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>{title}</div>}
      </div>
    </nav>
  );
}

// ── Toast Container ──────────────────────────────────────────────
export function ToastContainer() {
  const { state, dispatch } = useApp();

  const typeStyles = {
    success: { bg: 'rgba(0,255,136,0.1)', border: 'rgba(0,255,136,0.4)', color: 'var(--accent)' },
    danger:  { bg: 'rgba(255,51,85,0.1)',  border: 'rgba(255,51,85,0.4)',  color: 'var(--danger)' },
    warning: { bg: 'rgba(255,170,0,0.1)',  border: 'rgba(255,170,0,0.4)',  color: 'var(--warning)' },
    info:    { bg: 'rgba(0,170,255,0.1)',  border: 'rgba(0,170,255,0.4)',  color: 'var(--info)' },
  };

  return (
    <div style={{ position: 'fixed', top: 70, right: 16, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      {state.toasts.map(toast => {
        const s = typeStyles[toast.type] || typeStyles.info;
        return (
          <div key={toast.id} className="animate-fade" style={{
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 8, padding: '12px 16px',
            color: s.color, fontFamily: 'var(--font-body)', fontSize: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            backdropFilter: 'blur(8px)',
          }}>
            <span>{toast.message}</span>
            <button onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: toast.id })}
              style={{ background: 'none', border: 'none', color: s.color, padding: '0 4px', fontSize: 16, cursor: 'pointer', minWidth: 'auto' }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Team Badge ───────────────────────────────────────────────────
export function TeamBadge({ team, size = 'md' }) {
  const sizes = { sm: { font: 11, pad: '2px 8px' }, md: { font: 13, pad: '4px 12px' }, lg: { font: 15, pad: '6px 16px' } };
  const s = sizes[size];
  return (
    <span style={{
      display: 'inline-block',
      padding: s.pad,
      borderRadius: 4,
      background: `${team.color}22`,
      border: `1px solid ${team.color}66`,
      color: team.color,
      fontFamily: 'var(--font-mono)',
      fontSize: s.font,
      fontWeight: 700,
      letterSpacing: '0.06em',
    }}>
      {team.name}
    </span>
  );
}

// ── Countdown Timer ──────────────────────────────────────────────
export function CountdownTimer({ endTime, label, paused }) {
  const timer = useCountdown(paused ? null : endTime);

  return (
    <div style={{ textAlign: 'center' }}>
      {label && <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>}
      {paused ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--warning)', letterSpacing: '0.1em' }}>
          ⏸ PAUSED
        </div>
      ) : timer ? (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28,
          fontWeight: 700,
          color: timer.isUrgent ? 'var(--danger)' : 'var(--accent)',
          letterSpacing: '0.1em',
          animation: timer.isUrgent ? 'pulse-accent 1s infinite' : 'none',
        }}>
          {timer.formatted}
        </div>
      ) : null}
    </div>
  );
}

// ── Battery Bar ──────────────────────────────────────────────────
export function BatteryBar({ battery, showLabel = true, height = 8 }) {
  const color = battery > 50 ? 'var(--accent)' : battery > 20 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>BATTERY</span>
          <span style={{ fontSize: 12, color, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{battery}%</span>
        </div>
      )}
      <div style={{ background: 'var(--bg3)', borderRadius: 4, height, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{
          height: '100%',
          width: `${battery}%`,
          background: color,
          borderRadius: 4,
          transition: 'width 0.5s ease, background 0.5s ease',
          boxShadow: `0 0 8px ${color}66`,
        }} />
      </div>
    </div>
  );
}
