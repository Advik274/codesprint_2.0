import { useState, useEffect } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { useApp } from '../../context/AppContext';
import { BatteryBar } from '../shared/index.jsx';

// ── Zone Map ─────────────────────────────────────────────────────
export function ZoneMap({ zones, teams, myTeamId, onZoneClick }) {
  const getTeamColor = (teamId) => teams.find(t => t.id === teamId)?.color || '#5a5a70';
  const getTeamName = (teamId) => teams.find(t => t.id === teamId)?.name || 'Unknown';

  return (
    <div style={{ position: 'relative', background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', aspectRatio: '4/3' }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '10% 10%',
        opacity: 0.3,
      }} />

      <div style={{ position: 'absolute', inset: 0, padding: '4%' }}>
        {zones.map(zone => {
          const owned = !!zone.owner_team_id;
          const ownerColor = owned ? getTeamColor(zone.owner_team_id) : 'var(--border2)';
          const isMyZone = zone.owner_team_id === myTeamId;
          const isEnemy = owned && !isMyZone;
          const hasFirewall = zone.firewall?.is_active;

          return (
            <button
              key={zone.id}
              onClick={() => onZoneClick(zone)}
              style={{
                position: 'absolute',
                left: `${zone.coordinates.x}%`,
                top: `${zone.coordinates.y}%`,
                transform: 'translate(-50%, -50%)',
                background: owned ? `${ownerColor}22` : 'var(--bg3)',
                border: `2px solid ${ownerColor}`,
                borderRadius: 8,
                padding: '6px 10px',
                cursor: 'pointer',
                textAlign: 'center',
                minWidth: 90,
                transition: 'all 0.2s',
                boxShadow: isMyZone ? `0 0 16px ${ownerColor}55` : 'none',
                textTransform: 'none',
                letterSpacing: 'normal',
                fontFamily: 'var(--font-body)',
              }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: ownerColor, fontWeight: 700, marginBottom: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {zone.id}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>{zone.name}</div>
              {owned && (
                <div style={{ fontSize: 9, color: ownerColor, marginTop: 2 }}>
                  {hasFirewall ? '🔒 ' : ''}{isMyZone ? 'YOURS' : getTeamName(zone.owner_team_id)}
                </div>
              )}
              {!owned && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>NEUTRAL</div>}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 12, background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>🔒 = Firewall Active</span>
      </div>
    </div>
  );
}

// ── Zone Action Modal ─────────────────────────────────────────────
export function ZoneActionModal({ zone, teams, myTeamId, onClose }) {
  const [mode, setMode] = useState(null); // 'capture' | 'firewall' | 'breach'
  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState('');
  const [firewallForm, setFirewallForm] = useState({ type: 'riddle', text: '', answer: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const socket = getSocket();
  const isMyZone = zone.owner_team_id === myTeamId;
  const isEnemy = !!zone.owner_team_id && !isMyZone;
  const isNeutral = !zone.owner_team_id;

  useEffect(() => {
    const onCapChallenge = ({ zone_id, challenge }) => {
      if (zone_id === zone.id) { setChallenge(challenge); setMode('answering_capture'); setLoading(false); }
    };
    const onFwChallenge = ({ zone_id, challenge }) => {
      if (zone_id === zone.id) { setChallenge(challenge); setMode('answering_breach'); setLoading(false); }
    };
    const onCapResult = ({ success, message: msg }) => { setMessage(msg || (success ? '✅ Zone captured! +30% battery' : '❌ Wrong answer!')); setLoading(false); };
    const onBreachResult = ({ success, message: msg }) => { setMessage(msg || (success ? '⚡ Breach successful! +30% battery' : '🔒 Firewall held!')); setLoading(false); };
    const onFwDeployed = ({ zone_id }) => { if (zone_id === zone.id) { setMessage('🔒 Firewall deployed!'); setLoading(false); } };

    socket.on('phase2:capture_challenge', onCapChallenge);
    socket.on('phase2:capture_result', onCapResult);
    socket.on('phase2:firewall_challenge', onFwChallenge);
    socket.on('phase2:breach_result', onBreachResult);
    socket.on('phase2:firewall_deployed', onFwDeployed);
    return () => {
      socket.off('phase2:capture_challenge', onCapChallenge);
      socket.off('phase2:capture_result', onCapResult);
      socket.off('phase2:firewall_challenge', onFwChallenge);
      socket.off('phase2:breach_result', onBreachResult);
      socket.off('phase2:firewall_deployed', onFwDeployed);
    };
  }, [zone.id]);

  const startCapture = () => {
    setLoading(true);
    socket.emit('phase2:capture_zone', { team_id: myTeamId, zone_id: zone.id });
  };

  const submitCapture = () => {
    if (!answer) return;
    setLoading(true);
    socket.emit('phase2:submit_capture_answer', { team_id: myTeamId, zone_id: zone.id, answer });
  };

  const startBreach = () => {
    setLoading(true);
    socket.emit('phase2:get_firewall_challenge', { zone_id: zone.id });
  };

  const submitBreach = () => {
    if (!answer) return;
    setLoading(true);
    socket.emit('phase2:attempt_breach', { attacker_team_id: myTeamId, zone_id: zone.id, answer });
  };

  const deployFirewall = () => {
    if (!firewallForm.text || !firewallForm.answer) return;
    setLoading(true);
    socket.emit('phase2:deploy_firewall', { team_id: myTeamId, zone_id: zone.id, challenge_type: firewallForm.type, challenge_text: firewallForm.text, answer: firewallForm.answer });
  };

  const ownerTeam = teams.find(t => t.id === zone.owner_team_id);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div className="card card-lg" style={{ maxWidth: 480, width: '100%', border: `1px solid ${ownerTeam?.color || 'var(--border)'}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, color: 'var(--text)' }}>{zone.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {isNeutral ? 'NEUTRAL — Uncaptured' : isMyZone ? '✅ YOUR TERRITORY' : `⚠️ OWNED BY ${ownerTeam?.name}`}
              {zone.firewall?.is_active && ' · 🔒 FIREWALL ACTIVE'}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px 12px' }}>✕</button>
        </div>

        {message && (
          <div style={{ padding: '12px 16px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 14, textAlign: 'center' }}>
            {message}
          </div>
        )}

        {!message && (
          <>
            {/* Initial actions */}
            {!mode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {isNeutral && <button className="btn-primary" onClick={startCapture} disabled={loading}>{loading ? 'Loading challenge...' : '🏴 Capture This Zone (+30% battery)'}</button>}
                {isMyZone && !zone.firewall?.is_active && <button className="btn-warning" onClick={() => setMode('deploy_firewall')}>🔒 Deploy Firewall</button>}
                {isMyZone && zone.firewall?.is_active && <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center', padding: 8 }}>Firewall is active — zone is protected</div>}
                {isEnemy && zone.firewall?.is_active && <button className="btn-danger" onClick={startBreach} disabled={loading}>{loading ? 'Loading firewall...' : '⚡ Breach Firewall'}</button>}
                {isEnemy && !zone.firewall?.is_active && <button className="btn-danger" onClick={startCapture} disabled={loading}>{loading ? 'Loading challenge...' : '⚡ Capture from Enemy'}</button>}
              </div>
            )}

            {/* Answer capture challenge */}
            {(mode === 'answering_capture' || mode === 'answering_breach') && challenge && (
              <div>
                <div className="badge badge-warning" style={{ marginBottom: 12 }}>{challenge.type}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, padding: '12px', background: 'var(--bg3)', borderRadius: 6, marginBottom: 16, lineHeight: 1.6 }}>
                  {challenge.challenge}
                </div>
                <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Your answer..." onKeyDown={e => e.key === 'Enter' && (mode === 'answering_capture' ? submitCapture() : submitBreach())} style={{ marginBottom: 12 }} autoFocus />
                <button className="btn-primary" onClick={mode === 'answering_capture' ? submitCapture : submitBreach} disabled={!answer || loading} style={{ width: '100%' }}>
                  {loading ? 'Submitting...' : 'Submit Answer'}
                </button>
              </div>
            )}

            {/* Deploy firewall */}
            {mode === 'deploy_firewall' && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>CHALLENGE TYPE</label>
                  <select value={firewallForm.type} onChange={e => setFirewallForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="riddle">Riddle</option>
                    <option value="cipher">Cipher</option>
                    <option value="code_bug">Code Bug</option>
                  </select>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>YOUR CHALLENGE</label>
                  <textarea value={firewallForm.text} onChange={e => setFirewallForm(f => ({ ...f, text: e.target.value }))} placeholder="Write your challenge for attackers..." rows={3} style={{ resize: 'vertical' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>CORRECT ANSWER (secret)</label>
                  <input value={firewallForm.answer} onChange={e => setFirewallForm(f => ({ ...f, answer: e.target.value }))} placeholder="Answer..." />
                </div>
                <button className="btn-warning" onClick={deployFirewall} disabled={!firewallForm.text || !firewallForm.answer || loading} style={{ width: '100%' }}>
                  {loading ? 'Deploying...' : '🔒 Deploy Firewall'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Team Status Card ──────────────────────────────────────────────
export function TeamStatusCard({ team, zones }) {
  const ownedZones = zones.filter(z => z.owner_team_id === team.id);

  return (
    <div className="card card-lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: team.color }}>{team.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{ownedZones.length} zone{ownedZones.length !== 1 ? 's' : ''} controlled</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: team.battery > 50 ? 'var(--accent)' : team.battery > 20 ? 'var(--warning)' : 'var(--danger)' }}>
            {team.battery}%
          </div>
        </div>
      </div>
      <BatteryBar battery={team.battery} showLabel={false} height={10} />
      {ownedZones.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ownedZones.map(z => (
            <span key={z.id} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: `${team.color}22`, border: `1px solid ${team.color}44`, color: team.color, fontFamily: 'var(--font-mono)' }}>
              {z.name} {z.firewall?.is_active ? '🔒' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Phase 2 Leaderboard ───────────────────────────────────────────
export function Phase2Leaderboard({ teams, zones }) {
  const active = teams.filter(t => !t.is_eliminated).sort((a, b) => b.zones_owned.length - a.zones_owned.length || b.battery - a.battery);

  return (
    <div className="card">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, color: 'var(--text2)' }}>STANDINGS</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {active.map((team, i) => (
          <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 6, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: i < 4 ? 'var(--accent)' : 'var(--text3)', width: 24 }}>#{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color }} />
                <span style={{ fontSize: 13 }}>{team.name}</span>
                {i < 4 && <span className="badge badge-success" style={{ fontSize: 9 }}>ADVANCING</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>🏴 {team.zones_owned.length}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: team.battery > 30 ? 'var(--accent)' : 'var(--danger)' }}>⚡ {team.battery}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
