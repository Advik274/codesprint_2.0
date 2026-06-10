import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket } from '../hooks/useSocket';
import { useApp } from '../context/AppContext';

export default function ZoneOperator() {
  const { zoneId } = useParams();
  const { state } = useApp();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle'); // idle | select_problem | challenge | result
  const [zone, setZone] = useState(null);
  const [problem, setProblem] = useState(null);
  const [problemOptions, setProblemOptions] = useState([]);
  const [teamInfo, setTeamInfo] = useState(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [batteryRemaining, setBatteryRemaining] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [hint, setHint] = useState(null);
  const [wrongFeedback, setWrongFeedback] = useState(null); // { message, shake }
  const timerRef = useRef(null);
  const answerRef = useRef(null);

  // Sync zone from global state
  useEffect(() => {
    if (state.showThankYou) navigate('/thankyou');
  }, [state.showThankYou]);

  useEffect(() => {
    const z = state.zones?.find(z => z.id === zoneId);
    if (z) setZone(z);
  }, [state.zones, zoneId]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('zone:operator_join', { zone_id: zoneId, admin_token: 'dominance2024' });

    socket.on('zone:operator_ready', ({ zone: z, message }) => {
      if (z) setZone(z);
      if (message) setError(message);
      resetToIdle();
    });

    socket.on('zone:pick_problem', ({ zone_id, team_name, team_color, options, battery_remaining }) => {
      if (zone_id !== zoneId) return;
      setTeamInfo({ name: team_name, color: team_color });
      setProblemOptions(options);
      setBatteryRemaining(battery_remaining);
      setPhase('select_problem');
      setError('');
    });

    socket.on('zone:challenge_ready', ({ zone_id, team_name, team_color, problem: p, battery_remaining, attempts_left }) => {
      if (zone_id !== zoneId) return;
      setTeamInfo({ name: team_name, color: team_color });
      setProblem(p);
      setBatteryRemaining(battery_remaining);
      setAttemptsLeft(attempts_left ?? 3);
      setHint(null);
      setWrongFeedback(null);
      setPhase('challenge');
      setAnswer('');
      setError('');
      // Start timer
      setTimeLeft(300); // 5 minutes
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; });
      }, 1000);
      setTimeout(() => answerRef.current?.focus(), 100);
    });

    socket.on('zone:wrong_answer', ({ zone_id, attempts_left, hint: serverHint, message }) => {
      if (zone_id !== zoneId) return;
      setAttemptsLeft(attempts_left);
      if (serverHint) setHint(serverHint);
      setWrongFeedback({ message });
      setAnswer(''); // clear input for next attempt
      // Brief shake then refocus
      setTimeout(() => {
        setWrongFeedback(prev => prev ? { ...prev, shake: false } : prev);
        answerRef.current?.focus();
      }, 600);
    });

    socket.on('zone:capture_result', ({ success, message, correct_answer, battery }) => {
      clearInterval(timerRef.current);
      setResult({ success, message, correct_answer, battery });
      setPhase('result');
    });

    socket.on('zone:error', ({ message }) => setError(message));

    return () => {
      socket.off('zone:operator_ready');
      socket.off('zone:pick_problem');
      socket.off('zone:challenge_ready');
      socket.off('zone:wrong_answer');
      socket.off('zone:capture_result');
      socket.off('zone:error');
      clearInterval(timerRef.current);
    };
  }, [zoneId]);

  const resetToIdle = () => {
    setPhase('idle'); setTeamInfo(null); setProblem(null); setProblemOptions([]);
    setAnswer(''); setResult(null); setPasscode(''); setTimeLeft(null);
    setAttemptsLeft(3); setHint(null); setWrongFeedback(null);
    clearInterval(timerRef.current);
  };

  const handleTeamArrive = () => {
    if (!passcode.trim()) return;
    setError('');
    getSocket().emit('zone:team_arrive', { zone_id: zoneId, team_passcode: passcode.trim(), admin_token: 'dominance2024' });
    setPasscode('');
  };

  const selectProblem = (problemId) => {
    getSocket().emit('zone:select_problem', { zone_id: zoneId, problem_id: problemId, admin_token: 'dominance2024' });
  };

  const submitAnswer = () => {
    if (!answer.trim()) return;
    getSocket().emit('zone:submit_answer', { zone_id: zoneId, answer: answer.trim(), admin_token: 'dominance2024' });
  };

  const cancelAttempt = () => {
    getSocket().emit('zone:cancel_attempt', { zone_id: zoneId, admin_token: 'dominance2024' });
    resetToIdle();
  };

  // Format timer
  const mins = Math.floor((timeLeft || 0) / 60);
  const secs = (timeLeft || 0) % 60;
  const timerStr = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const urgent = timeLeft !== null && timeLeft <= 60;

  const typeColors = { debugging: 'var(--danger)', output_trace: 'var(--warning)', team_logic: 'var(--info)', cipher: 'var(--purple)', sql_logic: 'var(--accent)' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 0, background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.2em' }}>ZONE OPERATOR</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)', letterSpacing: '0.08em' }}>{zone?.name || zoneId}</div>
          {zone?.location && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{zone.location}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {zone?.owner_team_id ? (
            <div style={{ padding: '4px 14px', borderRadius: 4, background: `${zone.owner_color}22`, border: `1px solid ${zone.owner_color}66`, color: zone.owner_color, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              🏴 {zone.owner_name}
            </div>
          ) : (
            <div className="badge badge-info">NEUTRAL</div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 680 }}>

          {/* ── IDLE ──────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <div className="card card-lg" style={{ textAlign: 'center' }}>
              {zone?.is_attempting ? (
                <div style={{ padding: 20 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--warning)', marginBottom: 8 }}>ZONE BUSY</div>
                  <div style={{ color: 'var(--text2)' }}>Another team is currently attempting this zone.</div>
                </div>
              ) : !zone?.owner_team_id ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--info)', marginBottom: 8 }}>NEUTRAL ZONE</div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 28 }}>Enter team passcode when a team arrives</div>
                  <input value={passcode} onChange={e => setPasscode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTeamArrive()} placeholder="Team passcode" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 36, letterSpacing: '0.5em', marginBottom: 16 }} maxLength={4} autoFocus />
                  <button className="btn-primary" onClick={handleTeamArrive} disabled={!passcode.trim()} style={{ width: '100%', padding: 16, fontSize: 18 }}>Team Arrived →</button>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: zone.owner_color, marginBottom: 4 }}>OWNED BY {zone.owner_name?.toUpperCase()}</div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 20 }}>
                    {zone.problem ? '🔒 Defense problem set — ready for attackers' : '⚠️ No defense problem set yet'}
                  </div>
                  <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 24 }}>Enter attacker team passcode when they arrive</div>
                  <input value={passcode} onChange={e => setPasscode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleTeamArrive()} placeholder="Attacker passcode" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 36, letterSpacing: '0.5em', marginBottom: 16 }} maxLength={4} autoFocus />
                  <button className="btn-danger" onClick={handleTeamArrive} disabled={!passcode.trim()} style={{ width: '100%', padding: 16, fontSize: 18 }}>⚡ Team Attempting Capture</button>
                </>
              )}
              {error && <div style={{ marginTop: 14, color: 'var(--danger)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '10px', background: 'rgba(255,51,85,0.08)', borderRadius: 6 }}>{error}</div>}
            </div>
          )}

          {/* ── SELECT PROBLEM (operator picks from 5 for neutral zone) ── */}
          {phase === 'select_problem' && (
            <div className="card card-lg" style={{ border: `2px solid ${teamInfo?.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: teamInfo?.color }}>{teamInfo?.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>Pick one of 5 challenges for this team</div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--warning)' }}>Battery: {batteryRemaining}%</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {problemOptions.map((opt, i) => (
                  <button key={opt.id} onClick={() => selectProblem(opt.id)} style={{
                    textAlign: 'left', padding: '14px 18px',
                    background: 'var(--bg3)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)',
                    textTransform: 'none', letterSpacing: 'normal',
                    fontFamily: 'var(--font-body)', fontSize: 14,
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = typeColors[opt.type] || 'var(--accent)'; e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)'; }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: typeColors[opt.type] || 'var(--accent)', minWidth: 80, textTransform: 'uppercase' }}>{opt.type.replace('_', ' ')}</span>
                    <span style={{ flex: 1 }}>{opt.label}</span>
                  </button>
                ))}
              </div>
              <button className="btn-ghost" onClick={cancelAttempt} style={{ marginTop: 16, width: '100%' }}>Cancel (refunds battery)</button>
            </div>
          )}

          {/* ── CHALLENGE (team types their answer) ─────────────────── */}
          {phase === 'challenge' && problem && (
            <div className="card card-lg" style={{ border: `2px solid ${teamInfo?.color || 'var(--accent)'}` }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: teamInfo?.color }}>{teamInfo?.name}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                    <span className="badge" style={{ background: `${typeColors[problem.type] || 'var(--accent)'}22`, color: typeColors[problem.type] || 'var(--accent)', border: `1px solid ${typeColors[problem.type] || 'var(--accent)'}44`, fontSize: 10 }}>{problem.type?.replace('_', ' ')}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{problem.hint_type}</span>
                    {/* Attempt pips */}
                    <span style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                      {[1,2,3].map(i => (
                        <span key={i} style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: i <= attemptsLeft ? 'var(--accent)' : 'var(--bg3)',
                          border: `1px solid ${i <= attemptsLeft ? 'var(--accent)' : 'var(--border)'}`,
                          display: 'inline-block',
                        }}/>
                      ))}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: attemptsLeft <= 1 ? 'var(--danger)' : 'var(--text3)', marginLeft: 4 }}>
                        {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} left
                      </span>
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 700, color: urgent ? 'var(--danger)' : 'var(--accent)', animation: urgent ? 'pulse-accent 0.8s infinite' : 'none' }}>
                    {timerStr}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>remaining</div>
                </div>
              </div>

              {/* Timer bar */}
              <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ height: '100%', width: `${timeLeft !== null ? (timeLeft / 300) * 100 : 100}%`, background: urgent ? 'var(--danger)' : 'var(--accent)', transition: 'width 1s linear', borderRadius: 2 }} />
              </div>

              {/* Problem */}
              <div style={{
                padding: '16px 20px',
                background: 'var(--bg)',
                borderRadius: 8, border: '1px solid var(--border)',
                fontFamily: 'var(--font-body)', fontSize: 14,
                lineHeight: 1.8, marginBottom: 16,
                whiteSpace: 'pre-wrap', color: 'var(--text)',
                maxHeight: 360, overflowY: 'auto',
              }}>
                {formatProblem(problem.problem)}
              </div>

              {/* Wrong answer feedback */}
              {wrongFeedback && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 12,
                  background: 'rgba(255,51,85,0.1)', border: '1px solid var(--danger)',
                  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)',
                  animation: 'fadeIn 0.2s ease',
                }}>
                  {wrongFeedback.message}
                </div>
              )}

              {/* Hint (shown after first wrong answer) */}
              {hint && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 12,
                  background: 'rgba(255,170,0,0.1)', border: '1px solid var(--warning)',
                  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--warning)',
                }}>
                  💡 Hint: {hint}
                </div>
              )}

              {/* TEAM TYPES HERE */}
              <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 8, letterSpacing: '0.1em' }}>
                  ↓ TEAM — TYPE YOUR ANSWER HERE
                </div>
                <textarea
                  ref={answerRef}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitAnswer(); }}
                  placeholder="Type your answer... (Ctrl+Enter to submit)"
                  rows={3}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 15, resize: 'vertical', width: '100%', background: 'var(--bg2)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-primary" onClick={submitAnswer} disabled={!answer.trim()} style={{ flex: 1, padding: 14, fontSize: 16 }}>
                  Submit Answer
                </button>
                <button className="btn-ghost" onClick={cancelAttempt} style={{ padding: '14px 20px' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* ── RESULT ─────────────────────────────────────────────── */}
          {phase === 'result' && result && (
            <div className="card card-lg" style={{ textAlign: 'center', border: `2px solid ${result.success ? 'var(--accent)' : 'var(--danger)'}` }}>
              <div style={{ fontSize: 72, marginBottom: 16 }}>{result.success ? '🏴' : '❌'}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: result.success ? 'var(--accent)' : 'var(--danger)', marginBottom: 12 }}>
                {result.success ? 'CAPTURED!' : 'FAILED'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {result.message}
              </div>
              {result.success && (
                <div style={{ marginTop: 12, padding: '12px', background: 'rgba(0,255,136,0.08)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
                  ⚡ New owner must set their defense problem from their team dashboard!
                </div>
              )}
              <button className="btn-ghost" onClick={resetToIdle} style={{ marginTop: 20, padding: '10px 32px', fontSize: 15 }}>
                ← Back to Zone
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Renders problem text with code blocks styled properly
function formatProblem(text) {
  if (!text) return null;
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^[a-z]+\n/, ''); // strip language tag
      return (
        <pre key={i} style={{
          background: '#0d1117', border: '1px solid #30363d',
          borderRadius: 6, padding: '14px 16px',
          fontFamily: 'var(--font-mono)', fontSize: 13,
          overflowX: 'auto', margin: '10px 0',
          lineHeight: 1.6, color: '#c9d1d9',
          whiteSpace: 'pre',
        }}>
          {code}
        </pre>
      );
    }
    // Handle **bold** inline
    const boldParts = part.split(/(\*\*.*?\*\*)/g);
    return (
      <span key={i}>
        {boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <strong key={j} style={{ color: 'var(--accent)' }}>{bp.slice(2, -2)}</strong>;
          }
          // Handle inline `code`
          const codeParts = bp.split(/(`[^`]+`)/g);
          return codeParts.map((cp, k) => {
            if (cp.startsWith('`') && cp.endsWith('`')) {
              return <code key={k} style={{ fontFamily: 'var(--font-mono)', background: 'rgba(0,255,136,0.1)', padding: '1px 6px', borderRadius: 3, fontSize: 13, color: 'var(--accent)' }}>{cp.slice(1,-1)}</code>;
            }
            return <span key={k}>{cp}</span>;
          });
        })}
      </span>
    );
  });
}
