import { useState, useEffect } from 'react';
import { getSocket } from '../../hooks/useSocket';
import { CountdownTimer } from '../shared/index.jsx';

const PROBLEM_STATEMENTS = [
  'Build a real-time feedback portal where users submit ratings and see live averages update instantly.',
  'Create a dynamic task manager with priority levels, deadlines, and team assignment features.',
  'Build a live campus event finder — events listed, users RSVP, capacity tracked in real time.',
  'Create a code snippet sharing app with syntax highlighting and a community upvote system.',
  'Build a team budget tracker — add expenses, categorize them, and show a visual breakdown.',
];

export function ProblemReveal({ problem, timerEnd }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRevealed(true), 400); return () => clearTimeout(t); }, []);

  return (
    <div className="card card-lg" style={{ border: '1px solid var(--info)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--info)', boxShadow: '0 0 16px var(--info)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--info)', letterSpacing: '0.15em', marginBottom: 6 }}>PHASE 3 — FINAL BUILD</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text)' }}>YOUR MISSION</h2>
        </div>
        <CountdownTimer endTime={timerEnd} label="Time Remaining" />
      </div>
      <div style={{ padding: '20px 24px', background: 'rgba(0,170,255,0.05)', border: '1px solid rgba(0,170,255,0.2)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 16, lineHeight: 1.8, color: 'var(--text)', opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateY(8px)', transition: 'all 0.5s ease', marginBottom: 16 }}>
        {problem}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[{ label: 'UI Design', weight: '30%', icon: '🎨' }, { label: 'Functionality', weight: '40%', icon: '⚙️' }, { label: 'Problem Fit', weight: '30%', icon: '🎯' }].map(c => (
          <div key={c.label} style={{ padding: '12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)' }}>{c.weight}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SubmissionForm({ teamId, teamName }) {
  const [deployUrl, setDeployUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // BUG FIX: socket.once could miss the event if socket reconnected.
  // Use a proper listener with cleanup + a 6s fallback timeout.
  const handleSubmit = () => {
    if (!deployUrl && !githubUrl) return;
    setLoading(true);
    setError('');
    const socket = getSocket();

    const onConfirmed = () => {
      setSubmitted(true);
      setLoading(false);
      clearTimeout(fallback);
      socket.off('phase3:submission_confirmed', onConfirmed);
    };

    // Fallback: if no ack in 6s, show error so team can retry
    const fallback = setTimeout(() => {
      socket.off('phase3:submission_confirmed', onConfirmed);
      setLoading(false);
      setError('No confirmation received. Check your connection and try again.');
    }, 6000);

    socket.on('phase3:submission_confirmed', onConfirmed);
    socket.emit('phase3:submit_project', { team_id: teamId, deploy_url: deployUrl, github_url: githubUrl, notes });
  };

  if (submitted) {
    return (
      <div className="card card-lg" style={{ textAlign: 'center', border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--accent)', marginBottom: 8 }}>SUBMITTED!</h2>
        <div style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{teamName} — project received by judges.</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {deployUrl && <a href={deployUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>🌐 Deployment</a>}
          {githubUrl && <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>📦 GitHub</a>}
        </div>
        <button className="btn-ghost" onClick={() => setSubmitted(false)} style={{ marginTop: 16 }}>Resubmit</button>
      </div>
    );
  }

  return (
    <div className="card card-lg">
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 20 }}>SUBMIT YOUR PROJECT</h3>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>🌐 Deployment URL</label>
        <input value={deployUrl} onChange={e => setDeployUrl(e.target.value)} placeholder="https://your-project.vercel.app" type="url" />
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Vercel, Netlify, Railway, or any live link</div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>📦 GitHub Repository URL</label>
        <input value={githubUrl} onChange={e => setGithubUrl(e.target.value)} placeholder="https://github.com/yourteam/project" type="url" />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>Notes to Judges</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key features, tech stack, what you built, what you'd improve..." rows={3} style={{ resize: 'vertical' }} />
      </div>
      <button className="btn-primary" onClick={handleSubmit} disabled={(!deployUrl && !githubUrl) || loading} style={{ width: '100%', padding: 14, fontSize: 16 }}>
        {loading ? '⏳ Submitting...' : '🚀 Submit Project'}
      </button>
      {loading && (
        <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
          Sending to server...
        </div>
      )}
      {error && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(255,51,85,0.1)', border: '1px solid rgba(255,51,85,0.4)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

export function JudgePanel({ teams, onScore }) {
  const [scores, setScores] = useState({});
  const submitted = teams.filter(t => t.phase3_submission);

  const setTeamScore = (teamId, field, value) => setScores(s => ({ ...s, [teamId]: { ...s[teamId], [field]: Number(value) } }));

  const submitScores = (teamId) => {
    const s = scores[teamId] || {};
    if (s.ui === undefined || s.functionality === undefined || s.problem_fit === undefined) return;
    onScore(teamId, s);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[['Submissions', submitted.length, 'var(--info)'], ['Judged', teams.filter(t => t.phase3_judge_scores).length, 'var(--accent)'], ['Pending', submitted.length - teams.filter(t => t.phase3_judge_scores).length, 'var(--warning)']].map(([l, v, c]) => (
          <div key={l} className="card" style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>{l}</div>
          </div>
        ))}
      </div>
      {submitted.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>Waiting for submissions...</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {submitted.map(team => {
          const s = scores[team.id] || {};
          const already = team.phase3_judge_scores;
          const total = s.ui !== undefined && s.functionality !== undefined && s.problem_fit !== undefined
            ? Math.round((s.ui * 0.3 + s.functionality * 0.4 + s.problem_fit * 0.3) * 10) : already?.total;
          return (
            <div key={team.id} className="card" style={{ border: `1px solid ${team.color}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{team.name}</span>
                  {already && <span className="badge badge-success">Scored: {already.total}</span>}
                </div>
                <a href={team.phase3_submission.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  View Project ↗
                </a>
              </div>
              {team.phase3_submission.notes && (
                <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, marginBottom: 12 }}>
                  {team.phase3_submission.notes}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                {[['ui', 'UI Design (30%)'], ['functionality', 'Functionality (40%)'], ['problem_fit', 'Problem Fit (30%)']].map(([key, label]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{label}</label>
                    <input type="number" min="0" max="10" value={s[key] ?? already?.[key] ?? ''} onChange={e => setTeamScore(team.id, key, e.target.value)} placeholder="0-10" style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700 }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn-primary" onClick={() => submitScores(team.id)} disabled={s.ui === undefined || s.functionality === undefined || s.problem_fit === undefined}>Submit Scores</button>
                {total !== undefined && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>→ {total}/100</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProblemSelector({ onReveal }) {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState(PROBLEM_STATEMENTS[0]);

  return (
    <div className="card card-lg" style={{ border: '1px solid var(--info)' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 16, color: 'var(--info)' }}>SELECT PROBLEM STATEMENT</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {PROBLEM_STATEMENTS.map((ps, i) => (
          <button key={i} onClick={() => { setSelected(ps); setCustom(''); }} style={{ textAlign: 'left', padding: '12px 16px', background: selected === ps && !custom ? 'rgba(0,170,255,0.1)' : 'var(--bg3)', border: `1px solid ${selected === ps && !custom ? 'var(--info)' : 'var(--border)'}`, borderRadius: 6, color: 'var(--text)', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.5 }}>
            {ps}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginBottom: 6, textTransform: 'uppercase' }}>Or custom:</label>
        <textarea value={custom} onChange={e => { setCustom(e.target.value); setSelected(''); }} placeholder="Type your own problem statement..." rows={3} />
      </div>
      <button className="btn-info" onClick={() => onReveal(custom || selected)} disabled={!custom && !selected} style={{ width: '100%', padding: 14, fontSize: 16 }}>
        🚀 Reveal Problem to All Teams
      </button>
    </div>
  );
}
