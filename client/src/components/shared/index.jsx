import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useCountdown } from '../../hooks/useTimer';
import { getSocket } from '../../hooks/useSocket';
import { useRandomMeme } from '../../hooks/useRandomMeme';

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
        <ThemeToggle />
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

// ── Theme Toggle ───────────────────────────────────────────────────
const THEME_KEY = 'dominance_theme';
export function getStoredTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
export function ThemeToggle() {
  const [theme, setTheme] = useState(getStoredTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button className="theme-toggle" onClick={toggle} title="Toggle light/dark theme">
      {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
    </button>
  );
}

// ── Random Engineering Meme Popup ───────────────────────────────────
// Ambient comic relief during dead time — never during a timed question or
// Phase 3 build (pass enabled: false there). Same Hinglish CS-humor voice
// as the Thank You page's closing joke, just lighter and more frequent.
export function MemePopup({ enabled = true }) {
  const { current, dismiss } = useRandomMeme({ enabled });
  if (!current) return null;
  return (
    <div className="meme-popup" role="status">
      <div className="meme-popup-label">// MEME.js</div>
      {current.setup && <div className="meme-popup-setup">{current.setup}</div>}
      <div className="meme-popup-line">{current.punchline || current.line}</div>
      <button className="meme-popup-close" onClick={dismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

// ── Need Help Button ──────────────────────────────────────────────
// Pings admin/floaters in real time with the team's name and current phase.
// Rate-limited server-side to one call per 15s per socket.
export function HelpButton({ teamId, teamName, phase }) {
  const { addToast } = useApp();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const send = () => {
    if (cooldown > 0) return;
    getSocket().emit('team:help_request', { team_id: teamId, message: message.trim() });
    addToast({ message: '🆘 Help request sent — a coordinator is on the way.', type: 'warning' });
    setMessage(''); setOpen(false);
    setCooldown(15);
    const iv = setInterval(() => setCooldown(c => { if (c <= 1) { clearInterval(iv); return 0; } return c - 1; }), 1000);
  };

  return (
    <>
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:499 }} onClick={()=>setOpen(false)}>
          <div className="card card-lg" onClick={e=>e.stopPropagation()} style={{
            position:'fixed', bottom:90, right:20, width:280, border:'1px solid var(--warning)', zIndex:500,
          }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:15, color:'var(--warning)', marginBottom:8 }}>🆘 Request Help</div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={2} placeholder="What's wrong? (optional)"
              style={{ fontSize:13, marginBottom:10, width:'100%' }} autoFocus/>
            <button className="btn-warning" onClick={send} style={{ width:'100%', padding:10, fontSize:13 }}>
              Send — {teamName} needs help
            </button>
          </div>
        </div>
      )}
      <button className="help-fab" onClick={()=>setOpen(o=>!o)} disabled={cooldown>0}>
        🆘 {cooldown>0 ? `Sent (${cooldown}s)` : 'Need Help'}
      </button>
    </>
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
