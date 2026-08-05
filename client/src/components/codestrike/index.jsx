import { useState, useEffect } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { CountdownTimer } from '../shared/index.jsx';

const DIFF_COLORS = { easy: 'var(--accent)', medium: 'var(--warning)', hard: 'var(--danger)' };
const LANGUAGES = ['python', 'java', 'cpp', 'c', 'javascript', 'other'];

// ── CodeStrikeRound — team view (Mission 3) ──────────────────────
// Problems revealed with a live timer. Teams write code in their own
// editor and paste the final version per problem. Re-submitting is
// allowed until the mission ends — the LAST paste counts, and its
// time sets the submission-time bonus.
export function CodeStrikeRound({ teamId, state }) {
  const { app_state } = state;
  const team = state.teams.find(t => t.id === teamId);
  const problems = app_state.codestrike_problems || [];
  const submitted = team?.codestrike_submitted || {};

  // Not started yet
  if (!app_state.codestrike_active && problems.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text3)' }}>
          ⚔️ Code Strike starting soon... Warm up your editors.
        </div>
      </div>
    );
  }

  // Ended
  if (!app_state.codestrike_active && problems.length > 0) {
    const judged = team?.codestrike_score !== null && team?.codestrike_score !== undefined;
    return (
      <div className="card card-lg" style={{ textAlign: 'center', padding: 40, border: '1px solid var(--purple)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏁</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--purple)', marginBottom: 8 }}>
          CODE STRIKE OVER
        </div>
        {judged ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--accent)', marginTop: 8 }}>{team.codestrike_score}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>MARKS</div>
          </>
        ) : (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>
            {Object.keys(submitted).length}/{problems.length} problems submitted · judging in progress...
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
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--purple)' }}>⚔️ CODE STRIKE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
            {Object.keys(submitted).length}/{problems.length} submitted · earlier submissions earn a time bonus
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {app_state.codestrike_timer_end && (
            <CountdownTimer endTime={app_state.codestrike_timer_end} paused={app_state.codestrike_paused} />
          )}
          {app_state.codestrike_paused && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)', padding: '4px 8px', border: '1px solid var(--warning)', borderRadius: 4 }}>
              ⏸ PAUSED
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {problems.map(p => (
          <ProblemCard key={p.id} problem={p} submittedAt={submitted[p.id]} />
        ))}
      </div>
    </div>
  );
}

// One problem: statement + samples + paste box + submit
function ProblemCard({ problem: p, submittedAt }) {
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [expanded, setExpanded] = useState(true);
  const [status, setStatus] = useState(null); // { ok, message }
  const [loading, setLoading] = useState(false);
  const diffColor = DIFF_COLORS[p.difficulty] || 'var(--info)';

  useEffect(() => {
    const socket = getSocket();
    const onResult = (d) => {
      if (d.problem_id && d.problem_id !== p.id) return;
      setLoading(false);
      if (d.ok) {
        setStatus({ ok: true, message: d.resubmit ? 'Re-submitted — this version counts now.' : 'Submitted! You can still re-submit until time runs out.' });
      } else {
        setStatus({ ok: false, message: d.message || 'Submission failed — try again.' });
      }
    };
    socket.on('codestrike:submit_result', onResult);
    return () => socket.off('codestrike:submit_result', onResult);
  }, [p.id]);

  const submit = () => {
    if (!code.trim()) return;
    setStatus(null);
    setLoading(true);
    getSocket().emit('codestrike:submit_code', { problem_id: p.id, code, language });
    setTimeout(() => setLoading(false), 4000);
  };

  return (
    <div className="card" style={{ border: `1px solid ${submittedAt ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}` }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: diffColor, border: `1px solid ${diffColor}`, borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase' }}>
            {p.difficulty} · {p.marks} marks
          </span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {submittedAt && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>✓ submitted</span>}
          <span style={{ color: 'var(--text3)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{p.statement}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>INPUT</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{p.input_format}</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>OUTPUT</div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{p.output_format}</div>
            </div>
          </div>

          {p.constraints && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
              Constraints: {p.constraints}
            </div>
          )}

          {(p.samples || []).map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, margin: 0, overflowX: 'auto' }}>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>SAMPLE INPUT {i + 1}{'\n'}</span>{s.input}
              </pre>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, margin: 0, overflowX: 'auto' }}>
                <span style={{ color: 'var(--text3)', fontSize: 10 }}>SAMPLE OUTPUT {i + 1}{'\n'}</span>{s.output}
              </pre>
            </div>
          ))}

          {/* Submission area */}
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>
                PASTE YOUR FINAL CODE
              </div>
              <select value={language} onChange={e => setLanguage(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value.slice(0, 20000))}
              placeholder={`Write/paste your ${p.title} solution here...`}
              rows={8}
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, resize: 'vertical' }}
            />
            {status && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: status.ok ? 'var(--accent)' : 'var(--danger)', marginTop: 6 }}>
                {status.ok ? '✅' : '❌'} {status.message}
              </div>
            )}
            <button className="btn-primary" onClick={submit} disabled={loading || !code.trim()}
              style={{ width: '100%', padding: 12, fontSize: 14, marginTop: 10 }}>
              {loading ? 'Submitting...' : submittedAt ? `Re-submit ${p.title}` : `Submit ${p.title}`}
            </button>
            {submittedAt && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
                Last submitted {new Date(submittedAt).toLocaleTimeString()} — re-submitting resets your submission time (later = smaller time bonus).
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
