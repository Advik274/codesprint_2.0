import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../hooks/useSocket';
import { useApp } from '../context/AppContext';
import { ThemeToggle } from '../components/shared/index.jsx';

// ── Self-registration (/register) ─────────────────────────────────
// Where the registration QR points. A team leader fills this in once on
// their own phone; the team is created server-side with an auto passcode
// which the whole team then uses to join. Admin registration in the
// Setup tab is unchanged — this is an extra door into the same room.
const MAX_MEMBERS = 6;
const YEARS = ['1st', '2nd', '3rd', '4th'];

export default function SelfRegister() {
  const { state } = useApp();
  const navigate = useNavigate();
  const cfg = state.app_state?.event_config;
  const eventName = cfg?.event_name || 'DOMINANCE';
  const collegeName = cfg?.college_name || '';
  const isOpen = !!cfg?.self_registration;

  const [name, setName] = useState('');
  const [year, setYear] = useState('1st');
  const [members, setMembers] = useState(['', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // { id, name, color, year, passcode }
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (state.showThankYou) navigate('/thankyou');
  }, [state.showThankYou]);

  useEffect(() => {
    const socket = getSocket();
    const onResult = (d) => {
      setSubmitting(false);
      if (d.ok) { setCreated(d.team); setError(''); }
      else setError(d.message || 'Could not register — try again.');
    };
    socket.on('team:self_register_result', onResult);
    return () => socket.off('team:self_register_result', onResult);
  }, []);

  const setMember = (i, v) => setMembers(m => m.map((x, idx) => (idx === i ? v : x)));
  const addMember = () => setMembers(m => (m.length < MAX_MEMBERS ? [...m, ''] : m));
  const removeMember = (i) => setMembers(m => (m.length > 1 ? m.filter((_, idx) => idx !== i) : m));

  const filledMembers = members.map(m => m.trim()).filter(Boolean);
  const canSubmit = name.trim().length >= 2 && filledMembers.length >= 1 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    setSubmitting(true); setError('');
    getSocket().emit('team:self_register', { name, year, members });
    setTimeout(() => setSubmitting(false), 6000); // never leave the button stuck
  };

  // Same handshake the join page uses — binds this socket to the team
  const enterArena = () => {
    if (!created) return;
    setJoining(true);
    const socket = getSocket();
    const onJoined = ({ team }) => {
      socket.off('team:joined', onJoined); socket.off('error', onErr);
      sessionStorage.setItem('team_id', team.id);
      sessionStorage.setItem('team_passcode', team.passcode);
      sessionStorage.setItem('team_members', JSON.stringify(team.members || []));
      navigate(`/team/${team.id}`);
    };
    const onErr = ({ message }) => {
      socket.off('team:joined', onJoined); socket.off('error', onErr);
      setError(message || 'Could not join — use your passcode on the join page.');
      setJoining(false);
    };
    socket.once('team:joined', onJoined);
    socket.once('error', onErr);
    socket.emit('team:join', { team_id: created.id, passcode: created.passcode });
  };

  const shell = (children) => (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}><ThemeToggle /></div>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 8vw, 46px)', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
            {eventName}
          </div>
          {collegeName && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 8, letterSpacing: '0.2em' }}>{collegeName}</div>
          )}
        </div>
        {children}
        <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/" style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>ALREADY REGISTERED?</a>
          <a href="/guide" style={{ color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>HOW IT WORKS</a>
        </div>
      </div>
    </div>
  );

  // ── Registration closed ─────────────────────────────────────────
  if (!isOpen && !created) {
    return shell(
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔒</div>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Registration Closed</h2>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
          Self-registration isn't open right now. See a coordinator at the registration desk — they can add your team and give you a passcode.
        </div>
      </div>
    );
  }

  // ── Success: show the passcode ──────────────────────────────────
  if (created) {
    return shell(
      <div className="card card-lg" style={{ textAlign: 'center', border: `2px solid ${created.color}` }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.2em', marginBottom: 6 }}>YOU'RE REGISTERED</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: created.color, marginBottom: 4 }}>{created.name}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginBottom: 22 }}>{created.year} Year · {filledMembers.length} member{filledMembers.length !== 1 ? 's' : ''}</div>

        <div style={{ padding: '18px 16px', borderRadius: 10, background: 'var(--bg3)', border: '1px dashed var(--border2)', marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.2em', marginBottom: 6 }}>YOUR TEAM PASSCODE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 44, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.35em', lineHeight: 1.1 }}>
            {created.passcode}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>
            📸 <strong>Screenshot this.</strong> Every member enters this code on the join page to get in.
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button className="btn-primary" onClick={enterArena} disabled={joining} style={{ width: '100%', padding: 14, fontSize: 15 }}>
          {joining ? 'Joining...' : 'Enter the Arena →'}
        </button>
        <a href="/" style={{ display: 'block', marginTop: 12, color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
          or hand the phone to a teammate to join with the code
        </a>
      </div>
    );
  }

  // ── The form ────────────────────────────────────────────────────
  return shell(
    <div className="card card-lg">
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Register Your Team</h2>
      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 20, lineHeight: 1.5 }}>
        One person fills this in for the whole team. You'll get a passcode the others use to join.
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>
          Team Name *
        </label>
        <input
          type="text" value={name} maxLength={40} autoFocus
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Byte Force"
          style={{ fontSize: 16 }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>
          Year
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)} style={{
              flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 13,
              background: year === y ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg3)',
              border: `1px solid ${year === y ? 'var(--accent)' : 'var(--border)'}`,
              color: year === y ? 'var(--accent)' : 'var(--text3)',
              fontFamily: 'var(--font-mono)', textTransform: 'none', letterSpacing: 'normal',
            }}>{y}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>
          Members * <span style={{ textTransform: 'none' }}>(you first)</span>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', width: 18, flexShrink: 0 }}>{i + 1}.</span>
              <input
                type="text" value={m} maxLength={40}
                onChange={e => setMember(i, e.target.value)}
                placeholder={i === 0 ? 'Your full name (team leader)' : `Member ${i + 1} full name`}
                style={{ flex: 1 }}
              />
              {members.length > 1 && (
                <button onClick={() => removeMember(i)} title="Remove"
                  style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', cursor: 'pointer', flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
        </div>
        {members.length < MAX_MEMBERS && (
          <button onClick={addMember} className="btn-ghost" style={{ marginTop: 10, padding: '8px 14px', fontSize: 12 }}>
            + Add member
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 14, textAlign: 'center', lineHeight: 1.5 }}>{error}</div>
      )}

      <button className="btn-primary" onClick={submit} disabled={!canSubmit} style={{ width: '100%', padding: 14, fontSize: 16 }}>
        {submitting ? 'Registering...' : 'Register Team →'}
      </button>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>
        Team names must be unique · up to {MAX_MEMBERS} members
      </div>
    </div>
  );
}
