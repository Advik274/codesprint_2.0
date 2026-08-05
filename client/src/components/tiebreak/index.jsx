import { useState, useEffect } from 'react';
import { getSocket } from '../../hooks/useSocket';

// ── TieBreakOverlay — full-screen rapid-fire question ────────────
// Mounted on the team dashboard at all times; renders only while a
// tie-break involving THIS team is live (state.app_state.tiebreak is
// broadcast answer-stripped; the server grades and timestamps).
export function TieBreakOverlay({ teamId, state }) {
  const tb = state.app_state.tiebreak;
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null); // { correct, time_ms }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const onResult = (d) => { setLoading(false); setResult(d); };
    socket.on('tiebreak:answer_result', onResult);
    return () => socket.off('tiebreak:answer_result', onResult);
  }, []);

  // Reset local state when a new tie-break starts
  useEffect(() => { setAnswer(''); setResult(null); setLoading(false); }, [tb?.started_at]);

  if (!tb || !tb.team_ids?.includes(teamId)) return null;

  const alreadyAnswered = result || tb.answers?.some(a => a.team_id === teamId);
  const winner = tb.winner;

  const submit = () => {
    if (!answer.trim() || loading || alreadyAnswered) return;
    setLoading(true);
    getSocket().emit('tiebreak:answer', { answer });
    setTimeout(() => setLoading(false), 4000);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card card-lg" style={{ maxWidth: 560, width: '100%', border: '1px solid var(--warning)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--warning)', animation: 'glitch 3s infinite', marginBottom: 4 }}>
          ⚡ TIE-BREAKER
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 20 }}>
          Fastest correct answer wins. One shot per team — make it count.
        </div>

        <div style={{ fontSize: 18, lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-wrap' }}>
          {tb.question?.question}
        </div>

        {winner ? (
          <div style={{ padding: 20, border: `1px solid ${winner.team_id === teamId ? 'var(--accent)' : 'var(--danger)'}`, borderRadius: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>{winner.team_id === teamId ? '🏆' : '😤'}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: winner.team_id === teamId ? 'var(--accent)' : 'var(--danger)' }}>
              {winner.team_id === teamId ? 'YOU WIN THE TIE-BREAK!' : `${winner.team_name} TAKES IT`}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              Correct in {(winner.time_ms / 1000).toFixed(1)}s
            </div>
          </div>
        ) : alreadyAnswered ? (
          <div style={{ padding: 20 }}>
            {result?.correct === false ? (
              <>
                <div style={{ fontSize: 32 }}>❌</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>
                  Wrong answer — your shot is used. Waiting for the others...
                </div>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text3)' }}>
                Answer locked in — waiting for the result...
              </div>
            )}
          </div>
        ) : (
          <>
            <input
              type="text"
              autoFocus
              placeholder="Your answer..."
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 16, width: '100%', textAlign: 'center', marginBottom: 12 }}
            />
            <button className="btn-primary" onClick={submit} disabled={loading || !answer.trim()}
              style={{ width: '100%', padding: 14, fontSize: 15 }}>
              {loading ? 'Checking...' : '⚡ ANSWER NOW'}
            </button>
          </>
        )}

        {/* Who has buzzed */}
        {tb.answers?.length > 0 && !winner && (
          <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            {tb.answers.map(a => `${a.team_name}: ${a.correct ? '✅' : '❌'}`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
