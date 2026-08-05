import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ThemeToggle } from '../components/shared/index.jsx';

// Participant-facing copy for each phase — kept separate from the admin
// panel's phase labels since this is written for a first-time player, not
// someone running the event.
const PHASE_INFO = {
  phase1: {
    icon: '🧠', name: 'The Gauntlet', tagline: 'Individual speed & logic',
    body: 'A question appears on every screen at the same moment. Answer fast and correctly to score — the faster you submit a correct answer, the more points you get. After each round, the lowest scorers are eliminated. Survive all the rounds to advance.',
    tip: 'No googling, no asking outside your team. First submission counts — there\'s no second attempt per round.',
  },
  quiz_round: {
    icon: '📝', name: 'Timed Quiz', tagline: 'Everyone answers, together',
    body: 'Every member of your team gets the same set of questions and answers on their own device, within one shared timer for the whole team. Your team\'s score is the average across everyone who submits — so a team where everyone participates beats a team where one person carries.',
    tip: 'Submit before the timer runs out — once it ends, whatever you\'ve answered is final.',
  },
  bug_hunt: {
    icon: '🐛', name: 'Bug Hunt', tagline: 'Fix broken code, together',
    body: 'Your team receives a set of short programs in Java, C++ and Python — each one is broken. Read the code, find the syntax or logic error, and type the corrected line for each. One submission per team (one laptop), so debate before you lock it in. Marks per program for every correct fix.',
    tip: 'The comment markers in the code point at the neighbourhood of the bug — but write the FIX, not a description of it. Copy the line and correct it.',
  },
  code_strike: {
    icon: '⚔️', name: 'Code Strike', tagline: 'Three problems, one clock',
    body: 'Three programming problems drop at once — Easy, Medium, Hard, each worth more marks than the last. Write your solutions in any editor, then paste the final code into the platform per problem. Evaluators score correctness and efficiency; submitting earlier earns a time bonus. You can re-submit until time runs out, but the latest paste resets your submission time.',
    tip: 'Bank the Easy problem fast for the time bonus, then split the team across Medium and Hard. Test against the sample inputs before pasting.',
  },
  phase2: {
    icon: '🗺️', name: 'Campus Conquest', tagline: 'Battery is your life',
    body: 'Physically walk to a zone as a team, enter your passcode, and solve the challenge shown there to capture it. Your battery drains constantly in the background. Attempting a zone costs battery whether you win or lose; capturing one refills a chunk of it. Battery hits 0% — you\'re out.',
    tip: 'Once you capture a zone, set a defense challenge for it from your dashboard — other teams have to beat your trap to steal it back.',
  },
  phase3: {
    icon: '🏗️', name: 'Final Build', tagline: 'Build under pressure',
    body: 'A problem statement is revealed — your team has a few hours to build a working web app that solves it. Submit a live deployment link and your GitHub repo before time runs out. You can resubmit as many times as you want; only your last submission counts.',
    tip: 'Judged on UI, functionality, and how well you actually solved the stated problem — polish matters as much as features.',
  },
  speed_demo: {
    icon: '🎤', name: 'Speed Demo', tagline: 'Your moment on the big screen',
    body: 'Each team gets a short slot to demo what they built, live, on the projector. The audience votes for their favorite from the spectator screen — those votes add a bonus on top of the judges\' score.',
    tip: 'You\'ve got seconds, not minutes — lead with the thing that actually works.',
  },
};

const PHASE_ORDER = ['phase1', 'quiz_round', 'bug_hunt', 'code_strike', 'phase2', 'phase3', 'speed_demo'];

export default function Guide() {
  const { state } = useApp();
  const navigate = useNavigate();
  const cfg = state.app_state?.event_config || {};
  const eventName = cfg.event_name || 'CODE SPRINT 2.0';
  const collegeName = cfg.college_name || '';
  const enabled = cfg.phases_enabled || ['phase1', 'quiz_round', 'phase2', 'phase3'];
  const activePhases = PHASE_ORDER.filter(p => enabled.includes(p));

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 60 }}>
      <nav style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 13, padding: 0,
        }}>
          ← Back
        </button>
        <ThemeToggle />
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text3)', letterSpacing: '0.25em', marginBottom: 10 }}>
            HOW IT WORKS
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 44px)', color: 'var(--accent)', letterSpacing: '0.05em', marginBottom: 8 }}>
            {eventName}
          </h1>
          {collegeName && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)' }}>{collegeName}</div>}
        </div>

        <div className="card card-lg" style={{ marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>
            One event, {activePhases.length === 1 ? 'one battle' : `${activePhases.length} battles`}. Your team gets a 4-digit passcode at registration — that's your identity for the whole event, so keep it private. Join with it at the URL your coordinator gave you, on any phone or laptop with internet.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activePhases.map((key, i) => {
            const info = PHASE_INFO[key];
            return (
              <div key={key} className="card card-lg" style={{ display: 'flex', gap: 16 }}>
                <div style={{ flexShrink: 0, textAlign: 'center', width: 40 }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>{info.icon}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text3)' }}>{i + 1}</div>
                </div>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 2 }}>{info.name}</h2>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>
                    {info.tagline}
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, margin: '0 0 10px' }}>{info.body}</p>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', lineHeight: 1.6, borderLeft: '2px solid var(--border2)', paddingLeft: 10 }}>
                    💡 {info.tip}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 40, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.8 }}>
          Results are revealed live, worst to best — last place first, winner last.<br />
          Read the room. Drink water. Ctrl+Z doesn't work in real life. 🫡
        </div>

      </div>
    </div>
  );
}
