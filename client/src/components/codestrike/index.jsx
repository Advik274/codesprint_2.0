import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { CountdownTimer } from '../shared/index.jsx';

const DIFF_COLORS = { easy: 'var(--accent)', medium: 'var(--warning)', hard: 'var(--danger)', extreme: 'var(--danger)' };
// Only languages the judge can actually compile and run
const LANGUAGES = [['python', 'Python'], ['cpp', 'C++'], ['java', 'Java']];
const LANGS_ALL = LANGUAGES.map(([k]) => k);

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
  const strict = app_state.event_config?.codestrike_strict_mode !== false;

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

      {strict && (
        <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, border: '1px solid var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>
          ⌨️ <strong>Type your solutions here — pasting is disabled.</strong> Leaving this tab is recorded as a violation, exactly like the earlier rounds. Work out your logic on paper if it helps.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {problems.map(p => (
          <ProblemCard key={p.id} problem={p} submittedAt={submitted[p.id]} strict={strict} />
        ))}
      </div>
    </div>
  );
}

// One problem: statement + samples + code box + submit
function ProblemCard({ problem: p, submittedAt, strict }) {
  // LeetCode-style: the team implements one function and the platform
  // supplies the driver, so the editor starts from the stub for the
  // chosen language rather than an empty box.
  const starterFor = (lang) => p.starters?.[lang] || '';
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState(() => starterFor('python'));
  const [runResult, setRunResult] = useState(null);
  const [running, setRunning] = useState(false);

  // Switching language swaps in that language's stub, unless they've
  // already written something they'd lose.
  const switchLanguage = (lang) => {
    const untouched = !code.trim() || LANGS_ALL.some(l => code.trim() === starterFor(l).trim());
    setLanguage(lang);
    if (untouched) setCode(starterFor(lang));
    setRunResult(null);
  };
  const [expanded, setExpanded] = useState(true);
  const [status, setStatus] = useState(null); // { ok, message }
  const [loading, setLoading] = useState(false);
  const [pasteWarning, setPasteWarning] = useState(false);
  const diffColor = DIFF_COLORS[p.difficulty] || 'var(--info)';

  // ── Typing telemetry ──────────────────────────────────────────
  // In strict mode the solution has to be written here, so we count
  // what the keyboard actually produced. Judges compare that against
  // the length of the submitted code: a 1200-character answer that
  // arrived with 40 keystrokes did not get typed, whatever the
  // explanation turns out to be.
  const stats = useRef({ keystrokes: 0, pasteBlocked: 0, firstKeyAt: null, lastKeyAt: null });
  const onKeyDown = (e) => {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    const s = stats.current;
    s.keystrokes += 1;
    const now = Date.now();
    if (!s.firstKeyAt) s.firstKeyAt = now;
    s.lastKeyAt = now;
  };
  const blockPaste = (e) => {
    if (!strict) return;
    e.preventDefault();
    stats.current.pasteBlocked += 1;
    setPasteWarning(true);
    setTimeout(() => setPasteWarning(false), 4000);
  };

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

  useEffect(() => {
    const socket = getSocket();
    const onRun = (d) => {
      if (d.problem_id && d.problem_id !== p.id) return;
      setRunning(false);
      setRunResult(d);
    };
    socket.on('codestrike:run_result', onRun);
    return () => socket.off('codestrike:run_result', onRun);
  }, [p.id]);

  const runSamples = () => {
    if (!code.trim()) return;
    setRunResult(null);
    setRunning(true);
    getSocket().emit('codestrike:run_samples', { problem_id: p.id, code, language });
    setTimeout(() => setRunning(false), 25000);
  };

  const submit = () => {
    if (!code.trim()) return;
    setStatus(null);
    setLoading(true);
    const s = stats.current;
    getSocket().emit('codestrike:submit_code', {
      problem_id: p.id, code, language,
      keystrokes: s.keystrokes,
      paste_blocked: s.pasteBlocked,
      typing_ms: s.firstKeyAt && s.lastKeyAt ? s.lastKeyAt - s.firstKeyAt : 0,
    });
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
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: strict ? 'var(--danger)' : 'var(--text3)' }}>
                {strict ? '⌨️ TYPE YOUR SOLUTION HERE — PASTING IS DISABLED' : 'PASTE YOUR FINAL CODE'}
              </div>
              <select value={language} onChange={e => switchLanguage(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}>
                {LANGUAGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value.slice(0, 20000))}
              onKeyDown={onKeyDown}
              onPaste={blockPaste}
              onDrop={blockPaste}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              placeholder={strict ? `Type your ${p.title} solution here...` : `Write/paste your ${p.title} solution here...`}
              rows={10}
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--bg3)', color: 'var(--text)', border: `1px solid ${pasteWarning ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 6, padding: 10, resize: 'vertical' }}
            />
            {pasteWarning && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
                🚫 Pasting is disabled in this round — type your solution. The attempt was recorded.
              </div>
            )}
            {status && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: status.ok ? 'var(--accent)' : 'var(--danger)', marginTop: 6 }}>
                {status.ok ? '✅' : '❌'} {status.message}
              </div>
            )}
            {runResult && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 6, border: `1px solid ${runResult.ok && runResult.passed === runResult.total ? 'var(--accent)' : 'var(--danger)'}`, background: 'var(--bg3)' }}>
                {runResult.available === false ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--warning)' }}>
                    ⚠️ The code runner is unavailable — you can still submit; a judge will review it manually.
                  </div>
                ) : runResult.stage === 'compile' ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>❌ Did not compile</div>
                    <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 160, overflowY: 'auto' }}>{runResult.error}</pre>
                  </>
                ) : runResult.stage === 'timeout' || runResult.stage === 'runtime' ? (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>
                      {runResult.stage === 'timeout' ? '⏱ Too slow' : '💥 Crashed'}
                    </div>
                    <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text2)', whiteSpace: 'pre-wrap', margin: 0, maxHeight: 160, overflowY: 'auto' }}>{runResult.error}</pre>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: runResult.passed === runResult.total ? 'var(--accent)' : 'var(--danger)', marginBottom: 8 }}>
                      {runResult.passed === runResult.total ? '✅' : '❌'} {runResult.passed}/{runResult.total} sample{runResult.total !== 1 ? 's' : ''} passed
                      {p.hidden_test_count > 0 && <span style={{ color: 'var(--text3)' }}> · {p.hidden_test_count} hidden test{p.hidden_test_count !== 1 ? 's' : ''} run on submit</span>}
                    </div>
                    {(runResult.results || []).map((r, i) => (
                      <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: r.passed ? 'var(--accent)' : 'var(--danger)', marginBottom: 3 }}>
                        {r.passed ? '✓' : '✗'} input <span style={{ color: 'var(--text2)' }}>{JSON.stringify(r.input)}</span>
                        {!r.passed && <> → expected <span style={{ color: 'var(--text)' }}>{r.expected}</span>, got <span style={{ color: 'var(--text)' }}>{r.got || '(nothing)'}</span></>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-ghost" onClick={runSamples} disabled={running || !code.trim()}
                style={{ flex: 1, padding: 12, fontSize: 13 }}>
                {running ? 'Running…' : '▶ Run Samples'}
              </button>
            </div>
            <button className="btn-primary" onClick={submit} disabled={loading || !code.trim()}
              style={{ width: '100%', padding: 12, fontSize: 14, marginTop: 8 }}>
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
