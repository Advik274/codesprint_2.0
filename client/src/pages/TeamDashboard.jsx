import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSocket, onSocketReconnect } from '../hooks/useSocket';
import { Navbar, ToastContainer, BatteryBar, CountdownTimer, HelpButton, MemePopup } from '../components/shared/index.jsx';
import { QuestionCard, EliminationOverlay, Phase1Leaderboard } from '../components/phase1/index.jsx';
import { SubmissionForm } from '../components/phase3/index.jsx';
import { QuizRound, QuizResultCard } from '../components/quiz/index.jsx';

export default function TeamDashboard() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { state, addToast } = useApp();
  const [showEliminated, setShowEliminated] = useState(false);
  const [phase3Problem, setPhase3Problem] = useState(null);
  const [teamPasscode] = useState(() => sessionStorage.getItem('team_passcode') || '');

  useEffect(() => {
    const savedId = sessionStorage.getItem('team_id');
    if (!savedId || savedId !== teamId) { navigate('/'); return; }
    const socket = getSocket();
    socket.on('team:eliminated', d => { if (d.team_id === teamId) setShowEliminated(true); });
    socket.on('phase3:problem_revealed', d => { if (d.team_id === 'all' || d.team_id === teamId) setPhase3Problem(d.problem); });
    // Rejoin the private team_<id> room after a dropped connection — sockets
    // don't keep room membership across a reconnect, so targeted server
    // emits (defense prompts, individual problem reveals) would otherwise
    // silently stop reaching this team until a manual page refresh.
    const rejoin = () => socket.emit('team:join', { team_id: teamId, passcode: teamPasscode });
    const unsub = onSocketReconnect(rejoin);
    return () => { socket.off('team:eliminated'); socket.off('phase3:problem_revealed'); unsub(); };
  }, [teamId]);

  useEffect(() => {
    if (state.showThankYou) navigate('/thankyou');
  }, [state.showThankYou]);

  const team = state.teams.find(t => t.id === teamId);

  useEffect(() => {
    if (team?.phase3_problem) setPhase3Problem(team.phase3_problem);
  }, [team?.phase3_problem]);

  // Live rank movement — toast when this team's position on the current
  // phase's leaderboard changes, so they don't have to keep scrolling the
  // board to notice they've been overtaken (or just took the lead).
  const phaseForRank = state.app_state.current_phase;
  const prevRankRef = useRef({});
  useEffect(() => {
    if (!team || team.is_eliminated) return;
    let board = null;
    if (phaseForRank === 'phase1') board = [...state.teams].sort((a, b) => b.phase1_total_score - a.phase1_total_score);
    else if (phaseForRank === 'phase2') board = [...state.teams].filter(t => !t.is_eliminated).sort((a, b) => b.zones_captured - a.zones_captured || b.battery - a.battery);
    else if (phaseForRank === 'quiz_round' && state.teams.some(t => t.quiz_score !== undefined && t.quiz_score !== null && t.quiz_score > 0)) {
      board = [...state.teams].filter(t => !t.is_eliminated).sort((a, b) => (b.quiz_score || 0) - (a.quiz_score || 0));
    }
    if (!board) return;
    const rank = board.findIndex(t => t.id === teamId) + 1;
    if (rank === 0) return;
    const prev = prevRankRef.current[phaseForRank];
    if (prev !== undefined && prev !== rank) {
      if (rank < prev) addToast({ message: `📈 You moved up to #${rank}!`, type: 'success' });
      else addToast({ message: `📉 You dropped to #${rank}`, type: 'warning' });
    }
    prevRankRef.current[phaseForRank] = rank;
  }, [state.teams, phaseForRank, teamId]);

  if (!team) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>Loading...</div></div>;

  const phase = state.app_state.current_phase;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <Navbar subtitle={team.name} />
      <ToastContainer />
      {showEliminated && <EliminationOverlay team={team} onDismiss={() => { setShowEliminated(false); navigate('/spectator'); }} />}
      {!team.is_eliminated && !['setup','results'].includes(phase) && (
        <HelpButton teamId={teamId} teamName={team.name} phase={phase} />
      )}
      {/* Only during genuinely idle moments — never mid-question, mid-quiz,
          or mid-build, where a joke popping up would just be annoying. */}
      <MemePopup enabled={
        phase === 'setup'
        || phase === 'phase2'
        || (phase === 'phase1' && !(state.currentQuestion && state.app_state.phase1_round_active))
      } />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>

        {(phase === 'setup') && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, color: 'var(--accent)', animation: 'glitch 4s infinite', marginBottom: 24 }}>{state.app_state.event_config.event_name}</div>
            <div className="card" style={{ display: 'inline-block', padding: '20px 40px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>REGISTERED AS</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, color: team.color }}>{team.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{team.year} Year · Code: {teamPasscode}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginTop: 24, fontSize: 13 }}>Waiting for the event to start...</div>
            <a href="/guide" style={{ display: 'inline-block', marginTop: 16, color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none', border: '1px solid var(--border2)', borderRadius: 6, padding: '8px 18px' }}>
              📖 How does this work?
            </a>
          </div>
        )}

        {phase === 'phase1' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--warning)' }}>THE GAUNTLET</h1>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Round {state.app_state.phase1_round || 0} / 5</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 30, fontWeight: 700, color: 'var(--accent)' }}>{team.phase1_total_score}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>PTS</div>
              </div>
            </div>

            {team.is_eliminated ? (
              <div className="card" style={{ border: '1px solid var(--danger)', textAlign: 'center', padding: 32, marginBottom: 20 }}>
                <div style={{ fontSize: 40 }}>💀</div>
                <div style={{ fontFamily: 'var(--font-display)', color: 'var(--danger)', fontSize: 24, marginTop: 8 }}>ELIMINATED</div>
                <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 8 }}>Final score: {team.phase1_total_score} pts</div>
              </div>
            ) : state.currentQuestion && state.app_state.phase1_round_active ? (
              <div style={{ marginBottom: 20 }}>
                <QuestionCard question={state.currentQuestion.question} teamId={teamId} />
              </div>
            ) : state.roundResult ? (
              <div className="card" style={{ textAlign: 'center', padding: 24, marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', marginBottom: 8 }}>Round {state.roundResult.round_number} complete</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>Answer: <span style={{ color: 'var(--accent)' }}>{state.roundResult.correct_answer}</span></div>
                {state.roundResult.eliminated_ids?.includes(teamId) && <div style={{ color: 'var(--danger)', marginTop: 8 }}>You were eliminated this round.</div>}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>⏳ Waiting for round to start...</div>
              </div>
            )}

            <Phase1Leaderboard teams={state.teams} />
          </div>
        )}

        {phase === 'phase2' && (
          <Phase2View team={team} teamId={teamId} state={state} />
        )}

        {phase === 'quiz_round' && (
          <div>
            {state.app_state.quiz_round_active ? (
              <QuizRound teamId={teamId} state={state} />
            ) : team.quiz_member_scores !== null && team.quiz_member_scores !== undefined ? (
              <QuizResultCard team={team} />
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
                  ⏳ Quiz round starting soon. Stand by for all questions.
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'phase3' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--info)', marginBottom: 20 }}>FINAL BUILD</h1>
            {phase3Problem ? (
              <>
                <div className="card card-lg" style={{ border: '1px solid var(--info)', marginBottom: 20 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--info)', marginBottom: 8, letterSpacing: '0.1em' }}>YOUR MISSION</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, lineHeight: 1.8, color: 'var(--text)' }}>{phase3Problem}</div>
                  <div style={{ marginTop: 16 }}><CountdownTimer endTime={state.app_state.phase3_timer_end} label="Time Remaining" paused={state.app_state.phase3_paused} /></div>
                </div>
                <SubmissionForm teamId={teamId} teamName={team.name} />
              </>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>⏳ Your problem statement will appear here shortly...</div>
              </div>
            )}
          </div>
        )}

        {phase === 'results' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--purple)', animation: 'glitch 3s infinite', marginBottom: 16 }}>EVENT COMPLETE</div>
            <a href="/spectator"><button className="btn-primary" style={{ fontSize: 16, padding: '12px 32px' }}>View Final Results →</button></a>
          </div>
        )}

      </div>
    </div>
  );
}


