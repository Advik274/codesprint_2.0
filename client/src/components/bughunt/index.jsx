import { useState, useEffect } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { CountdownTimer } from '../shared/index.jsx';

const LANG_COLORS = { python: 'var(--info)', java: 'var(--warning)', cpp: 'var(--purple)' };
const LANG_LABELS = { python: 'Python', java: 'Java', cpp: 'C++' };

// ── BugHuntRound — team view (Mission 2) ─────────────────────────
// One submission per team (one laptop per team). Shows every buggy
// program with a fix input; Submit All locks the team in.
export function BugHuntRound({ teamId, state }) {
  const { app_state } = state;
  const team = state.teams.find(t => t.id === teamId);
  const programs = app_state.bughunt_programs || [];
  const [answers, setAnswers] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const submitted = !!team?.bughunt_submitted_at;
  const answered = Object.values(answers).filter(a => a?.trim()).length;

  useEffect(() => {
    const socket = getSocket();
    const onResult = (d) => {
      setSubmitLoading(false);
      if (!d.ok) setSubmitError(d.message || 'Submission failed — try again.');
    };
    socket.on('bughunt:submit_result', onResult);
    return () => socket.off('bughunt:submit_result', onResult);
  }, []);

  const handleSubmitAll = () => {
    setSubmitError('');
    setSubmitLoading(true);
    getSocket().emit('bughunt:submit', { answers });
    // Fallback: if no response lands, stop the spinner so they can retry
    setTimeout(() => setSubmitLoading(false), 4000);
  };

  // Not started yet
  if (!app_state.bughunt_active && programs.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          🐛 Bug Hunt starting soon... Get ready to squash some bugs.
        </div>
      </div>
    );
  }

  // Ended
  if (!app_state.bughunt_active && programs.length > 0) {
    return <BugHuntResultCard team={team} programs={programs} />;
  }

  // Submitted — locked in
  if (submitted) {
    return (
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🐛✅</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)', marginBottom: 8 }}>
          FIXES SUBMITTED
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text2)' }}>
          Your team's fixes are locked in. Results after the round ends.
        </div>
        {app_state.bughunt_timer_end && (
          <div style={{ marginTop: 16 }}>
            <CountdownTimer endTime={app_state.bughunt_timer_end} label="Time Remaining" paused={app_state.bughunt_paused} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '12px 0', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--danger)' }}>🐛 BUG HUNT</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            {answered}/{programs.length} fixes written · one submission per team
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {app_state.bughunt_timer_end && (
            <CountdownTimer endTime={app_state.bughunt_timer_end} paused={app_state.bughunt_paused} />
          )}
          {app_state.bughunt_paused && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)', padding: '4px 8px', border: '1px solid var(--warning)', borderRadius: 4 }}>
              ⏸ PAUSED
            </span>
          )}
        </div>
      </div>

      {/* Program cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {programs.map((p, idx) => {
          const hasAnswer = !!answers[p.id]?.trim();
          const langColor = LANG_COLORS[p.language] || 'var(--info)';
          return (
            <div key={p.id} className="card" style={{
              border: `1px solid ${hasAnswer ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
              background: hasAnswer ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'var(--bg2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text2)' }}>
                  Program {idx + 1} · <span style={{ fontWeight: 600 }}>{p.title}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: langColor, border: `1px solid ${langColor}`, borderRadius: 4, padding: '2px 8px' }}>
                  {LANG_LABELS[p.language] || p.language}
                </span>
              </div>
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.6,
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: 14, overflowX: 'auto', whiteSpace: 'pre', color: 'var(--text)',
                marginBottom: 12,
              }}>{p.code}</pre>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
                🎯 {p.task}
              </div>
              <input
                type="text"
                placeholder="Type your fix here..."
                value={answers[p.id] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [p.id]: e.target.value }))}
                maxLength={500}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 14, width: '100%' }}
              />
              {hasAnswer && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>✓ fix written</div>}
            </div>
          );
        })}
      </div>

      {/* Submit All */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
        {submitError && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', marginBottom: 8, textAlign: 'center' }}>
            ❌ {submitError}
          </div>
        )}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 8, textAlign: 'center' }}>
          {answered}/{programs.length} fixes written
          {answered < programs.length && <span style={{ color: 'var(--warning)' }}> · {programs.length - answered} remaining</span>}
          <span style={{ display: 'block', marginTop: 2 }}>⚠️ One submission per team — you can't change fixes after submitting.</span>
        </div>
        <button className="btn-primary" onClick={handleSubmitAll} disabled={submitLoading || answered === 0}
          style={{ width: '100%', padding: 14, fontSize: 15 }}>
          {submitLoading ? 'Submitting...' : `Submit Team Fixes (${answered}/${programs.length})`}
        </button>
      </div>
    </div>
  );
}

// ── BugHuntResultCard — after admin ends + grades the round ──────
export function BugHuntResultCard({ team, programs = [] }) {
  if (!team) return null;
  const graded = team.bughunt_score !== null && team.bughunt_score !== undefined;
  if (!graded) {
    return (
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--danger)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--danger)', marginBottom: 8 }}>
          BUG HUNT ENDED
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>
          {team.bughunt_submitted_at ? 'Fixes submitted — grading in progress...' : 'Time is up — submissions closed.'}
        </div>
      </div>
    );
  }
  return (
    <div className="card card-lg" style={{ border: '1px solid var(--danger)', textAlign: 'center', padding: 32 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', marginBottom: 8 }}>🐛 BUG HUNT COMPLETE</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--accent)' }}>{team.bughunt_score}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>MARKS</div>
      {team.bughunt_per_program && programs.length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>PER PROGRAM</div>
          {programs.map(p => {
            const marks = team.bughunt_per_program[p.id];
            const got = (marks || 0) > 0;
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                <span>{got ? '✅' : '❌'} {p.title}</span>
                <span style={{ color: got ? 'var(--accent)' : 'var(--danger)' }}>{marks ?? 0} marks</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
