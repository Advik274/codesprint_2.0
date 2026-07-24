import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { useApp } from '../../context/AppContext';

// ── Question Card ────────────────────────────────────────────────
export function QuestionCard({ question, teamId, onSubmitted }) {
  const [selected, setSelected] = useState('');
  const [textAnswer, setTextAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState(question.time_limit_seconds);
  const [timeUp, setTimeUp] = useState(false);
  const startTime = useRef(Date.now());
  useEffect(() => {
      setSelected('');
      setTextAnswer('');
      setSubmitted(false);
      setResult(null);
      setTimeUp(false);
      setTimeLeft(question.time_limit_seconds);
      startTime.current = Date.now();
    }, [question.id]);

    // BUG FIX: this used to tick regardless of submission state — a team
    // that answered still watched their own countdown keep running down
    // to 0, which reads as "did my answer not count?" even though it did.
    // Stopping (and freezing) it the moment they submit makes it clear
    // their answer locked in and they're just waiting on the round now.
    useEffect(() => {
      if (submitted || result || timeUp) return;
      const iv = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(iv);
            setTimeUp(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(iv);
    }, [question.id, submitted, result, timeUp]);

    useEffect(() => {
      const socket = getSocket();
      const onResult = (data) => { setResult(data); onSubmitted?.(data); };
      socket.on('phase1:answer_result', onResult);
      return () => socket.off('phase1:answer_result', onResult);
    }, []);
    
  const handleSubmit = () => {
    if (submitted) return;
    const answer = question.type === 'mcq' ? selected : textAnswer;
    if (!answer) return;

    const time_taken_ms = Date.now() - startTime.current;
    getSocket().emit('phase1:submit_answer', { team_id: teamId, question_id: question.id, answer, time_taken_ms });
    setSubmitted(true);
  };

  const urgentTime = timeLeft <= 10;
  const progress = (timeLeft / question.time_limit_seconds) * 100;
  const timerColor = timeLeft > 20 ? 'var(--accent)' : timeLeft > 10 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="card card-lg animate-fade" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Timer bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="badge badge-warning">Round {question.round} · {question.difficulty}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: timerColor, animation: urgentTime ? 'pulse-accent 0.5s infinite' : 'none' }}>
            {timeLeft}s
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: timerColor, transition: 'width 1s linear, background 1s', borderRadius: 2 }} />
        </div>
      </div>

      {/* Question */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, lineHeight: 1.7, color: 'var(--text)', marginBottom: 24, padding: '16px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {question.question}
      </div>
{/* Options */}
      {!submitted && !result && !timeUp && (
        <>
          {question.type === 'mcq' ? (
            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {question.options.map(opt => (
                <button key={opt} onClick={() => setSelected(opt)} style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  background: selected === opt ? 'rgba(0,255,136,0.1)' : 'var(--bg3)',
                  border: `1px solid ${selected === opt ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 6,
                  color: selected === opt ? 'var(--accent)' : 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  transition: 'all 0.15s',
                }}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <input
                value={textAnswer}
                onChange={e => setTextAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Type your answer..."
                style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}
                autoFocus
              />
            </div>
          )}
          <button className="btn-primary" onClick={handleSubmit} disabled={question.type === 'mcq' ? !selected : !textAnswer} style={{ width: '100%', padding: 14, fontSize: 16 }}>
            Submit Answer
          </button>
        </>
      )}

      {/* Time Up */}
      {timeUp && !result && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏱</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--danger)' }}>TIME UP</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)', fontSize: 13, marginTop: 8 }}>
            Waiting for round to end...
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ textAlign: 'center', padding: '24px 0', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{result.correct ? '✓' : '✗'}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: result.correct ? 'var(--accent)' : 'var(--danger)', marginBottom: 8 }}>
            {result.correct ? 'CORRECT!' : 'WRONG'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text2)', fontSize: 14 }}>
            {result.correct ? `+${result.score} points` : 'No points this round'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 18, marginTop: 8 }}>
            Total: {result.total}
          </div>
        </div>
      )}

      {submitted && !result && !timeUp && (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          Answer submitted. Waiting for round to end...
        </div>
      )}

      {/* Points info */}
      <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>BASE: {question.points}pts</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>SPEED BONUS: up to +{question.time_limit_seconds}pts</span>
      </div>
    </div>
  );
}

// ── Elimination Overlay ──────────────────────────────────────────
export function EliminationOverlay({ team, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(255,51,85,0.12)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div className="card card-lg" style={{ maxWidth: 480, width: '90%', textAlign: 'center', border: '1px solid var(--danger)' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>💀</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--danger)', marginBottom: 12 }}>ELIMINATED</h1>
        <div style={{ color: 'var(--text2)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>{team.name}</div>
        <div style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
          You have been eliminated from the competition. Thank you for participating.
        </div>
        <button className="btn-ghost" onClick={onDismiss}>View Spectator Board</button>
      </div>
    </div>
  );
}

// ── Phase 1 Leaderboard ──────────────────────────────────────────
export function Phase1Leaderboard({ teams }) {
  const sorted = [...teams].sort((a, b) => b.phase1_total_score - a.phase1_total_score);

  return (
    <div className="card">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 16, color: 'var(--text2)' }}>LEADERBOARD</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((team, i) => (
          <div key={team.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px', borderRadius: 6,
            background: i === 0 ? 'rgba(0,255,136,0.06)' : 'var(--bg3)',
            border: `1px solid ${i === 0 ? 'rgba(0,255,136,0.2)' : 'var(--border)'}`,
            opacity: team.is_eliminated ? 0.4 : 1,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: i < 3 ? ['var(--accent)', 'var(--warning)', 'var(--info)'][i] : 'var(--text3)', width: 24, textAlign: 'center' }}>
              #{i + 1}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, textDecoration: team.is_eliminated ? 'line-through' : 'none' }}>{team.name}</span>
              {team.is_eliminated && <span className="badge badge-danger">OUT</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
              {team.phase1_total_score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