// ── Phase 2 View ─────────────────────────────────────────────────
// Full live zone map + battery + standings + defense problem setter
function Phase2View({ team, teamId, state }) {
  const [defenseModal, setDefenseModal] = useState(null); // zone object to set defense for
  const [defenseOptions, setDefenseOptions] = useState([]);
  const [defenseLoading, setDefenseLoading] = useState(false);
  const [defenseSet, setDefenseSet] = useState(null); // { zone_id, label }

  const socket = getSocket();

  // Listen for prompt to set defense problem after capturing
  useEffect(() => {
    socket.on('zone:set_problem_prompt', ({ zone_id, zone_name }) => {
      const zone = state.zones.find(z => z.id === zone_id);
      if (zone) openDefenseModal(zone);
    });
    return () => socket.off('zone:set_problem_prompt');
  }, [state.zones]);

  const openDefenseModal = (zone) => {
    setDefenseLoading(true);
    setDefenseModal(zone);
    socket.emit('zone:set_defense_problem', { zone_id: zone.id, team_id: teamId });
    socket.once('zone:defense_options', ({ options }) => {
      setDefenseOptions(options);
      setDefenseLoading(false);
    });
  };

  const confirmDefense = (problemId) => {
    socket.emit('zone:confirm_defense', { zone_id: defenseModal.id, team_id: teamId, problem_id: problemId });
    socket.once('zone:defense_set', ({ zone_name, problem_label }) => {
      setDefenseSet({ zone_id: defenseModal.id, label: problem_label });
      setDefenseModal(null);
      setTimeout(() => setDefenseSet(null), 5000);
    });
  };

  const myZones = state.zones.filter(z => z.owner_team_id === teamId);
  const battColor = team.battery > 50 ? 'var(--accent)' : team.battery > 20 ? 'var(--warning)' : 'var(--danger)';
  // BUG FIX: these used to be hardcoded (2%/min, -5%, +20%) regardless of
  // what the admin actually configured — showing teams the wrong economy
  // whenever a non-default preset (e.g. Zone Wars: 3%/min, -10%, +25%) was
  // in use for the event they were actually playing.
  const cfg = state.app_state?.event_config || {};
  const drainRate = cfg.battery_drain_rate ?? 2;
  const attemptCost = cfg.battery_attempt_cost ?? 5;
  const captureGain = cfg.battery_capture_gain ?? 20;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)' }}>CAMPUS CONQUEST</h1>
        <CountdownTimer endTime={state.app_state.phase2_timer_end} paused={state.app_state.phase2_paused} />
      </div>

      {/* Battery card */}
      <div className="card card-lg" style={{ marginBottom: 16, border: `1px solid ${team.color}55` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: team.color }}>{team.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {team.zones_captured} zone{team.zones_captured !== 1 ? 's' : ''} captured · drains {drainRate}%/min
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, color: battColor }}>{team.battery}%</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>BATTERY</div>
          </div>
        </div>
        <BatteryBar battery={team.battery} showLabel={false} height={10} />
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
          <span>Attempt cost: <span style={{ color: 'var(--danger)' }}>−{attemptCost}%</span></span>
          <span>Capture gain: <span style={{ color: 'var(--accent)' }}>+{captureGain}%</span></span>
        </div>
      </div>

      {team.is_eliminated ? (
        <div className="card" style={{ border: '1px solid var(--danger)', textAlign: 'center', padding: 32, marginBottom: 16 }}>
          <div style={{ fontSize: 40 }}>💀</div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--danger)', fontSize: 24, marginTop: 8 }}>BATTERY DEPLETED</div>
        </div>
      ) : (
        <>
          {/* Defense problem success toast */}
          {defenseSet && (
            <div style={{ marginBottom: 12, padding: '10px 16px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent)' }}>
              🔒 Defense set for zone! Problem: "{defenseSet.label}"
            </div>
          )}

          {/* MY ZONES — with Set Defense button */}
          {myZones.length > 0 && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid rgba(0,255,136,0.2)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--accent)', marginBottom: 12 }}>
                🏴 YOUR ZONES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myZones.map(z => (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, border: `1px solid ${team.color}33` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{z.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {z.location || ''}
                        {z.is_attempting && (
                          <span style={{ color: 'var(--danger)', marginLeft: 8 }}>⚡ {z.attempting_team_name} is attempting!</span>
                        )}
                      </div>
                    </div>
                    {z.problem ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>🔒 Trap set</span>
                        <button
                          onClick={() => openDefenseModal(z)}
                          style={{ padding: '4px 10px', borderRadius: 4, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openDefenseModal(z)}
                        className="btn-warning"
                        style={{ padding: '6px 14px', fontSize: 12 }}
                      >
                        ⚠️ Set Defense
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LIVE ZONE MAP */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
              🗺️ LIVE ZONE STATUS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {state.zones.map(z => {
                const isOwner = z.owner_team_id === teamId;
                const ownerTeam = state.teams.find(t => t.id === z.owner_team_id);
                const isNeutral = !z.owner_team_id;
                const isBusy = z.is_attempting;

                return (
                  <div key={z.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 8,
                    background: isOwner ? `${team.color}11` : 'var(--bg3)',
                    border: `1px solid ${isOwner ? team.color + '55' : isBusy ? 'rgba(255,170,0,0.4)' : ownerTeam ? ownerTeam.color + '44' : 'var(--border)'}`,
                  }}>
                    {/* Status dot */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: isOwner ? team.color : ownerTeam ? ownerTeam.color : 'var(--text3)',
                      boxShadow: isBusy ? '0 0 8px rgba(255,170,0,0.8)' : 'none',
                      animation: isBusy ? 'pulse-accent 0.8s infinite' : 'none',
                    }} />

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: isOwner ? team.color : 'var(--text)' }}>
                        {z.name}
                      </div>
                      {z.location && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{z.location}</div>}
                    </div>

                    <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {isBusy ? (
                        <span style={{ color: 'var(--warning)' }}>⚡ {z.attempting_team_name} attacking</span>
                      ) : isOwner ? (
                        <span style={{ color: team.color }}>🏴 YOURS{z.problem ? ' 🔒' : ' ⚠️'}</span>
                      ) : ownerTeam ? (
                        <span style={{ color: ownerTeam.color }}>🏴 {ownerTeam.name}</span>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>○ Neutral</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STANDINGS */}
          <div className="card">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>
              📊 STANDINGS
            </div>
            {[...state.teams].filter(t => !t.is_eliminated).sort((a, b) => b.zones_captured - a.zones_captured || b.battery - a.battery).map((t, i) => (
              <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: i < 4 ? 'var(--accent)' : 'var(--text3)', width: 28, flexShrink: 0 }}>#{i + 1}</div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, fontWeight: t.id === teamId ? 600 : 400, color: t.id === teamId ? t.color : 'var(--text)' }}>
                  {t.name}{t.id === teamId ? ' ← you' : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>
                  🏴 {t.zones_captured}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: t.battery > 30 ? 'var(--accent)' : 'var(--danger)', minWidth: 44, textAlign: 'right' }}>
                  ⚡{t.battery}%
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Defense Problem Modal */}
      {defenseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setDefenseModal(null)}>
          <div className="card card-lg" style={{ maxWidth: 520, width: '100%', border: `1px solid ${team.color}`, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: team.color }}>Set Your Trap</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  {defenseModal.name} — pick the challenge attackers must solve
                </div>
              </div>
              <button onClick={() => setDefenseModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            {defenseLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                Loading options...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {defenseOptions.map((opt, i) => {
                  const typeColors = { debugging: 'var(--danger)', output_trace: 'var(--warning)', team_logic: 'var(--info)', cipher: 'var(--purple)', sql_logic: 'var(--accent)' };
                  return (
                    <button key={opt.id} onClick={() => confirmDefense(opt.id)} style={{
                      textAlign: 'left', padding: '14px 16px',
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                      borderRadius: 8, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                      transition: 'all 0.15s', textTransform: 'none', letterSpacing: 'normal',
                      fontFamily: 'var(--font-body)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = typeColors[opt.type] || 'var(--accent)'; e.currentTarget.style.background = 'var(--bg2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)'; }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: typeColors[opt.type] || 'var(--accent)', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {opt.type?.replace('_', ' ')}
                      </span>
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{opt.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>Select →</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
              Tip: Pick something hard but solvable. You've already captured the zone either way.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
