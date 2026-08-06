import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { CountdownTimer } from '../shared/index.jsx';

// Fisher-Yates shuffle — client-side, so each participant sees a different order
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── QuizRound — team member view ─────────────────────────────────
// Shows all N questions at once; each member submits individually
export function QuizRound({ teamId, state }) {
  const { app_state } = state;
  const [memberName, setMemberName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [answers, setAnswers] = useState({});  // { q_id: answer }
  const [submitted, setSubmitted] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'unanswered'

  const rawQuestions = app_state.quiz_questions || [];
  // The team's own roster, stashed privately at join time. Kept in state
  // and refreshed live so that when a coordinator adds a member who was
  // left off the list, their name appears on the team's phones straight
  // away instead of after a reload.
  const readRoster = () => {
    try { const r = JSON.parse(sessionStorage.getItem('team_members') || '[]'); return Array.isArray(r) ? r.filter(Boolean) : []; }
    catch { return []; }
  };
  const [roster, setRoster] = useState(readRoster);
  useEffect(() => {
    const socket = getSocket();
    const onRoster = (d) => {
      const list = Array.isArray(d?.members) ? d.members.filter(Boolean) : [];
      sessionStorage.setItem('team_members', JSON.stringify(list));
      setRoster(list);
    };
    socket.on('team:roster_updated', onRoster);
    return () => socket.off('team:roster_updated', onRoster);
  }, []);

  // BUG FIX 1: Shuffle questions once per quiz session, per client.
  // We track the quiz session by question count + first question id to detect a new quiz start.
  const sessionKey = rawQuestions.length > 0 ? `${rawQuestions.length}_${rawQuestions[0]?.id}` : '';
  const shuffledRef = useRef({ key: '', questions: [] });
  if (shuffledRef.current.key !== sessionKey && rawQuestions.length > 0) {
    shuffledRef.current = { key: sessionKey, questions: shuffleArray(rawQuestions) };
  }
  const questions = shuffledRef.current.questions;

  const answered = Object.keys(answers).length;
  const total = questions.length;

  // On name entry: if server already recorded this member's answers, mark submitted
  // Prevents refresh-to-retake (submitted is React state, lost on refresh)
  useEffect(() => {
    if (!nameSubmitted || !memberName.trim()) return;
    const serverAnswers = app_state.quiz_member_answers?.[teamId]?.[memberName.trim()];
    if (serverAnswers) {
      setSubmitted(true);
      setSubmitLoading(false);
    }
  }, [nameSubmitted, memberName, teamId, app_state.quiz_member_answers]);

  const setAnswer = useCallback((qId, answer) => {
    setAnswers(prev => ({ ...prev, [qId]: answer }));
  }, []);

  // BUG FIX: this ignored the server's reply entirely and marked the
  // submission successful either way (even on the 3s fallback), so a
  // rejected submission — wrong name, roster mismatch, cap reached —
  // looked exactly like a successful one and the member never knew their
  // answers hadn't counted.
  const [submitError, setSubmitError] = useState('');
  const handleSubmitAll = () => {
    if (!memberName.trim()) return;
    setSubmitError('');
    setSubmitLoading(true);
    const socket = getSocket();
    const onReply = (d) => {
      clearTimeout(timer);
      setSubmitLoading(false);
      if (d?.error) setSubmitError(d.error);
      else setSubmitted(true);
    };
    socket.once('quiz:answers_received', onReply);
    socket.emit('quiz:submit_answers', { team_id: teamId, member_name: memberName.trim(), answers });
    const timer = setTimeout(() => {
      socket.off('quiz:answers_received', onReply);
      setSubmitLoading(false);
      setSubmitError('No response from the server — check your connection and try again.');
    }, 8000);
  };

  const displayQ = filter === 'unanswered'
    ? questions.filter(q => answers[q.id] === undefined)
    : questions;

  // BUG FIX 2: If quiz hasn't started yet (no questions), show waiting screen.
  // But if questions exist and round is no longer active, the quiz ended — show submitted/ended card.
  if (!app_state.quiz_round_active && questions.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          ⏳ Quiz round starting soon... Stand by.
        </div>
      </div>
    );
  }

  // Quiz has ended (questions exist but round is no longer active)
  if (!app_state.quiz_round_active && questions.length > 0) {
    return (
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)', marginBottom: 8 }}>
          QUIZ ROUND ENDED
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          {submitted ? `${memberName} · ${answered} / ${total} answered` : 'Time is up — submissions closed.'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
          Waiting for admin to calculate scores...
        </div>
      </div>
    );
  }

  if (!nameSubmitted) {
    // Warn if this name is already used by another team (cross-team duplicate name detection)
    const allMemberAnswers = app_state.quiz_member_answers || {};
    const nameInOtherTeam = memberName.trim()
      ? Object.entries(allMemberAnswers).some(([tid, members]) =>
          tid !== teamId && members[memberName.trim()]
        )
      : false;
    const nameInSameTeam = memberName.trim()
      ? !!(allMemberAnswers[teamId]?.[memberName.trim()])
      : false;

    return (
      <div className="card card-lg" style={{ maxWidth: 420, margin: '0 auto', border: '1px solid var(--info)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--info)', marginBottom: 8 }}>QUIZ ROUND</h2>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginBottom: 24 }}>
          {total} questions · {app_state.event_config?.quiz_duration_min || 30} minutes
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>
            Your Name (as registered)
          </label>
          {/* When the team has a registered roster, pick from it — the
              server validates against the same list, so free-typing a
              name that isn't on it would just be rejected. */}
          {roster.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {roster.map(n => {
                const taken = !!app_state.quiz_member_answers?.[teamId]?.[n];
                const selected = memberName === n;
                return (
                  <button key={n} onClick={() => setMemberName(n)} disabled={taken} style={{
                    textAlign: 'left', padding: '11px 14px', borderRadius: 6,
                    background: selected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg3)',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                    color: taken ? 'var(--text3)' : selected ? 'var(--accent)' : 'var(--text)',
                    fontFamily: 'var(--font-body)', fontSize: 14,
                    textTransform: 'none', letterSpacing: 'normal',
                    opacity: taken ? 0.55 : 1, cursor: taken ? 'not-allowed' : 'pointer',
                  }}>
                    {selected ? '● ' : taken ? '✓ ' : '○ '}{n}{taken ? '  — already submitted' : ''}
                  </button>
                );
              })}
            </div>
          ) : (
          <input
            type="text"
            placeholder="e.g. Aarav Kumar"
            value={memberName}
            onChange={e => setMemberName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && memberName.trim() && !nameInOtherTeam && setNameSubmitted(true)}
            style={{ fontFamily: 'var(--font-body)', fontSize: 15, borderColor: nameInOtherTeam ? 'var(--danger)' : undefined }}
            autoFocus
          />
          )}
          {nameInSameTeam && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>
              ✅ You already submitted answers — click Start to review your submission status.
            </div>
          )}
          {nameInOtherTeam && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', marginTop: 6 }}>
              ⚠️ This name was already used by a member of another team. Please use your full name to avoid conflicts.
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            Each team member submits answers individually. Scores are averaged.
          </div>
          {roster.length > 0 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
              Name not on the list? Ask a coordinator to add you — it appears here the moment they do, no reload needed.
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={() => memberName.trim() && !nameInOtherTeam && setNameSubmitted(true)}
          disabled={!memberName.trim() || nameInOtherTeam} style={{ width: '100%', padding: 12, fontSize: 15 }}>
          Start Quiz →
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent)', marginBottom: 8 }}>
          ANSWERS SUBMITTED
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text2)' }}>
          {memberName} · {answered} / {total} answered
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 16 }}>
          Wait for all members to submit. Timer still running.
        </div>
        {app_state.quiz_timer_end && (
          <div style={{ marginTop: 16 }}>
            <CountdownTimer endTime={app_state.quiz_timer_end} label="Time Remaining" paused={app_state.quiz_paused} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header sticky bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        padding: '12px 0', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--info)' }}>QUIZ ROUND</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            {memberName} · {answered}/{total} answered
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {app_state.quiz_timer_end && (
            <CountdownTimer endTime={app_state.quiz_timer_end} paused={app_state.quiz_paused} />
          )}
          {app_state.quiz_paused && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)', padding: '4px 8px', border: '1px solid var(--warning)', borderRadius: 4 }}>
              ⏸ PAUSED
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, marginBottom: 16 }}>
        <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${total > 0 ? (answered / total) * 100 : 0}%`, transition: 'width 0.3s' }} />
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'unanswered'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 14px', borderRadius: 4, fontSize: 12,
            background: filter === f ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg3)',
            border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
            color: filter === f ? 'var(--accent)' : 'var(--text3)',
            fontFamily: 'var(--font-mono)', cursor: 'pointer',
            textTransform: 'none', letterSpacing: 'normal',
          }}>
            {f === 'all' ? `All (${total})` : `Unanswered (${total - answered})`}
          </button>
        ))}
      </div>

      {/* Question list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        {displayQ.map((q, idx) => {
          const globalIdx = questions.indexOf(q);
          const isAnswered = answers[q.id] !== undefined;
          return (
            <div key={q.id} className="card" style={{
              border: `1px solid ${isAnswered ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
              background: isAnswered ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'var(--bg2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
                  Q{globalIdx + 1} · {q.points || 10} pts · {q.difficulty || 'easy'}
                </div>
                {isAnswered && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>✓ answered</div>}
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{q.question}</div>

              {q.type === 'mcq' && q.options?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {q.options.map((opt, oi) => {
                    const selected = answers[q.id] === opt;
                    return (
                      <button key={oi} onClick={() => setAnswer(q.id, opt)} style={{
                        textAlign: 'left', padding: '10px 14px', borderRadius: 6,
                        background: selected ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--bg3)',
                        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                        color: selected ? 'var(--accent)' : 'var(--text)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14,
                        textTransform: 'none', letterSpacing: 'normal',
                        transition: 'all 0.1s',
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: selected ? 'var(--accent)' : 'var(--text3)', marginRight: 10 }}>
                          {String.fromCharCode(65 + oi)}.
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Type your answer..."
                  value={answers[q.id] || ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 14, width: '100%' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Submit All */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '16px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 8, textAlign: 'center' }}>
          {answered}/{total} questions answered
          {answered < total && <span style={{ color: 'var(--warning)' }}> · {total - answered} remaining</span>}
        </div>
        {submitError && (
          <div style={{ padding: '10px 14px', marginBottom: 10, borderRadius: 6, border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)', fontSize: 13, lineHeight: 1.5, textAlign: 'center' }}>
            ❌ {submitError}
          </div>
        )}
        <button className="btn-primary" onClick={handleSubmitAll} disabled={submitLoading || answered === 0}
          style={{ width: '100%', padding: 14, fontSize: 15 }}>
          {submitLoading ? 'Submitting...' : `Submit All Answers (${answered}/${total})`}
        </button>
        {answered < total && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
            You can submit with unanswered questions — unanswered = 0 points
          </div>
        )}
      </div>
    </div>
  );
}

// ── QuizResultCard — shown after quiz:ended ──────────────────────
export function QuizResultCard({ team }) {
  if (!team) return null;
  return (
    <div className="card card-lg" style={{ border: '1px solid var(--info)', textAlign: 'center', padding: 32 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--info)', marginBottom: 8 }}>QUIZ ROUND COMPLETE</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--accent)' }}>{team.quiz_score || 0}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>PTS (team avg)</div>
      {team.quiz_member_scores && Object.keys(team.quiz_member_scores).length > 0 && (
        <div style={{ marginTop: 20, textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>MEMBER SCORES</div>
          {Object.entries(team.quiz_member_scores).map(([name, score]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <span>{name}</span>
              <span style={{ color: 'var(--accent)' }}>{score} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
