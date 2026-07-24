import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../hooks/useSocket';
import { useApp } from '../context/AppContext';
import { ThemeToggle } from '../components/shared/index.jsx';

export default function JoinTeam() {
  const { state } = useApp();
  const eventName = state.app_state?.event_config?.event_name || 'CODE SPRINT 2.0';
  const collegeName = state.app_state?.event_config?.college_name || '· By REBOOT CLUB TEAM';
  const [passcode, setPasscode] = useState('');
  const [teamPreview, setTeamPreview] = useState(null); // { id, name, color, year }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.showThankYou) navigate('/thankyou');
  }, [state.showThankYou]);

  // Step 1: Look up team by passcode
  const handleLookup = async () => {
    if (passcode.length < 4) { setError('Enter your 4-digit passcode'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/team-by-passcode/${passcode}`);
      if (!res.ok) { setError('Invalid passcode — check with your coordinator'); setLoading(false); return; }
      const team = await res.json();
      setTeamPreview(team);
    } catch {
      setError('Connection error. Try again.');
    }
    setLoading(false);
  };

  // Step 2: Confirm and join via socket
  const handleConfirm = () => {
    if (!teamPreview) return;
    setConfirming(true); setError('');
    const socket = getSocket();
    socket.emit('team:join', { team_id: teamPreview.id, passcode });
    const onJoined = ({ team }) => {
      socket.off('team:joined', onJoined); socket.off('error', onErr);
      sessionStorage.setItem('team_id', team.id);
      sessionStorage.setItem('team_passcode', team.passcode);
      navigate(`/team/${team.id}`);
    };
    const onErr = ({ message }) => {
      socket.off('team:joined', onJoined); socket.off('error', onErr);
      setError(message); setConfirming(false);
    };
    socket.once('team:joined', onJoined);
    socket.once('error', onErr);
  };

  const handleReset = () => {
    setTeamPreview(null); setPasscode(''); setError('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}><ThemeToggle /></div>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', animation: 'glitch 4s infinite' }}>
            {eventName}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 8, letterSpacing: '0.2em' }}>
            {collegeName}
          </div>
        </div>

        <div className="card card-lg">
          <h2 style={{ fontSize: 18, marginBottom: 20 }}>Join Your Team</h2>

          {!teamPreview ? (
            // ── Step 1: Enter passcode ───────────────────────────
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Team Passcode
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="4-digit code"
                  value={passcode}
                  onChange={e => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  onKeyDown={e => e.key === 'Enter' && handleLookup()}
                  maxLength={4}
                  style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 36, letterSpacing: '0.5em', width: '100%' }}
                  autoFocus
                />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
                  Ask your team coordinator for the code
                </div>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</div>}
              <button className="btn-primary" onClick={handleLookup} disabled={loading || passcode.length < 4} style={{ width: '100%', padding: '14px', fontSize: 16 }}>
                {loading ? 'Looking up...' : 'Find My Team →'}
              </button>
            </>
          ) : (
            // ── Step 2: Confirm team ─────────────────────────────
            <>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase' }}>
                  You are joining
                </div>
                <div style={{
                  padding: '20px 24px',
                  borderRadius: 10,
                  border: `2px solid ${teamPreview.color}`,
                  background: `${teamPreview.color}11`,
                  marginBottom: 16,
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: teamPreview.color, letterSpacing: '0.05em' }}>
                    {teamPreview.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                    {teamPreview.year} Year
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>
                  Passcode: <span style={{ color: 'var(--accent)', letterSpacing: '0.3em' }}>{passcode}</span>
                </div>
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleReset} style={{
                  flex: 1, padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13,
                }}>
                  ← Change
                </button>
                <button className="btn-primary" onClick={handleConfirm} disabled={confirming} style={{ flex: 2, padding: '12px', fontSize: 15 }}>
                  {confirming ? 'Joining...' : 'Enter the Arena →'}
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/guide" style={{ color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>HOW IT WORKS</a>
          <a href="/spectator" style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>VIEW LEADERBOARD</a>
          <a href="/admin" style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>ADMIN</a>
        </div>
      </div>
    </div>
  );
}
