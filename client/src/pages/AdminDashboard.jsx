import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Navbar, ToastContainer, BatteryBar, CountdownTimer } from '../components/shared/index.jsx';
import { Phase1Leaderboard } from '../components/phase1/index.jsx';
import { getSocket } from '../hooks/useSocket';
import { useSound } from '../hooks/useSound';
import { useCountdown } from '../hooks/useTimer';
import { applyCustomTheme, DEFAULT_THEME } from '../hooks/useThemeColors';

const PROBLEMS = [
  'Build a real-time feedback portal where users submit ratings and see live averages.',
  'Create a task manager with priorities, deadlines, and team member assignment.',
  'Build a campus event finder — events listed, RSVP, capacity tracked live.',
  'Create a code snippet sharing app with syntax highlighting and upvotes.',
  'Build a team budget tracker with expense categories and visual breakdown.',
  'Build a simple quiz app where admin adds questions and participants answer live.',
  'Create a lost-and-found portal for your college campus with search and filters.',
  'Build a study group finder — students post subjects, others join groups.',
];

export default function AdminDashboard() {
  const { state, adminEmit: emit, addToast } = useApp();
  // Persist auth across refreshes using sessionStorage — a real server session
  // token, not the password itself (see /api/admin/login in server/index.js).
  const [authed, setAuthed] = useState(() =>
    sessionStorage.getItem('admin_authed') === '1' && sessionStorage.getItem('admin_role') === 'admin');
  const [pin, setPin] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [tab, setTab] = useState('setup');

  const [teamName, setTeamName] = useState('');
  const [teamYear, setTeamYear] = useState('2nd');
  const [teamMembers, setTeamMembers] = useState('');
  const [regMsg, setRegMsg] = useState('');

  const [zoneName, setZoneName] = useState('');
  const [zoneLocation, setZoneLocation] = useState('');

  const [eliminateCount, setEliminateCount] = useState(0);

  const [selectedProblem, setSelectedProblem] = useState(PROBLEMS[0]);
  const [customProblem, setCustomProblem] = useState('');
  const [problemTarget, setProblemTarget] = useState('all');
  const [problemMode, setProblemMode] = useState('individual'); // 'individual' | 'group'
  const [groupLabel, setGroupLabel] = useState('Group A');
  const [groupTeamIds, setGroupTeamIds] = useState([]); // selected team ids for group
  const [groupMsg, setGroupMsg] = useState('');

  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastType, setBroadcastType] = useState('info');
  const [teamSearch, setTeamSearch] = useState('');
  const [battOverride, setBattOverride] = useState({});
  const [problemMsg, setProblemMsg] = useState('');
  const [submissionCount, setSubmissionCount] = useState(0);

  // V7: Quiz tab state
  const [quizSubmitCount, setQuizSubmitCount] = useState(0);
  const [quizElimCount, setQuizElimCount] = useState(1);

  // V7: Custom questions form
  const [cqType, setCqType] = useState('mcq');
  const [cqQuestion, setCqQuestion] = useState('');
  const [cqOptions, setCqOptions] = useState(['', '', '', '']);
  const [cqAnswer, setCqAnswer] = useState('');
  const [cqPoints, setCqPoints] = useState(10);
  const [cqDifficulty, setCqDifficulty] = useState('easy');
  const [cqRoundMax, setCqRoundMax] = useState(5);
  const [cqMsg, setCqMsg] = useState('');

  // Bulk CSV import
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);

  const parseCSV = (raw) => {
    return raw.split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(line => {
        const cols = line.split(',').map(c => c.trim());
        const name = cols[0] || '';
        const year = cols[1]?.match(/^[123](st|nd|rd)?$/) ? `${cols[1].replace(/[^123]/,'')}${['','st','nd','rd'][+cols[1][0]]||'th'}` : (cols[1] || '1st');
        const members = cols.slice(2).filter(Boolean);
        return { name, year, members };
      }).filter(r => r.name);
  };

  const handleCSVChange = (val) => {
    setCsvText(val);
    setCsvPreview(parseCSV(val));
  };

  const importCSV = async () => {
    if (!csvPreview.length) return;
    setCsvImporting(true);
    const existingNames = state.teams.map(t => t.name.trim().toLowerCase());
    const toImport = csvPreview.filter(t => !existingNames.includes(t.name.trim().toLowerCase()));
    const skipped = csvPreview.length - toImport.length;
    for (const team of toImport) {
      emit('admin:register_team', { name: team.name, year: team.year, members: team.members });
      await new Promise(r => setTimeout(r, 300));
    }
    setCsvImporting(false);
    setCsvText('');
    setCsvPreview([]);
    addToast({ message: `✅ Imported ${toImport.length} teams${skipped ? ` · ${skipped} skipped (duplicate)` : ''}`, type: 'success' });
  };

  // Request all passcodes from server whenever admin authenticates or reconnects
  // MUST be before any early return — React rules of hooks forbid hooks after a conditional return
  useEffect(() => {
    if (!authed) return;
    getSocket().emit('admin:request_passcodes', { admin_token: sessionStorage.getItem('admin_session') || '' });
  }, [authed]);

  // Teams can now also appear from the self-registration QR, which the
  // admin never clicked — re-pull the passcode list whenever any team is
  // added so a self-registered team's code shows up immediately instead
  // of as a "—" until the page is refreshed.
  useEffect(() => {
    if (!authed) return;
    const socket = getSocket();
    const refresh = () => socket.emit('admin:request_passcodes', { admin_token: sessionStorage.getItem('admin_session') || '' });
    socket.on('team:new', refresh);
    return () => socket.off('team:new', refresh);
  }, [authed]);

  // If the currently open tab belongs to a phase that just got disabled in
  // Config, fall back to Setup instead of stranding the admin on a tab
  // that no longer exists. (Must live before the early return — hooks rule.)
  useEffect(() => {
    if (!authed) return;
    const enabled = state.app_state?.event_config?.phases_enabled || [];
    const sd = enabled.includes('speed_demo') || state.app_state?.event_config?.speed_demo_enabled;
    const visible = {
      zones: enabled.includes('phase2'),
      quiz: enabled.includes('quiz_round'),
      bughunt: enabled.includes('bug_hunt'),
      codestrike: enabled.includes('code_strike'),
      questions: enabled.includes('phase1') || enabled.includes('quiz_round'),
      phase3: enabled.includes('phase3'),
      demo: sd,
    };
    if (visible[tab] === false) setTab('setup');
  }, [authed, tab, state.app_state?.event_config]);

  // Alert chime whenever a new help request comes in — most important thing
  // an admin needs to notice while heads-down in another tab.
  const { play: playSound } = useSound();
  const prevHelpCount = useRef(0);
  useEffect(() => {
    const count = (state.help_requests || []).length;
    if (authed && count > prevHelpCount.current) playSound('alert');
    prevHelpCount.current = count;
  }, [state.help_requests, authed]);

  // Zone problem/answer visibility — pull-only (see server: never broadcast,
  // so answers can't leak to teams/zone operators). Refreshed whenever the
  // Zones tab is opened, plus a manual refresh button for mid-event use.
  const [zoneIntel, setZoneIntel] = useState({});
  useEffect(() => {
    if (!authed || tab !== 'zones') return;
    const socket = getSocket();
    const onIntel = ({ intel }) => {
      setZoneIntel(Object.fromEntries(intel.map(i => [i.zone_id, i])));
    };
    socket.on('admin:zone_intel', onIntel);
    socket.emit('admin:request_zone_intel', { admin_token: sessionStorage.getItem('admin_session') || '' });
    return () => socket.off('admin:zone_intel', onIntel);
  }, [authed, tab]);

  const doLogin = async () => {
    if (!pin || loggingIn) return;
    setLoggingIn(true); setLoginErr('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pin }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginErr(data.error || 'Login failed'); setLoggingIn(false); return; }
      if (data.role !== 'admin') { setLoginErr('That\'s the zone-operator password — full admin access needs the admin password.'); setLoggingIn(false); return; }
      sessionStorage.setItem('admin_session', data.token);
      sessionStorage.setItem('admin_role', data.role);
      sessionStorage.setItem('admin_authed', '1');
      setAuthed(true);
    } catch (e) {
      setLoginErr('Connection error — try again.');
    }
    setLoggingIn(false);
  };

  if (!authed) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="card card-lg" style={{ maxWidth:340, width:'90%', textAlign:'center' }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--accent)', marginBottom:20 }}>ADMIN ACCESS</div>
        <input value={pin} onChange={e=>setPin(e.target.value)} placeholder="Admin password" type="password" onKeyDown={e=>e.key==='Enter'&&doLogin()} style={{ textAlign:'center', marginBottom:12 }} autoFocus/>
        <button className="btn-primary" onClick={doLogin} disabled={!pin||loggingIn} style={{ width:'100%' }}>{loggingIn?'Checking...':'Enter'}</button>
        {loginErr&&<div style={{ color:'var(--danger)', marginTop:8, fontSize:13 }}>{loginErr}</div>}
      </div>
    </div>
  );

  const phase = state.app_state.current_phase;
  const passcodeCache = state.passcodeCache || {};

  const activeTeams = state.teams.filter(t=>!t.is_eliminated);
  const phases = ['setup','phase1','quiz_round','bug_hunt','code_strike','phase2','phase3','speed_demo','results'];

  // V7: Dynamic phase naming — ordinal position within phases_enabled (excluding speed_demo)
  const enabledPhaseKeys = state.app_state?.event_config?.phases_enabled || ['phase1','quiz_round','phase2','phase3'];
  // BUG FIX: a phase that isn't part of this event has no ordinal, and
  // this used to fall through to `return phaseKey` — so if the admin was
  // standing in a phase they'd since disabled in Config, the status bar
  // and journey chips displayed the raw internal key ("phase1"). Every
  // phase now has a human name to fall back on.
  const PHASE_NAMES = {
    setup: 'Setup', phase1: 'The Gauntlet', quiz_round: 'Quiz Round',
    bug_hunt: 'Bug Hunt', code_strike: 'Code Strike',
    phase2: 'Campus Conquest', phase3: 'Final Build',
    speed_demo: 'Speed Demo', results: 'Results',
  };
  function getPhaseLabel(phaseKey) {
    const ordered = ['phase1','quiz_round','bug_hunt','code_strike','phase2','phase3'];
    // CODE ARENA missions keep their names visible next to the ordinal
    const names = { bug_hunt: ' · Bug Hunt', code_strike: ' · Code Strike' };
    const active = ordered.filter(p => enabledPhaseKeys.includes(p));
    const idx = active.indexOf(phaseKey);
    if (idx !== -1) return `Phase ${idx + 1}${names[phaseKey] || ''}`;
    return PHASE_NAMES[phaseKey] || phaseKey;
  }

  const phaseLabels = {
    setup: 'Setup',
    phase1: getPhaseLabel('phase1'),
    quiz_round: getPhaseLabel('quiz_round'),
    bug_hunt: getPhaseLabel('bug_hunt'),
    code_strike: getPhaseLabel('code_strike'),
    phase2: getPhaseLabel('phase2'),
    phase3: getPhaseLabel('phase3'),
    speed_demo: 'Speed Demo',
    results: 'Results',
  };
  const phaseColors = { setup:'var(--text3)', phase1:'var(--warning)', quiz_round:'var(--info)', bug_hunt:'var(--danger)', code_strike:'var(--purple)', phase2:'var(--accent)', phase3:'var(--info)', speed_demo:'var(--purple)', results:'var(--purple)' };
  const enabledPhases = ['setup', ...enabledPhaseKeys, 'results'];
  // UX FIX: the Control tab's phase journey only shows the rounds THIS
  // event actually runs (in canonical order) — not every phase that
  // exists. If the admin is somehow standing in a disabled phase, it's
  // kept visible so the journey never lies about where they are.
  const journey = phases.filter(p =>
    enabledPhases.includes(p)
    || p === phase
    || (p === 'speed_demo' && state.app_state?.event_config?.speed_demo_enabled)
  );
  const journeyIdx = journey.indexOf(phase);
  // nextPhase skips phases not in enabledPhases
  const nextPhase = (() => {
    let idx = phases.indexOf(phase) + 1;
    while (idx < phases.length) {
      if (enabledPhases.includes(phases[idx])) return phases[idx];
      idx++;
    }
    return null;
  })();

  const registerTeam = () => {
    if (!teamName.trim()) return;
    emit('admin:register_team', { name:teamName.trim(), year:teamYear, members:teamMembers.split(',').map(m=>m.trim()).filter(Boolean) });
    setRegMsg('⏳ Registering...');
    // Response comes via state:sync — just show confirmation after brief delay
    setTimeout(() => {
      const found = state.teams.slice(-1)[0];
      setTeamName(''); setTeamMembers('');
      setRegMsg('✅ Team registered! Check teams list below for the passcode.');
      setTimeout(() => setRegMsg(''), 6000);
    }, 600);
  };

  // UX FIX: tabs for phases that aren't part of this event are hidden —
  // a CODE ARENA admin shouldn't be scanning past Zones / Phase 3 / Demo
  // tabs that do nothing for their event. Enabling a phase in Config
  // brings its tab back instantly.
  const speedDemoOn = enabledPhaseKeys.includes('speed_demo') || state.app_state?.event_config?.speed_demo_enabled;
  const tabs = [
    { key:'config',    label:'⚙️ Config' },
    { key:'theme',     label:'🎨 Theme' },
    { key:'setup',     label:'🏗️ Setup' },
    { key:'control',   label:'🎮 Control' },
    { key:'teams',     label:`👥 Teams (${state.teams.length})` },
    { key:'zones',     label:'🗺️ Zones', show: enabledPhaseKeys.includes('phase2') },
    { key:'quiz',      label:`🧠 Quiz${state.app_state?.quiz_round_active ? ' 🔴' : ''}`, show: enabledPhaseKeys.includes('quiz_round') },
    { key:'bughunt',   label:`🐛 Bug Hunt${state.app_state?.bughunt_active ? ' 🔴' : ''}`, show: enabledPhaseKeys.includes('bug_hunt') },
    { key:'codestrike',label:`⚔️ Code Strike${state.app_state?.codestrike_active ? ' 🔴' : ''}`, show: enabledPhaseKeys.includes('code_strike') },
    { key:'tiebreak',  label:`⚡ Tie-Break${state.app_state?.tiebreak?.active ? ' 🔴' : ''}` },
    { key:'questions', label:`❓ Questions (${(state.app_state?.event_config?.custom_questions||[]).length})`, show: enabledPhaseKeys.includes('phase1') || enabledPhaseKeys.includes('quiz_round') },
    { key:'phase3',    label:'🏗️ Phase 3', show: enabledPhaseKeys.includes('phase3') },
    { key:'demo',      label:'🎤 Demo', show: speedDemoOn },
    { key:'analytics', label:'📈 Analytics' },
    { key:'qr',        label:'📱 QR & Cards' },
    { key:'results',   label:'🏆 Results' },
    { key:'backup',    label:'💾 Backup' },
    { key:'danger',    label:'⚠️ Reset' },
    { key:'log',       label:'📋 Log' },
  ].filter(t => t.show !== false);

  // UX FIX: advancing the phase while a round is still LIVE used to
  // silently destroy its scores (e.g. leaving quiz_round mid-quiz means
  // scores are never calculated). Warn with the consequence spelled out.
  const liveBlocker =
    state.app_state.quiz_round_active ? 'The QUIZ is still LIVE — End & Score it first or every team gets 0' :
    state.app_state.bughunt_active ? 'BUG HUNT is still LIVE — End & Grade it first or the fixes are never marked' :
    state.app_state.codestrike_active ? 'CODE STRIKE is still LIVE — End it first to lock submissions' :
    state.app_state.tiebreak?.active ? 'A TIE-BREAK is still LIVE — wait for the winner or clear it' : null;

  // UX FIX: one always-current "what do I do next" hint for the Control
  // tab — the run-of-show without needing the manual open on a phone.
  const nextStep = (() => {
    const s = state.app_state;
    if (phase === 'setup') {
      if (state.teams.length === 0) return { msg: 'Start by registering teams — one by one or via Bulk CSV Import.', tab: 'setup', btn: 'Go to Setup' };
      return { msg: `${state.teams.length} team${state.teams.length!==1?'s':''} registered. Print passcode cards, then advance when everyone is seated.`, tab: 'qr', btn: 'Passcode Cards' };
    }
    if (phase === 'quiz_round') {
      if (s.quiz_round_active) return { msg: 'Quiz is LIVE — watch submissions, then End & Score before advancing.', tab: 'quiz', btn: 'Quiz Controls' };
      const scored = state.teams.some(t => t.quiz_member_scores && Object.keys(t.quiz_member_scores).length > 0);
      if (!scored) return { msg: 'Phase is set — now start the quiz itself from the Quiz tab.', tab: 'quiz', btn: 'Start Quiz' };
      return { msg: 'Quiz scored ✔ Optionally eliminate bottom teams, then advance.', tab: 'quiz', btn: 'Quiz Scores' };
    }
    if (phase === 'bug_hunt') {
      if (s.bughunt_active) return { msg: 'Bug Hunt is LIVE — End & Grade from its tab when time is up.', tab: 'bughunt', btn: 'Bug Hunt Controls' };
      const graded = state.teams.some(t => t.bughunt_score !== null && t.bughunt_score !== undefined);
      if (!graded) return { msg: 'Phase is set — start the Bug Hunt itself from its tab.', tab: 'bughunt', btn: 'Start Bug Hunt' };
      return { msg: 'Bug Hunt graded ✔ Review fixes / override marks, then advance.', tab: 'bughunt', btn: 'Review Fixes' };
    }
    if (phase === 'code_strike') {
      if (s.codestrike_active) return { msg: 'Code Strike is LIVE — End it from its tab when time is up.', tab: 'codestrike', btn: 'Code Strike Controls' };
      if ((s.codestrike_problems || []).length === 0) return { msg: 'Phase is set — start Code Strike to reveal the 3 problems.', tab: 'codestrike', btn: 'Start Code Strike' };
      return { msg: 'Submissions locked ✔ Judge each team, then advance to Results.', tab: 'codestrike', btn: 'Judge Panel' };
    }
    if (phase === 'phase1') return s.phase1_round_active
      ? { msg: 'Round LIVE — End + Eliminate below when the timer runs out.' }
      : { msg: 'Start the next round below, or advance when the Gauntlet is done.' };
    if (phase === 'phase2') return { msg: 'Zone capture running — watch zones and batteries; advance when time is up.', tab: 'zones', btn: 'Zones' };
    if (phase === 'phase3') return { msg: 'Assign / reveal problems and judge submissions in the Phase 3 tab.', tab: 'phase3', btn: 'Phase 3' };
    if (phase === 'speed_demo') return { msg: 'Run each team\'s demo slot from the Demo tab; audience votes on Spectator.', tab: 'demo', btn: 'Demo' };
    if (phase === 'results') return { msg: 'Reveal results below (worst → best). Totals tied? Fire a Tie-Break. Finish with the Thank You page.', tab: 'tiebreak', btn: 'Tie-Break' };
    return null;
  })();

  return (
    <div style={{ minHeight:'100vh', paddingBottom:40 }}>
      <Navbar title="ADMIN PANEL"/>
      <ToastContainer/>

      <div style={{ maxWidth:960, margin:'0 auto', padding:'16px' }}>

        {/* Status bar — 4th cell is contextual: live state of whatever
            round the current phase runs (was hardcoded to phase1 "/5") */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            ['Phase', phaseLabels[phase], phaseColors[phase]],
            ['Active', activeTeams.length, 'var(--accent)'],
            ['Zones', `${state.zones.filter(z=>z.owner_team_id).length}/${state.zones.length}`, 'var(--info)'],
            (() => {
              const s = state.app_state;
              if (phase==='phase1') return ['Round', `${s.phase1_round}/${s.event_config?.phase1_rounds ?? 5}`, 'var(--warning)'];
              if (phase==='quiz_round') return ['Quiz', s.quiz_round_active ? (s.quiz_paused ? '⏸ PAUSED' : '● LIVE') : 'idle', s.quiz_round_active ? (s.quiz_paused ? 'var(--warning)' : 'var(--danger)') : 'var(--text3)'];
              if (phase==='bug_hunt') return ['Bug Hunt', s.bughunt_active ? (s.bughunt_paused ? '⏸ PAUSED' : '● LIVE') : 'idle', s.bughunt_active ? (s.bughunt_paused ? 'var(--warning)' : 'var(--danger)') : 'var(--text3)'];
              if (phase==='code_strike') return ['Code Strike', s.codestrike_active ? (s.codestrike_paused ? '⏸ PAUSED' : '● LIVE') : 'idle', s.codestrike_active ? (s.codestrike_paused ? 'var(--warning)' : 'var(--danger)') : 'var(--text3)'];
              if (phase==='results') return ['Revealed', `${(s.results_reveal_index ?? -1) + 1}`, 'var(--purple)'];
              return ['Round', '—', 'var(--text3)'];
            })(),
          ].map(([l,v,c])=>(
            <div key={l} className="card" style={{ textAlign:'center', padding:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:20, fontWeight:700, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* ── ALWAYS-VISIBLE ALERTS — every tab, not just Control ──
            UX FIX: help requests played a chime but were only rendered in
            the Control tab; an admin heads-down judging Code Strike never
            saw them. Same for the master-pause state. */}
        {(state.help_requests||[]).length > 0 && (
          <div style={{ border:'2px solid var(--warning)', borderRadius:8, padding:'14px 20px', background:'color-mix(in srgb, var(--warning) 8%, transparent)', marginBottom:16 }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:15, color:'var(--warning)', marginBottom:10 }}>
              🆘 {state.help_requests.length} TEAM{state.help_requests.length!==1?'S':''} NEED HELP
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {state.help_requests.map(h=>(
                <div key={h.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--bg3)', borderRadius:6 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:h.team_color }}/>
                  <div style={{ flex:1 }}>
                    <span style={{ fontFamily:'var(--font-display)', fontSize:14 }}>{h.team_name}</span>
                    <span style={{ marginLeft:8, fontSize:11, color:'var(--text3)' }}>{h.phase} · {new Date(h.created_at).toLocaleTimeString()}</span>
                    {h.message && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{h.message}</div>}
                  </div>
                  <button className="btn-primary" onClick={()=>emit('admin:resolve_help',{help_id:h.id})} style={{ padding:'6px 14px', fontSize:12 }}>✓ Resolved</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {state.app_state.master_paused && (
          <div style={{ border:'2px solid var(--warning)', borderRadius:8, padding:'14px 20px', background:'color-mix(in srgb, var(--warning) 8%, transparent)', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:16, color:'var(--warning)' }}>⏸ EVENT PAUSED</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginTop:2 }}>{state.app_state.master_pause_reason}</div>
            </div>
            <button className="btn-primary" onClick={()=>emit('admin:master_resume',{})} style={{ padding:'12px 28px', fontSize:16, animation:'pulse-accent 1s infinite' }}>
              ▶️ RESUME EVENT
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' }}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:'7px 14px', borderRadius:6, background:tab===t.key?'var(--bg3)':'transparent', border:`1px solid ${tab===t.key?'var(--border2)':'transparent'}`, color:tab===t.key?'var(--text)':'var(--text3)', fontFamily:'var(--font-mono)', fontSize:11 }}>{t.label}</button>
          ))}
        </div>

        {/* ── SETUP ─────────────────────────────────────────────── */}
        {/* ── CONFIG TAB ───────────────────────────────────────── */}
        {tab==='config'&&(
          <ConfigTab state={state} emit={emit} />
        )}

        {/* ── THEME TAB ────────────────────────────────────────── */}
        {tab==='theme'&&(
          <ThemeTab state={state} emit={emit} />
        )}

        {tab==='setup'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* ── 🔒 PROTECTED MODE toggle ─────────────────────── */}
            {(()=>{
              const pmOn = !!state.app_state?.event_config?.protected_mode;
              return (
                <div className="card card-lg" style={{ border:`1px solid ${pmOn?'var(--danger)':'var(--border)'}`, background:pmOn?'color-mix(in srgb, var(--danger) 4%, transparent)':undefined }}>
                  <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:260 }}>
                      <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, color:pmOn?'var(--danger)':'var(--text2)', marginBottom:6 }}>
                        {pmOn?'🔒':'🔓'} PROTECTED MODE {pmOn?'— ACTIVE':''}
                      </h2>
                      <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>
                        During timed rounds (quiz, Bug Hunt, tie-breaks) every team browser blocks copy/paste and right-click, and <strong>every tab or app switch is recorded and reported here instantly</strong> with a per-team violation counter. Code Strike is exempt — teams must switch to their editor there.
                      </div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginTop:6 }}>
                        ⚠️ A browser can't see a second phone under the desk — keep volunteers walking the room. This catches and logs what happens on the event device.
                      </div>
                    </div>
                    <button
                      onClick={()=>{ if(pmOn || confirm('Enable Protected Mode? All teams get a lockdown banner; tab switches and copy/paste during timed rounds will be recorded as violations.')) emit('admin:set_protected_mode',{enabled:!pmOn}); }}
                      className={pmOn?'btn-danger':'btn-primary'}
                      style={{ padding:'14px 26px', fontSize:15, flexShrink:0 }}>
                      {pmOn?'🔓 Disable':'🔒 Enable Protected Mode'}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── 📝 SELF-REGISTRATION (QR) ─────────────────────── */}
            {(()=>{
              const srOn = !!state.app_state?.event_config?.self_registration;
              const regUrl = `${window.location.origin}/register`;
              return (
                <div className="card card-lg" style={{ border:`1px solid ${srOn?'var(--accent)':'var(--border)'}` }}>
                  <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>
                    <div style={{ flex:1, minWidth:260 }}>
                      <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, color:srOn?'var(--accent)':'var(--text2)', marginBottom:6 }}>
                        {srOn?'📝':'🔒'} TEAM SELF-REGISTRATION {srOn?'— OPEN':''}
                      </h2>
                      <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:10 }}>
                        Project or print the QR — a team leader scans it, fills in their team name, year and members,
                        and gets a passcode instantly. Teams appear in your list below as they register.
                        This runs <strong>alongside</strong> manual registration; both still work.
                      </div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:12, wordBreak:'break-all' }}>
                        {regUrl}
                      </div>
                      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                        <button
                          onClick={()=>emit('admin:set_self_registration',{ enabled: !srOn })}
                          className={srOn?'btn-danger':'btn-primary'}
                          style={{ padding:'12px 22px', fontSize:14 }}>
                          {srOn?'🔒 Close Registration':'📝 Open Registration'}
                        </button>
                        <a href="/register" target="_blank" rel="noreferrer" className="btn-ghost"
                          style={{ padding:'12px 18px', fontSize:12, textDecoration:'none', display:'inline-block' }}>
                          Preview page ↗
                        </a>
                        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>
                          {state.teams.length} team{state.teams.length!==1?'s':''} registered
                        </span>
                      </div>
                      {!srOn && (
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:8 }}>
                          Closed by default. Open it at the desk, close it once everyone is in.
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign:'center', flexShrink:0, opacity: srOn?1:0.35 }}>
                      <QRImage text={regUrl} size={150} />
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:srOn?'var(--accent)':'var(--text3)' }}>
                        {srOn?'SCAN TO REGISTER':'CLOSED'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="card card-lg">
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:16, color:'var(--warning)' }}>TEAM REGISTRATION</h2>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Team Name *</label>
                  <input value={teamName} onChange={e=>setTeamName(e.target.value)} placeholder="e.g. Team Alpha" onKeyDown={e=>e.key==='Enter'&&registerTeam()}/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Year</label>
                  <select value={teamYear} onChange={e=>setTeamYear(e.target.value)}>
                    <option value="1st">1st Year</option>
                    <option value="2nd">2nd Year</option>
                    <option value="3rd">3rd Year</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Members (comma separated)</label>
                <input value={teamMembers} onChange={e=>setTeamMembers(e.target.value)} placeholder="Alice, Bob, Charlie"/>
              </div>
              <button className="btn-primary" onClick={registerTeam} disabled={!teamName.trim()} style={{ width:'100%' }}>Register + Auto-Generate Passcode</button>
              {regMsg&&<div style={{ marginTop:10, padding:'10px 14px', background:'color-mix(in srgb, var(--accent) 10%, transparent)', border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>{regMsg}</div>}
            </div>

            {/* ── BULK CSV IMPORT ─────────────────────────────── */}
            <div className="card card-lg" style={{ border:'1px solid var(--info)' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:6, color:'var(--info)' }}>📋 BULK CSV IMPORT</h2>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:12 }}>
                Format: <code style={{ background:'var(--bg3)', padding:'2px 6px', borderRadius:3 }}>Team Name, Year, Member1, Member2, ...</code> — one team per line
              </div>
              <textarea
                value={csvText}
                onChange={e => handleCSVChange(e.target.value)}
                placeholder={"Alpha Squad, 2, Alice, Bob, Charlie\nBeta Force, 1, Dave, Eve\nGamma Team, 3, Frank, Grace, Henry"}
                rows={5}
                style={{ width:'100%', fontFamily:'var(--font-mono)', fontSize:13, resize:'vertical', boxSizing:'border-box' }}
              />
              {csvPreview.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:8, textTransform:'uppercase' }}>
                    Preview — {csvPreview.length} team{csvPreview.length!==1?'s':''}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:12 }}>
                    {csvPreview.map((t, i) => (
                      <div key={i} style={{ display:'flex', gap:10, padding:'6px 10px', borderRadius:5, background:'var(--bg3)', fontFamily:'var(--font-mono)', fontSize:12 }}>
                        <span style={{ color:'var(--info)', minWidth:20 }}>{i+1}.</span>
                        <span style={{ color:'var(--text)', fontWeight:600 }}>{t.name}</span>
                        <span style={{ color:'var(--text3)' }}>{t.year} year</span>
                        {t.members.length>0&&<span style={{ color:'var(--text3)' }}>· {t.members.join(', ')}</span>}
                      </div>
                    ))}
                  </div>
                  <button className="btn-info" onClick={importCSV} disabled={csvImporting} style={{ width:'100%', padding:12, fontSize:14 }}>
                    {csvImporting ? `⏳ Importing...` : `⚡ Import ${csvPreview.length} Teams`}
                  </button>
                </div>
              )}
              {!csvText && (
                <div style={{ marginTop:8, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>
                  Year accepts: 1, 2, 3 (or 1st, 2nd, 3rd). Members are optional. Passcodes auto-generated.
                </div>
              )}
            </div>

            {state.teams.length>0&&(
              <div className="card">
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>TEAMS ({state.teams.length})</h3>
                {state.teams.map(t=>(
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:t.color }}/>
                    <div style={{ flex:1 }}>
                      <span style={{ fontFamily:'var(--font-display)', fontSize:14 }}>{t.name}</span>
                      <span style={{ marginLeft:8, fontSize:11, color:'var(--text3)' }}>{t.year} · {t.members?.join(', ')||'—'}</span>
                    </div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:700, color:'var(--accent)', letterSpacing:'0.3em' }}>{passcodeCache[t.id] || "—"}</div>
                    <button onClick={()=>emit('admin:delete_team',{team_id:t.id})} style={{ background:'none', border:'none', color:'var(--danger)', fontSize:18, cursor:'pointer', padding:'0 6px' }}>×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Zones only matter for Campus Conquest — hidden otherwise */}
            {enabledPhaseKeys.includes('phase2') && (<>
            <div className="card card-lg">
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:16, color:'var(--info)' }}>ZONE SETUP</h2>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Zone Name *</label>
                  <input value={zoneName} onChange={e=>setZoneName(e.target.value)} placeholder="e.g. CS Lab Block"/>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Location</label>
                  <input value={zoneLocation} onChange={e=>setZoneLocation(e.target.value)} placeholder="e.g. Block A, Ground Floor"/>
                </div>
              </div>
              <button className="btn-info" onClick={()=>{ emit('admin:create_zone',{name:zoneName,location:zoneLocation}); setZoneName(''); setZoneLocation(''); }} disabled={!zoneName.trim()} style={{ width:'100%' }}>Add Zone</button>
            </div>

            {state.zones.length>0&&(
              <div className="card">
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>ZONES ({state.zones.length})</h3>
                {state.zones.map((z,i)=>(
                  <div key={z.id} style={{ display:'flex', gap:12, padding:'8px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', width:24 }}>Z{i+1}</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:14, fontWeight:500 }}>{z.name}</span>
                      {z.location&&<span style={{ marginLeft:8, fontSize:11, color:'var(--text3)' }}>{z.location}</span>}
                    </div>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>{z.id}</span>
                    <button onClick={()=>emit('admin:delete_zone',{zone_id:z.id})} style={{ background:'none', border:'none', color:'var(--danger)', fontSize:16, cursor:'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            </>)}
          </div>
        )}

        {/* ── CONTROL ───────────────────────────────────────────── */}
        {tab==='control'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* ── NEXT STEP — state-aware run-of-show guidance ── */}
            {nextStep && (
              <div style={{ border:'1px solid var(--accent)', borderRadius:8, padding:'12px 18px', background:'color-mix(in srgb, var(--accent) 6%, transparent)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', letterSpacing:'0.15em', flexShrink:0 }}>NEXT STEP</div>
                <div style={{ flex:1, fontSize:13, color:'var(--text)', minWidth:220 }}>{nextStep.msg}</div>
                {nextStep.tab && (
                  <button className="btn-ghost" onClick={()=>setTab(nextStep.tab)} style={{ fontSize:12, padding:'6px 14px', color:'var(--accent)', borderColor:'var(--accent)' }}>
                    {nextStep.btn} →
                  </button>
                )}
              </div>
            )}

            {!state.app_state.master_paused && (
              <button className="btn-warning" onClick={()=>{ const r=prompt('Pause reason (shown to all teams):','Technical issue'); if(r!==null) emit('admin:master_pause',{reason:r}); }} style={{ width:'100%', padding:14, fontSize:15 }}>
                ⏸ EMERGENCY PAUSE — freeze everything
              </button>
            )}
            <div className="card card-lg">
              <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
                {journey.map((p,i)=>(
                  <div key={p} style={{ padding:'4px 14px', borderRadius:4, background:p===phase?`${phaseColors[p]}22`:i<journeyIdx?'color-mix(in srgb, var(--accent) 6%, transparent)':'var(--bg3)', border:`1px solid ${p===phase?phaseColors[p]:i<journeyIdx?'color-mix(in srgb, var(--accent) 30%, transparent)':'var(--border)'}`, color:p===phase?phaseColors[p]:i<journeyIdx?'var(--accent)':'var(--text3)', fontFamily:'var(--font-mono)', fontSize:11 }}>
                    {i<journeyIdx?'✓ ':p===phase?'● ':'○ '}{phaseLabels[p]}
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
                {nextPhase&&<button className="btn-primary" onClick={()=>{
                  const msg = liveBlocker
                    ? `⚠️ ${liveBlocker}.\n\nAdvance to ${phaseLabels[nextPhase]} anyway?`
                    : `Advance to ${phaseLabels[nextPhase]}?`;
                  if(confirm(msg)) emit('admin:start_phase',{phase:nextPhase});
                }} style={{ fontSize:15, padding:'12px 28px', ...(liveBlocker?{filter:'saturate(0.6)'}:{}) }}>▶ Advance to {phaseLabels[nextPhase]}{liveBlocker?' ⚠️':''}</button>}
                {(state.phase_history_count > 0) && (
                  <button className="btn-ghost" onClick={()=>{ if(confirm('Roll back to previous phase? Team scores/zones will be restored to before that transition.')) emit('admin:rollback_phase',{}); }} style={{ fontSize:13, padding:'10px 18px', color:'var(--warning)', borderColor:'var(--warning)' }}>
                    ⏪ Roll Back Phase
                  </button>
                )}
                {phase==='phase1'&&<>
                  <button className="btn-warning" onClick={()=>emit('admin:next_round',{})} disabled={state.app_state.phase1_round_active||state.app_state.phase1_round>=(state.app_state.event_config?.phase1_rounds??5)}>⚡ Start Round {state.app_state.phase1_round+1} / {state.app_state.event_config?.phase1_rounds??5}</button>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', padding:'4px 10px', background:'var(--bg3)', borderRadius:4, border:'1px solid var(--border)' }}>
                      👥 {activeTeams.length} active
                    </div>
                    <input type="number" min="0" max={activeTeams.length-1} value={eliminateCount} onChange={e=>setEliminateCount(e.target.value)} style={{ width:70 }} placeholder="# elim"/>
                    <button className="btn-danger" onClick={()=>{ if(confirm(`End round and eliminate ${eliminateCount}?`)) emit('admin:end_round',{eliminate_count:eliminateCount}); }} disabled={!state.app_state.phase1_round_active}>End + Eliminate {eliminateCount}</button>
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>max {Math.max(0, activeTeams.length-1)}</span>
                  </div>
                </>}
              </div>
              {phase==='phase2'&&(
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:10 }}>
                  {!state.app_state.phase2_paused ? (
                    <button className="btn-warning" onClick={()=>{ if(confirm('Pause Phase 2? Battery drain will stop and timer will freeze.')) emit('admin:pause_phase2',{}); }} style={{ fontSize:14 }}>
                      ⏸️ Pause Phase 2
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={()=>emit('admin:resume_phase2',{})} style={{ fontSize:14, animation:'pulse-accent 1s infinite' }}>
                      ▶️ Resume Phase 2
                    </button>
                  )}
                  {state.app_state.phase2_paused && (
                    <div style={{ padding:'8px 14px', background:'color-mix(in srgb, var(--warning) 15%, transparent)', border:'1px solid var(--warning)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--warning)', display:'flex', alignItems:'center' }}>
                      ⏸️ PAUSED — battery drain stopped
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <button className="btn-ghost" onClick={()=>{ const amt=prompt('Refill all batteries by how much %?','20'); if(amt) emit('admin:refill_all_batteries',{amount:amt}); }} style={{ fontSize:12 }}>
                      🔋 Refill All Batteries
                    </button>
                    <button className="btn-ghost" onClick={()=>emit('admin:adjust_timer',{phase:'phase2',delta_min:15})} style={{ fontSize:12 }}>+15 min</button>
                    <button className="btn-ghost" onClick={()=>emit('admin:adjust_timer',{phase:'phase2',delta_min:-15})} style={{ fontSize:12 }}>−15 min</button>
                  </div>
                </div>
              )}

              {phase==='phase3'&&(
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:10 }}>
                  {!state.app_state.phase3_paused ? (
                    <button className="btn-warning" onClick={()=>emit('admin:pause_phase3',{})} style={{ fontSize:14 }}>
                      ⏸️ Pause Phase 3 Timer
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={()=>emit('admin:resume_phase3',{})} style={{ fontSize:14, animation:'pulse-accent 1s infinite' }}>
                      ▶️ Resume Phase 3 Timer
                    </button>
                  )}
                  {state.app_state.phase3_paused && (
                    <div style={{ padding:'8px 14px', background:'color-mix(in srgb, var(--warning) 15%, transparent)', border:'1px solid var(--warning)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--warning)' }}>
                      ⏸️ TIMER PAUSED
                    </div>
                  )}
                  <button className="btn-ghost" onClick={()=>emit('admin:adjust_timer',{phase:'phase3',delta_min:15})} style={{ fontSize:12 }}>+15 min</button>
                  <button className="btn-ghost" onClick={()=>emit('admin:adjust_timer',{phase:'phase3',delta_min:-15})} style={{ fontSize:12 }}>−15 min</button>
                </div>
              )}
                {phase==='bug_hunt'&&(
                  <div style={{ padding:'10px 14px', background:'color-mix(in srgb, var(--danger) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--danger) 30%, transparent)', borderRadius:6, marginTop:10, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--danger)' }}>
                    🐛 Bug Hunt phase — start, pause, grade and override marks in the <strong>Bug Hunt</strong> tab.
                  </div>
                )}
                {phase==='code_strike'&&(
                  <div style={{ padding:'10px 14px', background:'color-mix(in srgb, var(--purple) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--purple) 30%, transparent)', borderRadius:6, marginTop:10, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--purple)' }}>
                    ⚔️ Code Strike phase — start, view code and judge in the <strong>Code Strike</strong> tab.
                  </div>
                )}
                {phase==='phase1' && (
                  <Phase1RoundStatus state={state} />
                )}
                {state.app_state.current_question && (
                  <div style={{ padding:'12px 16px', background:'color-mix(in srgb, var(--warning) 10%, transparent)', border:'1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius:6, marginTop:10 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--warning)', marginBottom:4 }}>ACTIVE QUESTION — Round {state.app_state.phase1_round}</div>
                    <div style={{ fontSize:14, marginBottom:4 }}>{state.app_state.current_question.question}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)' }}>Answer: {state.app_state.current_question.answer}</div>
                  </div>
                )}
            </div>

            <div className="card">
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>BROADCAST</h3>
              <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                {['info','success','warning','danger'].map(t=>(
                  <button key={t} onClick={()=>setBroadcastType(t)} style={{ padding:'4px 12px', background:broadcastType===t?'var(--bg3)':'transparent', border:'1px solid var(--border)', color:`var(--${t==='success'?'accent':t==='info'?'info':t})`, fontFamily:'var(--font-mono)', fontSize:11 }}>{t}</button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={broadcastMsg} onChange={e=>setBroadcastMsg(e.target.value)} placeholder="Message to all screens..." onKeyDown={e=>e.key==='Enter'&&broadcastMsg&&(emit('admin:broadcast',{message:broadcastMsg,type:broadcastType}),setBroadcastMsg(''))}/>
                <button className="btn-ghost" onClick={()=>{ emit('admin:broadcast',{message:broadcastMsg,type:broadcastType}); setBroadcastMsg(''); }}>Send</button>
              </div>
            </div>

            {phase==='results'&&(
              <div className="card card-lg" style={{ border:'1px solid var(--purple)' }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--purple)' }}>DRAMATIC REVEAL</h3>
                <div style={{ color:'var(--text3)', fontSize:13, marginBottom:16 }}>Each click reveals the next team on ALL screens simultaneously — worst to best.</div>
                {/* BUG FIX: reveal_next had no cap — clicking past the last team broke the
                    broadcast into a "??? — 0TH PLACE" state on every screen. The button now
                    disables once everything's revealed instead of relying on the admin to notice. */}
                <div style={{ display:'flex', gap:10 }}>
                  <button className="btn-primary" onClick={()=>emit('admin:reveal_next',{})} disabled={state.announcement?.is_last} style={{ flex:1, padding:14, fontSize:16 }}>
                    {state.announcement?.is_last ? '✓ All Revealed' : '▶ Reveal Next'}
                  </button>
                  <button className="btn-ghost" onClick={()=>emit('admin:reset_reveal',{})}>Reset</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TEAMS ─────────────────────────────────────────────── */}
        {tab==='teams'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {/* UX FIX: 40+ teams meant scrolling forever to find one —
                filter by name or passcode, with live counts. */}
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <input
                value={teamSearch}
                onChange={e=>setTeamSearch(e.target.value)}
                placeholder="🔍 Search team name or passcode..."
                style={{ flex:1, minWidth:220, fontFamily:'var(--font-mono)', fontSize:13 }}
              />
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', flexShrink:0 }}>
                {activeTeams.length} active · {state.teams.length - activeTeams.length} out
              </div>
            </div>
            {state.teams
              .filter(t => {
                const q = teamSearch.trim().toLowerCase();
                if (!q) return true;
                return t.name.toLowerCase().includes(q) || (passcodeCache[t.id] || '').includes(q);
              })
              .map(team=>(
              <div key={team.id} className="card" style={{ border:`1px solid ${team.color}33`, opacity:team.is_eliminated?0.55:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:team.color }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:15 }}>{team.name} <span style={{ fontSize:11, color:'var(--text3)' }}>{team.year}</span></div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginTop:2 }}>Code: <span style={{ color:'var(--accent)' }}>{passcodeCache[team.id] || '—'}</span> · Score: {team.phase1_total_score} · Zones: {team.zones_captured}</div>
                  </div>
                  {phase==='phase2'&&<div style={{ minWidth:100 }}><BatteryBar battery={team.battery} height={6}/></div>}
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    {phase==='phase2'&&<>
                      <input type="number" min="0" max="100" value={battOverride[team.id]??''} onChange={e=>setBattOverride(b=>({...b,[team.id]:e.target.value}))} placeholder="bat%" style={{ width:60, padding:'4px 6px', fontSize:12 }}/>
                      <button className="btn-ghost" onClick={()=>emit('admin:override_battery',{team_id:team.id,battery:battOverride[team.id]})} style={{ padding:'4px 8px', fontSize:11 }}>Set</button>
                    </>}
                    {(team.violations?.total||0) > 0 && (
                      <button
                        title={`Tab switches: ${team.violations.tab_switch||0} · Copy/paste: ${team.violations.copy_paste||0} · Last: ${team.violations.last_at?new Date(team.violations.last_at).toLocaleTimeString():'—'}\nClick to clear.`}
                        onClick={()=>{ if(confirm(`Clear ${team.name}'s ${team.violations.total} violation(s)?`)) emit('admin:clear_violations',{team_id:team.id}); }}
                        style={{ padding:'4px 10px', fontSize:11, background:'color-mix(in srgb, var(--danger) 12%, transparent)', border:'1px solid var(--danger)', borderRadius:4, color:'var(--danger)', cursor:'pointer', fontFamily:'var(--font-mono)' }}>
                        🚨 {team.violations.total}
                      </button>
                    )}
                    {team.is_eliminated
                      ?<button className="btn-ghost" onClick={()=>emit('admin:restore_team',{team_id:team.id})} style={{ fontSize:11, padding:'4px 10px', color:'var(--accent)' }}>Restore</button>
                      :<button className="btn-danger" onClick={()=>{ if(confirm(`Eliminate ${team.name}?`)) emit('admin:eliminate_team',{team_id:team.id}); }} style={{ padding:'4px 10px', fontSize:11 }}>Eliminate</button>
                    }
                    {team.is_eliminated&&<span className="badge badge-danger">OUT</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ZONES ─────────────────────────────────────────────── */}
        {tab==='zones'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ padding:'10px 14px', background:'color-mix(in srgb, var(--info) 8%, transparent)', border:'1px solid color-mix(in srgb, var(--info) 20%, transparent)', borderRadius:6, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--info)' }}>Zone laptop URL format: <strong>http://[YOUR_IP]:5173/zone/[ZONE_ID]</strong></div>
              <button className="btn-ghost" onClick={()=>getSocket().emit('admin:request_zone_intel',{admin_token:sessionStorage.getItem('admin_session')||''})} style={{ fontSize:11, padding:'4px 10px' }}>🔄 Refresh Answers</button>
            </div>
            {state.zones.map((z,i)=>{
              const intel = zoneIntel[z.id];
              return (
              <div key={z.id} className="card" style={{ border:`1px solid ${z.owner_team_id?z.owner_color+'66':'var(--border)'}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:16 }}>Z{i+1} — {z.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:2 }}>ID: {z.id}{z.location&&` · ${z.location}`}</div>
                    {z.owner_team_id&&<div style={{ fontSize:12, color:z.owner_color, marginTop:4 }}>🏴 {z.owner_name} {z.problem?'· 🔒 Defense set':'· ⚠️ No defense set'}</div>}
                    {z.is_attempting&&<div style={{ fontSize:12, color:'var(--warning)', marginTop:2 }}>⚡ {z.attempting_team_name} is attempting...</div>}
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {z.is_attempting && (
                      <button className="btn-ghost" onClick={()=>{ if(confirm(`Clear the stuck attempt on "${z.name}"? Refunds ${z.attempting_team_name}'s attempt cost. Ownership/defense stay untouched — use this instead of full Reset when a zone laptop dies mid-attempt.`)) emit('admin:clear_zone_pending',{zone_id:z.id}); }} style={{ padding:'4px 10px', fontSize:11, color:'var(--warning)', borderColor:'var(--warning)' }}>🧹 Clear Stuck</button>
                    )}
                    <button className="btn-ghost" onClick={()=>{ if(confirm(`Reset "${z.name}" to neutral? This removes the current owner.`)) emit('admin:reset_zone',{zone_id:z.id}); }} style={{ padding:'4px 10px', fontSize:11 }}>Reset</button>
                    <span className={`badge ${z.owner_team_id?'badge-success':z.is_attempting?'badge-warning':'badge-info'}`}>{z.owner_team_id?'CAPTURED':z.is_attempting?'BUSY':'NEUTRAL'}</span>
                  </div>
                </div>
                {/* Answer visibility — pull-only, admin-only, so a coordinator can help a stuck team */}
                {(intel?.defense_problem || intel?.active_challenge) && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
                    {intel.active_challenge && (
                      <div style={{ fontSize:12, color:'var(--warning)' }}>
                        ⚡ <strong>{intel.active_challenge.attempting_team}</strong> is solving: <span style={{ color:'var(--text2)' }}>{intel.active_challenge.label}</span>
                        {' → '}<span style={{ fontFamily:'var(--font-mono)', color:'var(--accent)' }}>{intel.active_challenge.answer}</span>
                      </div>
                    )}
                    {intel.defense_problem && (
                      <div style={{ fontSize:12, color:'var(--text3)' }}>
                        🔒 Defense trap: <span style={{ color:'var(--text2)' }}>{intel.defense_problem.label}</span>
                        {' → '}<span style={{ fontFamily:'var(--font-mono)', color:'var(--accent)' }}>{intel.defense_problem.answer}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );})}
          </div>
        )}

        {/* ── PHASE 3 ───────────────────────────────────────────── */}
        {/* ── QUIZ ROUND TAB ───────────────────────────────────── */}
        {tab==='quiz'&&(()=>{
          const qs = state.app_state;
          const qActive = qs.quiz_round_active;
          const qPaused = qs.quiz_paused;
          const qEnd = qs.quiz_timer_end;
          const qCount = (qs.quiz_questions||[]).length;
          const memberAnswers = qs.quiz_member_answers || {};
          // Count unique member submissions across all teams
          const totalSubmissions = Object.values(memberAnswers).reduce((sum, teamM) => sum + Object.keys(teamM).length, 0);
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Status card */}
              <div className="card card-lg" style={{ border:`1px solid ${qActive ? 'var(--info)' : 'var(--border)'}` }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--info)', marginBottom:16 }}>
                  🧠 QUIZ ROUND CONTROL
                </h3>

                {/* Stats row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
                  {[
                    ['Status', qActive ? (qPaused ? 'PAUSED' : 'LIVE') : 'IDLE', qActive ? (qPaused ? 'var(--warning)' : 'var(--accent)') : 'var(--text3)'],
                    ['Questions', qCount, 'var(--info)'],
                    ['Submissions', totalSubmissions, 'var(--accent)'],
                    ['Config', `${state.app_state?.event_config?.quiz_num_questions||50}Q / ${state.app_state?.event_config?.quiz_duration_min||30}min`, 'var(--text2)'],
                  ].map(([l,v,c])=>(
                    <div key={l} style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px' }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:4, textTransform:'uppercase' }}>{l}</div>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:c }}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Timer display */}
                {qActive && qEnd && !qPaused && (
                  <div style={{ textAlign:'center', padding:'12px 0', marginBottom:16 }}>
                    <CountdownTimer endTime={qEnd} label="Quiz Timer" />
                  </div>
                )}
                {qActive && qPaused && (
                  <div style={{ textAlign:'center', padding:'10px', marginBottom:16, background:'color-mix(in srgb, var(--warning) 10%, transparent)', border:'1px solid var(--warning)', borderRadius:8, fontFamily:'var(--font-mono)', color:'var(--warning)' }}>
                    ⏸ PAUSED — {Math.round((qs.quiz_paused_remaining_ms||0)/60000)} min remaining
                  </div>
                )}

                {/* Controls */}
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {!qActive && (
                    <button className="btn-info" style={{ flex:1, padding:14, fontSize:15 }}
                      onClick={()=>{ if(phase!=='quiz_round'){alert(`The event is currently in "${phaseLabels[phase]}". Advance to the quiz phase first (Control tab → Advance).`);return;} emit('admin:start_quiz_round',{}); }}>
                      ▶ Start Quiz Round ({state.app_state?.event_config?.quiz_num_questions||50} Qs)
                    </button>
                  )}
                  {qActive && !qPaused && (
                    <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--warning)', borderRadius:6, color:'var(--warning)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
                      onClick={()=>emit('admin:pause_quiz_round',{})}>
                      ⏸ Pause
                    </button>
                  )}
                  {qActive && qPaused && (
                    <button className="btn-info" style={{ flex:1, padding:12 }}
                      onClick={()=>emit('admin:resume_quiz_round',{})}>
                      ▶ Resume
                    </button>
                  )}
                  {qActive && (
                    <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--danger)', borderRadius:6, color:'var(--danger)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
                      onClick={()=>{ if(confirm(`End the quiz and calculate scores?\n\n${totalSubmissions} member submission(s) received so far — anyone who hasn't submitted scores 0.`)) emit('admin:end_quiz_round',{}); }}>
                      ⏹ End & Score
                    </button>
                  )}
                </div>

                {/* Timer adjust */}
                {qActive && (
                  <div style={{ marginTop:14 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:8, textTransform:'uppercase' }}>Adjust Timer</div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[-10,-5,+5,+10].map(d=>(
                        <button key={d} onClick={()=>emit('admin:adjust_quiz_timer',{delta_min:d})} style={{
                          flex:1, padding:'8px 0', background:'var(--bg3)', border:'1px solid var(--border)',
                          borderRadius:6, color: d<0?'var(--danger)':'var(--accent)',
                          fontFamily:'var(--font-mono)', fontSize:13, cursor:'pointer',
                        }}>{d>0?'+':''}{d}m</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Per-team submission tracker */}
              <div className="card">
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>SUBMISSION TRACKER</h3>
                {state.teams.filter(t=>!t.is_eliminated).length === 0
                  ? <div style={{ color:'var(--text3)', fontFamily:'var(--font-mono)', textAlign:'center', padding:20 }}>No active teams</div>
                  : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {state.teams.filter(t=>!t.is_eliminated).map(team=>{
                        const teamSubmissions = Object.keys(memberAnswers[team.id]||{});
                        const hasSubmitted = teamSubmissions.length > 0;
                        return (
                          <div key={team.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--bg3)', borderRadius:6, border:`1px solid ${hasSubmitted?team.color+'44':'var(--border)'}` }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:10, height:10, borderRadius:'50%', background:team.color }}/>
                              <div style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>{team.name}</div>
                            </div>
                            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color: hasSubmitted ? 'var(--accent)' : 'var(--text3)' }}>
                              {hasSubmitted ? `✓ ${teamSubmissions.length} submitted (${teamSubmissions.join(', ')})` : '○ waiting...'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>

              {/* Post-quiz scores */}
              {(!state.app_state.quiz_round_active && state.teams.some(t=>t.quiz_member_scores !== null && t.quiz_member_scores !== undefined)) && (
                <div className="card">
                  <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>QUIZ SCORES</h3>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:0 }}>
                    {[...state.teams.filter(t=>!t.is_eliminated)].sort((a,b)=>(b.quiz_score||0)-(a.quiz_score||0)).map((team,i)=>(
                      <div key={team.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 14px', background:'var(--bg3)', borderRadius:6, border: team.is_eliminated ? '1px solid var(--danger)' : '1px solid transparent' }}>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', width:20, textAlign:'right' }}>#{i+1}</div>
                        <div style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:13, color: team.is_eliminated ? 'var(--text3)' : 'var(--text)' }}>{team.name}{team.is_eliminated && <span style={{color:'var(--danger)',marginLeft:8}}>OUT</span>}</div>
                        <div style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--accent)' }}>{team.quiz_score||0}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>pts</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quiz elimination control — always visible in quiz_round phase */}
              <div className="card">
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:10, textTransform:'uppercase', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Eliminate Bottom N Teams (by quiz score)</span>
                  <span style={{ background:'var(--bg3)', border:'1px solid var(--border)', padding:'2px 10px', borderRadius:4 }}>
                    👥 {state.teams.filter(t=>!t.is_eliminated).length} active teams
                  </span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <input
                    type="number" min={1} max={state.teams.filter(t=>!t.is_eliminated).length - 1}
                    value={quizElimCount}
                    onChange={e=>setQuizElimCount(Math.max(1, parseInt(e.target.value)||1))}
                    style={{ width:70 }}
                  />
                  <button className="btn-danger" onClick={()=>{
                    if(confirm(`Eliminate the bottom ${quizElimCount} team(s) by quiz score? This cannot be undone.`))
                      emit('admin:quiz_eliminate',{eliminate_count:quizElimCount});
                  }} disabled={state.app_state.current_phase!=='quiz_round'}>
                    💀 Eliminate Bottom {quizElimCount}
                  </button>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>
                    max {Math.max(0, state.teams.filter(t=>!t.is_eliminated).length - 1)}
                  </span>
                  {state.app_state.current_phase!=='quiz_round' && (
                    <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--text3)'}}>
                      (must be in quiz_round phase)
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── CODE ARENA: BUG HUNT TAB ──────────────────────────── */}
        {tab==='bughunt'&&(
          <BugHuntTab state={state} emit={emit} phase={phase} />
        )}

        {/* ── CODE ARENA: CODE STRIKE TAB ───────────────────────── */}
        {tab==='codestrike'&&(
          <CodeStrikeTab state={state} emit={emit} phase={phase} />
        )}

        {/* ── CODE ARENA: TIE-BREAK TAB ─────────────────────────── */}
        {tab==='tiebreak'&&(
          <TieBreakTab state={state} emit={emit} />
        )}

        {/* ── CUSTOM QUESTIONS TAB ──────────────────────────────── */}
        {tab==='questions'&&(()=>{
          const customQs = state.app_state?.event_config?.custom_questions || [];
          const submitQ = () => {
            if (!cqQuestion.trim() || !cqAnswer.trim()) { setCqMsg('❌ Question and answer are required'); return; }
            const opts = cqType==='mcq' ? cqOptions.filter(o=>o.trim()) : [];
            if (cqType==='mcq' && opts.length < 2) { setCqMsg('❌ Add at least 2 options for MCQ'); return; }
            emit('admin:add_custom_question', { question: {
              type: cqType, question: cqQuestion.trim(),
              options: opts, answer: cqAnswer.trim(),
              points: cqPoints, difficulty: cqDifficulty, round_max: cqRoundMax,
            }});
            setCqQuestion(''); setCqOptions(['','','','']); setCqAnswer('');
            setCqMsg('✅ Question added!'); setTimeout(()=>setCqMsg(''),3000);
          };
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Add form */}
              <div className="card card-lg">
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--warning)', marginBottom:16 }}>
                  ➕ ADD CUSTOM QUESTION
                </h3>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Type</label>
                    <select value={cqType} onChange={e=>setCqType(e.target.value)}>
                      <option value="mcq">MCQ (options)</option>
                      <option value="text_input">Text Input</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Difficulty</label>
                    <select value={cqDifficulty} onChange={e=>setCqDifficulty(e.target.value)}>
                      <option value="easy">Easy (10 pts)</option>
                      <option value="medium">Medium (18 pts)</option>
                      <option value="hard">Hard (30 pts)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Points</label>
                    <input type="number" value={cqPoints} min={1} max={100} onChange={e=>setCqPoints(+e.target.value)} style={{ fontFamily:'var(--font-mono)' }}/>
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Question</label>
                  <textarea value={cqQuestion} onChange={e=>setCqQuestion(e.target.value)} rows={3} placeholder="Type the question here..." style={{ width:'100%' }}/>
                </div>
                {cqType==='mcq' && (
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:6, textTransform:'uppercase' }}>Options (A–D)</label>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {cqOptions.map((opt,i)=>(
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:'var(--font-mono)', color:'var(--text3)', fontSize:12, width:18 }}>{String.fromCharCode(65+i)}.</span>
                          <input type="text" value={opt} placeholder={`Option ${String.fromCharCode(65+i)}`}
                            onChange={e=>{ const o=[...cqOptions]; o[i]=e.target.value; setCqOptions(o); }}
                            style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:13 }}/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>
                    Correct Answer {cqType==='mcq' ? '(exact text of the correct option)' : ''}
                  </label>
                  <input type="text" value={cqAnswer} onChange={e=>setCqAnswer(e.target.value)} placeholder="Exact answer string" style={{ fontFamily:'var(--font-mono)' }}/>
                </div>
                {cqMsg && <div style={{ padding:'8px 14px', background: cqMsg.startsWith('✅')?'color-mix(in srgb, var(--accent) 10%, transparent)':'color-mix(in srgb, var(--danger) 10%, transparent)', border:`1px solid ${cqMsg.startsWith('✅')?'var(--accent)':'var(--danger)'}`, borderRadius:6, fontFamily:'var(--font-mono)', fontSize:13, marginBottom:10 }}>{cqMsg}</div>}
                <button className="btn-warning" style={{ width:'100%', padding:12, fontSize:14 }} onClick={submitQ}>
                  ➕ Add Question
                </button>
              </div>

              {/* Question list */}
              <div className="card">
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>
                  CUSTOM QUESTIONS ({customQs.length})
                </h3>
                {customQs.length===0
                  ? <div style={{ textAlign:'center', padding:32, color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:13 }}>
                      No custom questions yet.<br/>
                      <span style={{ fontSize:11 }}>50 built-in DSA questions are always available.</span>
                    </div>
                  : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {customQs.map((q,i)=>(
                        <div key={q.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:'var(--bg3)', borderRadius:6, border:'1px solid var(--border)' }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--warning)', padding:'2px 6px', background:'color-mix(in srgb, var(--warning) 10%, transparent)', borderRadius:3 }}>{q.type}</span>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', padding:'2px 6px', background:'var(--bg)', borderRadius:3 }}>{q.difficulty}</span>
                              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', padding:'2px 6px', background:'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius:3 }}>{q.points}pts</span>
                            </div>
                            <div style={{ fontSize:13, lineHeight:1.5, color:'var(--text)', marginBottom:4 }}>{q.question}</div>
                            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)' }}>✓ {q.answer}</div>
                          </div>
                          <button onClick={()=>{ if(confirm('Delete this question?')) emit('admin:delete_custom_question',{q_id:q.id}); }} style={{
                            padding:'6px 10px', background:'transparent', border:'1px solid var(--danger)',
                            borderRadius:4, color:'var(--danger)', cursor:'pointer', fontFamily:'var(--font-mono)', fontSize:11, flexShrink:0,
                          }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            </div>
          );
        })()}

        {tab==='phase3'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="card card-lg" style={{ border:'1px solid var(--info)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--info)' }}>ASSIGN PROBLEMS</h3>
                {/* CSV Export */}
                <button onClick={()=>{
                  fetch('/api/admin/phase3-export', { headers:{ 'x-admin-token': sessionStorage.getItem('admin_session')||'' }})
                    .then(r=>r.blob()).then(blob=>{
                      const url=URL.createObjectURL(blob);
                      const a=document.createElement('a'); a.href=url; a.download='phase3_submissions.csv'; a.click();
                    });
                }} style={{ padding:'8px 14px', background:'var(--bg3)', border:'1px solid var(--accent)', borderRadius:6, color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:12, cursor:'pointer', textTransform:'uppercase' }}>
                  ⬇ Export CSV
                </button>
              </div>

              {/* Mode toggle */}
              <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                {[['individual','Individual / All'],['group','By Group']].map(([m,lbl])=>(
                  <button key={m} onClick={()=>setProblemMode(m)} style={{
                    flex:1, padding:'9px 0', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, cursor:'pointer',
                    background: problemMode===m ? 'color-mix(in srgb, var(--info) 12%, transparent)' : 'var(--bg3)',
                    border: `1px solid ${problemMode===m ? 'var(--info)' : 'var(--border)'}`,
                    color: problemMode===m ? 'var(--info)' : 'var(--text3)',
                  }}>{lbl}</button>
                ))}
              </div>

              {problemMode==='individual' ? (
                <>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:6, textTransform:'uppercase' }}>Assign To</label>
                    <select value={problemTarget} onChange={e=>setProblemTarget(e.target.value)}>
                      <option value="all">All Teams (same problem)</option>
                      {state.teams.filter(t=>!t.is_eliminated).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                    {PROBLEMS.map((p,i)=>(
                      <button key={i} onClick={()=>{ setSelectedProblem(p); setCustomProblem(''); }} style={{ textAlign:'left', padding:'10px 14px', background:selectedProblem===p&&!customProblem?'color-mix(in srgb, var(--info) 10%, transparent)':'var(--bg3)', border:`1px solid ${selectedProblem===p&&!customProblem?'var(--info)':'var(--border)'}`, borderRadius:6, color:'var(--text)', textTransform:'none', letterSpacing:'normal', fontFamily:'var(--font-body)', fontSize:13, lineHeight:1.5 }}>{p}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:6, textTransform:'uppercase' }}>Or custom:</label>
                    <textarea value={customProblem} onChange={e=>{ setCustomProblem(e.target.value); setSelectedProblem(''); }} rows={3} placeholder="Type your own problem..."/>
                  </div>
                  <button className="btn-info" onClick={()=>{
                    const prob = customProblem.trim() || selectedProblem;
                    const targetName = problemTarget==='all' ? 'All Teams' : state.teams.find(t=>t.id===problemTarget)?.name;
                    emit('admin:assign_problem',{team_id:problemTarget,problem:prob});
                    setProblemMsg(`✅ Problem revealed to ${targetName}!`);
                    setTimeout(()=>setProblemMsg(''), 6000);
                  }} style={{ width:'100%', padding:14, fontSize:15 }}>
                    🚀 Reveal Problem to {problemTarget==='all'?'All Teams':state.teams.find(t=>t.id===problemTarget)?.name}
                  </button>
                  {problemMsg&&<div style={{ marginTop:10, padding:'10px 14px', background:'color-mix(in srgb, var(--accent) 10%, transparent)', border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>{problemMsg}</div>}
                </>
              ) : (
                /* Group assignment mode */
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div>
                      <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Group Label</label>
                      <input type="text" value={groupLabel} onChange={e=>setGroupLabel(e.target.value)} placeholder="e.g. Group A" style={{ fontFamily:'var(--font-mono)' }}/>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Teams selected: {groupTeamIds.length}</label>
                      <div style={{ padding:'10px 0', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)' }}>Check boxes below ↓</div>
                    </div>
                  </div>

                  {/* Team checkboxes */}
                  <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14, maxHeight:220, overflowY:'auto' }}>
                    {state.teams.filter(t=>!t.is_eliminated).map(t=>{
                      const selected = groupTeamIds.includes(t.id);
                      return (
                        <label key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background: selected?`${t.color}11`:'var(--bg3)', border:`1px solid ${selected?t.color+'44':'var(--border)'}`, borderRadius:6, cursor:'pointer' }}>
                          <input type="checkbox" checked={selected}
                            onChange={e=>{ setGroupTeamIds(ids => e.target.checked ? [...ids,t.id] : ids.filter(id=>id!==t.id)); }}
                            style={{ accentColor: t.color }}/>
                          <div style={{ width:10,height:10,borderRadius:'50%',background:t.color,flexShrink:0 }}/>
                          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, flex:1 }}>{t.name}</span>
                          {t.phase3_group && <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>{t.phase3_group}</span>}
                        </label>
                      );
                    })}
                  </div>

                  {/* Problem picker */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                    {PROBLEMS.map((p,i)=>(
                      <button key={i} onClick={()=>{ setSelectedProblem(p); setCustomProblem(''); }} style={{ textAlign:'left', padding:'10px 14px', background:selectedProblem===p&&!customProblem?'color-mix(in srgb, var(--info) 10%, transparent)':'var(--bg3)', border:`1px solid ${selectedProblem===p&&!customProblem?'var(--info)':'var(--border)'}`, borderRadius:6, color:'var(--text)', textTransform:'none', letterSpacing:'normal', fontFamily:'var(--font-body)', fontSize:13, lineHeight:1.5 }}>{p}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <textarea value={customProblem} onChange={e=>{ setCustomProblem(e.target.value); setSelectedProblem(''); }} rows={3} placeholder="Or type a custom problem..."/>
                  </div>
                  <button className="btn-info" style={{ width:'100%', padding:14, fontSize:15 }}
                    disabled={groupTeamIds.length===0}
                    onClick={()=>{
                      const prob = customProblem.trim() || selectedProblem;
                      emit('admin:assign_problem_group',{ team_ids:groupTeamIds, problem:prob, group_label:groupLabel });
                      setGroupMsg(`✅ Problem revealed to ${groupLabel} (${groupTeamIds.length} teams)`);
                      setGroupTeamIds([]);
                      setTimeout(()=>setGroupMsg(''),6000);
                    }}>
                    🚀 Reveal to {groupLabel} ({groupTeamIds.length} teams)
                  </button>
                  {groupMsg && <div style={{ marginTop:10, padding:'10px 14px', background:'color-mix(in srgb, var(--accent) 10%, transparent)', border:'1px solid color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>{groupMsg}</div>}
                </>
              )}
            </div>

            {/* Judge panel */}
            <div className="card">
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:8 }}>JUDGE SUBMISSIONS</h3>
              <div style={{ display:'flex', gap:12, marginBottom:16 }}>
                {[
                  [`${state.teams.filter(t=>t.phase3_submission).length} Submitted`, 'var(--info)'],
                  [`${state.teams.filter(t=>t.phase3_judge_scores).length} Judged`, 'var(--accent)'],
                  [`${state.teams.filter(t=>t.phase3_submission&&!t.phase3_judge_scores).length} Pending`, 'var(--warning)'],
                ].map(([label, color])=>(
                  <div key={label} style={{ padding:'6px 14px', background:`${color}11`, border:`1px solid ${color}44`, borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, color }}>
                    {label}
                  </div>
                ))}
              </div>
              {state.teams.filter(t=>t.phase3_submission).length===0&&<div style={{ textAlign:'center', padding:24, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>No submissions yet — waiting for teams to submit.</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {state.teams.filter(t=>t.phase3_submission).map(team=>(
                  <JudgeCard key={team.id} team={team} onScore={scores=>emit('admin:set_phase3_scores',{team_id:team.id,scores})}/>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RESULTS ───────────────────────────────────────────── */}
        {tab==='demo'&&(
          <DemoTab state={state} emit={emit} />
        )}

        {tab==='analytics'&&(
          <AnalyticsTab state={state} />
        )}

        {tab==='qr'&&(
          <QRTab state={state} />
        )}

        {tab==='results'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="card card-lg" style={{ border:'1px solid var(--purple)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--purple)' }}>DRAMATIC REVEAL</h3>
              <div style={{ color:'var(--text3)', fontSize:13, marginBottom:16 }}>Full-screen overlay appears on ALL screens (teams, operators, spectator) simultaneously. Worst place → 1st place.</div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn-primary" onClick={()=>emit('admin:reveal_next',{})} disabled={state.announcement?.is_last} style={{ flex:1, padding:14, fontSize:16 }}>
                  {state.announcement?.is_last ? '✓ All Revealed' : '▶ Reveal Next'}
                </button>
                <button className="btn-ghost" onClick={()=>emit('admin:reset_reveal',{})}>Reset</button>
              </div>
            </div>

            {/* Thank You Page */}
            <div className="card card-lg" style={{ border:'1px solid rgba(255,215,0,0.4)', background:'rgba(255,215,0,0.03)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'#FFD700' }}>🎉 THANK YOU PAGE</h3>
              <div style={{ color:'var(--text3)', fontSize:13, marginBottom:16 }}>Send all screens to the Thank You page — golden farewell with a Hindi engineering joke. The final curtain.</div>
              <button
                onClick={() => { if(window.confirm('Show Thank You page on ALL screens? This is the final curtain.')) emit('admin:goto_thankyou'); }}
                style={{ padding:'14px 28px', fontSize:16, background:'linear-gradient(135deg,rgba(255,165,0,0.25),rgba(255,215,0,0.1))', border:'1px solid rgba(255,215,0,0.5)', color:'#FFD700', borderRadius:6, cursor:'pointer', fontFamily:'var(--font-display)', letterSpacing:'0.1em', fontWeight:700 }}
              >✦ GO TO THANK YOU ✦</button>
            </div>

            <div className="card">
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>SCORES</h3>
              {(()=>{
                const phasesEnabled = state.app_state?.event_config?.phases_enabled || [];
                let board;
                let scoreOf;
                let scoreUnit;
                if (phasesEnabled.includes('bug_hunt') || phasesEnabled.includes('code_strike')) {
                  // CODE ARENA: combined mission marks (mirrors server getResultsBoard)
                  const totalOf = t =>
                    (phasesEnabled.includes('quiz_round') ? (t.quiz_marks_scored||0) : 0)
                    + (phasesEnabled.includes('bug_hunt') ? (t.bughunt_score||0) : 0)
                    + (phasesEnabled.includes('code_strike') ? (t.codestrike_score||0) : 0);
                  board = [...state.teams].filter(t=>!t.is_eliminated)
                    .sort((a,b)=> totalOf(b)-totalOf(a) || (b.tiebreak_wins||0)-(a.tiebreak_wins||0));
                  scoreOf = t => `${Math.round(totalOf(t)*10)/10} marks${(t.tiebreak_wins||0)>0?' ⚡':''}`;
                  scoreUnit = 'Total';
                } else if (phasesEnabled.includes('phase3')) {
                  board = [...state.teams].filter(t=>t.phase3_judge_scores).sort((a,b)=>b.phase3_judge_scores.total-a.phase3_judge_scores.total);
                  scoreOf = t => `${t.phase3_judge_scores.total}/100`;
                  scoreUnit = 'Judge';
                } else if (phasesEnabled.includes('quiz_round')) {
                  board = [...state.teams].filter(t=>!t.is_eliminated).sort((a,b)=>(b.quiz_score||0)-(a.quiz_score||0));
                  scoreOf = t => `${t.quiz_score||0} pts`;
                  scoreUnit = 'Quiz';
                } else {
                  board = [...state.teams].filter(t=>!t.is_eliminated).sort((a,b)=>(b.phase1_total_score||0)-(a.phase1_total_score||0));
                  scoreOf = t => `${t.phase1_total_score||0} pts`;
                  scoreUnit = 'Gauntlet';
                }
                if (board.length === 0) return <div style={{ color:'var(--text3)', fontSize:13 }}>No scores yet — complete the scoring phase first.</div>;
                return board.map((t,i)=>(
                  <div key={t.id} style={{ display:'flex', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:16, width:32, color:['#FFD700','#C0C0C0','#CD7F32'][i]||'var(--text3)' }}>#{i+1}</div>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:t.color }}/>
                    <div style={{ flex:1, fontFamily:'var(--font-display)', fontSize:15 }}>{t.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:700, color:'var(--accent)' }}>{scoreOf(t)}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* ── BACKUP ─────────────────────────────────────────────── */}
        {/* ── DANGER ZONE ──────────────────────────────────────── */}
        {tab==='danger'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* Factory Reset */}
            <div className="card card-lg" style={{ border:'1px solid var(--danger)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--danger)' }}>🔄 Factory Reset</h3>
              <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
                Wipes ALL teams, zones, scores, and event log. Resets to a clean setup state. Use this to run the event again fresh. Type RESET to confirm.
              </p>
              <FactoryResetCard emit={emit} />
            </div>

            {/* Phase Rollback */}
            <div className="card card-lg" style={{ border:'1px solid var(--warning)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--warning)' }}>⏪ Phase Rollback</h3>
              <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
                Undo the last phase transition. Team scores, batteries, and zone ownership are restored to just before that advance. Up to 5 rollbacks available.
              </p>
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <button className="btn-warning" onClick={()=>{ if(confirm('Roll back phase? All progress since last phase advance will be undone.')) emit('admin:rollback_phase',{}); }} disabled={!state.phase_history_count} style={{ padding:'12px 24px', fontSize:15 }}>
                  ⏪ Roll Back Phase
                </button>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text3)' }}>
                  {state.phase_history_count} snapshot{state.phase_history_count !== 1 ? 's' : ''} available
                </div>
              </div>
            </div>

            {/* Quick Backup */}
            <div className="card card-lg" style={{ border:'1px solid var(--accent)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--accent)' }}>💾 Quick Backup</h3>
              <p style={{ fontSize:13, color:'var(--text2)', marginBottom:12, lineHeight:1.6 }}>
                Copy current DB to clipboard before any risky action or Railway redeploy.
              </p>
              <button className="btn-primary" style={{ width:'100%', padding:12 }} onClick={async()=>{
                try {
                  const res = await fetch('/api/admin/backup',{headers:{'x-admin-token': sessionStorage.getItem('admin_session')||''}});
                  const data = await res.json();
                  await navigator.clipboard.writeText(data.db_json);
                  alert(`✅ Backup copied!\nTeams: ${data.teams_count} | Zones: ${data.zones_count} | Phase: ${data.phase}\n\nPaste as DB_BACKUP in Railway variables before redeploying.`);
                } catch(e){ alert('Error: '+e.message); }
              }}>📋 Copy Backup to Clipboard</button>
            </div>

            {/* Health Monitor */}
            <div className="card card-lg">
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--info)' }}>📊 Server Health</h3>
              <button className="btn-ghost" style={{ marginBottom:12 }} onClick={async()=>{
                try {
                  const res = await fetch('/api/ping');
                  const d = await res.json();
                  const warn = d.memory_mb > 400 ? '⚠️ HIGH' : '✅ OK';
                  alert(`Server Health\n\nPhase: ${d.phase}\nUptime: ${Math.floor(d.uptime_seconds/60)}min\nMemory: ${d.memory_mb}MB / ${d.memory_total_mb}MB ${warn}\nTeams: ${d.teams} (${d.active_teams} active)\nZones: ${d.zones}\nPaused: ${d.master_paused}\n\n${d.memory_mb > 400 ? '⚠️ Memory high! Consider restarting Railway after backup.' : '✅ All good.'}`);
                } catch(e){ alert('Server unreachable: '+e.message); }
              }}>Check /api/ping</button>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
                Memory &gt; 400MB on Railway free tier → back up DB and restart. Paid plan ($5/mo) avoids this.
              </div>
            </div>
          </div>
        )}

        {tab==='backup'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="card card-lg" style={{ border:'1px solid var(--accent)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--accent)' }}>💾 BACKUP YOUR DATABASE</h3>
              <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
                Railway wipes your database on every redeploy. Before redeploying, click below to download your backup, then set it as the <code style={{ fontFamily:'var(--font-mono)', background:'var(--bg3)', padding:'1px 6px', borderRadius:3 }}>DB_BACKUP</code> environment variable in Railway.
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <button className="btn-primary" style={{ width:'100%', padding:14, fontSize:15 }}
                  onClick={async ()=>{
                    try {
                      const res = await fetch('/api/admin/backup', { headers:{'x-admin-token': sessionStorage.getItem('admin_session')||''} });
                      const data = await res.json();
                      // Copy db_json to clipboard
                      await navigator.clipboard.writeText(data.db_json);
                      alert(`✅ Backup copied to clipboard!\n\nTeams: ${data.teams_count}\nZones: ${data.zones_count}\nPhase: ${data.phase}\n\nNow paste it as DB_BACKUP in Railway variables.`);
                    } catch(e) { alert('Error: ' + e.message); }
                  }}>
                  📋 Copy Backup to Clipboard
                </button>
                <button className="btn-ghost" style={{ width:'100%', padding:12, fontSize:13 }}
                  onClick={async ()=>{
                    try {
                      const res = await fetch('/api/admin/backup', { headers:{'x-admin-token': sessionStorage.getItem('admin_session')||''} });
                      const data = await res.json();
                      const blob = new Blob([data.db_json], { type:'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `Sprint_backup_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
                      a.click(); URL.revokeObjectURL(url);
                    } catch(e) { alert('Error: ' + e.message); }
                  }}>
                  ⬇️ Download as JSON File
                </button>
              </div>
            </div>

            <div className="card card-lg" style={{ border:'1px solid var(--info)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8, color:'var(--info)' }}>♻️ RESTORE DATABASE</h3>
              <p style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
                If data was lost after a redeploy, paste your backup JSON here to restore everything instantly — no redeploy needed.
              </p>
              <textarea id="restore-input" rows={5} placeholder='Paste backup JSON here...' style={{ marginBottom:12, fontFamily:'var(--font-mono)', fontSize:12, resize:'vertical' }}/>
              <button className="btn-info" style={{ width:'100%', padding:14 }}
                onClick={async ()=>{
                  const val = document.getElementById('restore-input').value.trim();
                  if (!val) { alert('Paste backup JSON first'); return; }
                  if (!confirm('This will overwrite ALL current data. Continue?')) return;
                  try {
                    const res = await fetch('/api/admin/restore', { method:'POST', headers:{'Content-Type':'application/json','x-admin-token': sessionStorage.getItem('admin_session')||''}, body: val });
                    const data = await res.json();
                    if (data.success) alert(`✅ Restored!\nTeams: ${data.teams}\nZones: ${data.zones}\nPhase: ${data.phase}`);
                    else alert('Error: ' + JSON.stringify(data));
                  } catch(e) { alert('Error: ' + e.message); }
                }}>
                ♻️ Restore Now
              </button>
            </div>

            <div className="card" style={{ background:'var(--bg3)' }}>
              <h3 style={{ fontFamily:'var(--font-display)', fontSize:14, marginBottom:10, color:'var(--text2)' }}>HOW TO SURVIVE A RAILWAY REDEPLOY</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  ['1', 'Click "Copy Backup to Clipboard" above'],
                  ['2', 'Go to Railway → Your project → Variables tab'],
                  ['3', 'Add new variable: DB_BACKUP = [paste your clipboard]'],
                  ['4', 'Now redeploy — data auto-restores from that variable'],
                  ['5', 'After confirming data is back, delete the DB_BACKUP variable (it\'s large)'],
                ].map(([n,s])=>(
                  <div key={n} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', width:20, flexShrink:0 }}>{n}.</div>
                    <div style={{ fontSize:13, color:'var(--text2)' }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>

            <SnapshotsAndArchives />
          </div>
        )}

        {/* ── LOG ───────────────────────────────────────────────── */}
        {tab==='log'&&(
          <div className="card" style={{ maxHeight:600, overflowY:'auto' }}>
            {state.event_log.length===0&&<div style={{ textAlign:'center', padding:40, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>No events yet.</div>}
            {state.event_log.map((log,i)=>{
              const c = { capture:'var(--accent)', elimination:'var(--danger)', phase_change:'var(--info)', zone_attempt:'var(--warning)', zone_fail:'var(--danger)' };
              return (
                <div key={i} style={{ display:'flex', gap:12, padding:'8px 12px', background:i%2===0?'var(--bg3)':'transparent', borderRadius:4 }}>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', whiteSpace:'nowrap', marginTop:2 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span style={{ fontSize:13, color:c[log.type]||'var(--text2)' }}>{log.message}</span>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// Editable judge score card
function JudgeCard({ team, onScore }) {
  const existing = team.phase3_judge_scores;
  const [scores, setScores] = useState({ ui:existing?.ui??'', functionality:existing?.functionality??'', problem_fit:existing?.problem_fit??'' });
  const [editing, setEditing] = useState(!existing);

  const total = scores.ui!==''&&scores.functionality!==''&&scores.problem_fit!==''
    ? Math.round((Number(scores.ui)*0.3+Number(scores.functionality)*0.4+Number(scores.problem_fit)*0.3)*10) : existing?.total;

  const submit = () => { onScore({ ui:Number(scores.ui), functionality:Number(scores.functionality), problem_fit:Number(scores.problem_fit) }); setEditing(false); };

  return (
    <div style={{ padding:'14px', background:'var(--bg3)', borderRadius:8, border:`1px solid ${team.color}33` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:team.color }}/>
          <span style={{ fontFamily:'var(--font-display)', fontSize:15 }}>{team.name}</span>
          {existing&&!editing&&<span className="badge badge-success">Scored: {existing.total}</span>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {team.phase3_submission?.deploy_url&&<a href={team.phase3_submission.deploy_url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)', fontSize:12, fontFamily:'var(--font-mono)' }}>🌐 Deployed</a>}
          {team.phase3_submission?.github_url&&<a href={team.phase3_submission.github_url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--info)', fontSize:12, fontFamily:'var(--font-mono)' }}>📦 GitHub</a>}
          {existing&&!editing&&<button onClick={()=>setEditing(true)} className="btn-ghost" style={{ padding:'3px 10px', fontSize:11 }}>Edit</button>}
        </div>
      </div>
      {team.phase3_submission?.notes&&<div style={{ fontSize:12, color:'var(--text2)', padding:'6px 10px', background:'var(--bg2)', borderRadius:4, marginBottom:10 }}>{team.phase3_submission.notes}</div>}

      {editing ? (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 }}>
            {[['ui','UI (30%)'],['functionality','Func. (40%)'],['problem_fit','Fit (30%)']].map(([k,l])=>(
              <div key={k}>
                <label style={{ display:'block', fontSize:9, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:3 }}>{l}</label>
                <input type="number" min="0" max="10" value={scores[k]} onChange={e=>setScores(s=>({...s,[k]:e.target.value}))} placeholder="0-10" style={{ textAlign:'center', fontFamily:'var(--font-mono)', fontSize:22, fontWeight:700 }}/>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button className="btn-primary" onClick={submit} disabled={scores.ui===''||scores.functionality===''||scores.problem_fit===''}>Submit Scores</button>
            {total!==undefined&&<span style={{ fontFamily:'var(--font-mono)', fontSize:22, fontWeight:700, color:'var(--accent)' }}>→ {total}/100</span>}
            {existing&&<button className="btn-ghost" onClick={()=>setEditing(false)} style={{ marginLeft:'auto' }}>Cancel</button>}
          </div>
        </>
      ) : (
        <div style={{ display:'flex', gap:16 }}>
          {[['UI',existing?.ui],['Func',existing?.functionality],['Fit',existing?.problem_fit]].map(([l,v])=>(
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:24, fontWeight:700, color:'var(--accent)' }}>{v}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>{l}/10</div>
            </div>
          ))}
          <div style={{ marginLeft:'auto', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:28, fontWeight:700, color:'#FFD700' }}>{existing?.total}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>TOTAL</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Factory Reset Card ───────────────────────────────────────────
function FactoryResetCard({ emit }) {
  const [confirmText, setConfirmText] = useState('');
  const [done, setDone] = useState(false);
  const ready = confirmText === 'RESET';

  const doReset = () => {
    if (!ready) return;
    if (!confirm('FINAL WARNING: This will delete ALL teams, zones, and scores permanently. Continue?')) return;
    emit('admin:factory_reset', { confirm_phrase: 'RESET' });
    setConfirmText('');
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <div>
      <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder='Type "RESET" to enable button' style={{ marginBottom: 10 }} />
      <button className="btn-danger" onClick={doReset} disabled={!ready} style={{ width: '100%', padding: 12, fontSize: 15 }}>
        {done ? '✅ Reset complete — page will refresh' : '🔄 Factory Reset — delete everything'}
      </button>
    </div>
  );
}

// ── Demo Tab Component (Sprint 3) ────────────────────────────────
function DemoTab({ state, emit }) {
  const phase = state.app_state.current_phase;
  const demoOrder = state.app_state.speed_demo_order || [];
  const doneDemoIds = state.app_state.speed_demo_done_ids || [];
  const currentDemoId = state.app_state.speed_demo_current_team_id;
  const votes = state.audience_votes || {};
  const totalVotes = Object.values(votes).reduce((s,v) => s+v, 0);
  const maxVotes = Math.max(...Object.values(votes), 1);
  const weight = state.app_state.event_config?.audience_weight_percent ?? 10;

  if (phase !== 'speed_demo') {
    return (
      <div className="card" style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🎤</div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:8 }}>Speed Demo Phase</div>
        <div style={{ fontSize:13 }}>Advance to Speed Demo phase using the Control tab to unlock this panel.</div>
        {!state.app_state.event_config?.speed_demo_enabled && (
          <div style={{ marginTop:12, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--warning)' }}>
            ⚠ Speed Demo is disabled in Config — enable it before starting the event.
          </div>
        )}
      </div>
    );
  }

  const remaining = demoOrder.filter(id => !doneDemoIds.includes(id) && id !== currentDemoId);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Control card */}
      <div className="card card-lg" style={{ border:'1px solid var(--purple)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:16, color:'var(--purple)' }}>🎤 SPEED DEMO CONTROL</h2>

        {currentDemoId ? (
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:6, textTransform:'uppercase' }}>Currently Demoing</div>
            {(() => {
              const t = state.teams.find(x => x.id === currentDemoId);
              return t ? (
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:8, background:`${t.color}18`, border:`1px solid ${t.color}55`, marginBottom:16 }}>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:t.color }}/>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:22, flex:1, color:t.color }}>{t.name}</div>
                </div>
              ) : null;
            })()}
            <button className="btn-warning" onClick={()=>{ if(confirm('End this team\'s demo and move to next?')) emit('admin:next_demo_team',{}); }} style={{ width:'100%', padding:14, fontSize:15 }}>
              ⏭ End Demo / Next Team
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginBottom:12 }}>
              {remaining.length > 0 ? `${remaining.length} team(s) yet to demo — select one to start:` : 'All teams have demoed! Advance to Results.'}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {demoOrder.map(tid => {
                const t = state.teams.find(x => x.id === tid);
                if (!t) return null;
                const isDone = doneDemoIds.includes(tid);
                return (
                  <button key={tid} onClick={()=>{ if(!isDone) emit('admin:start_team_demo',{team_id:tid}); }}
                    disabled={isDone}
                    style={{ padding:'10px 18px', borderRadius:6, fontFamily:'var(--font-display)', fontSize:14,
                      background:isDone?'var(--bg3)':`${t.color}22`, border:`1px solid ${isDone?'var(--border)':t.color}`,
                      color:isDone?'var(--text3)':t.color, opacity:isDone?0.5:1, cursor:isDone?'default':'pointer' }}>
                    {isDone?'✓ ':''}{t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Vote tally */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, color:'var(--purple)' }}>Audience Votes</h3>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text3)' }}>{totalVotes} total · {weight}% weight</span>
        </div>
        {[...demoOrder].sort((a,b) => (votes[b]||0)-(votes[a]||0)).map(tid => {
          const t = state.teams.find(x => x.id === tid);
          if (!t) return null;
          const pct = Math.round(((votes[tid]||0)/maxVotes)*100);
          const bonus = Math.round(((votes[tid]||0)/maxVotes) * weight);
          return (
            <div key={tid} style={{ marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }}/>
                  <span style={{ fontFamily:'var(--font-display)', fontSize:14 }}>{t.name}</span>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>
                  <span style={{ color:t.color }}>{votes[tid]||0}</span>
                  <span style={{ color:'var(--text3)', marginLeft:8 }}>+{bonus}pts bonus</span>
                </div>
              </div>
              <div style={{ height:6, borderRadius:3, background:'var(--bg3)', overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:t.color, borderRadius:3, transition:'width 0.4s ease' }}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mirrors server/lib/utils.js normalizeAnswer() — kept in sync so the
// Analytics tab's "correct rate" reflects the same lenient grading the
// server actually used when scoring the quiz round.
function normalizeAnswerForDisplay(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([|:,=<>+\-*/])\s*/g, '$1')
    .trim()
    .replace(/[.;]+$/, '');
}

// ── Analytics Tab ─────────────────────────────────────────────────
// Everything here is derived from state already held in memory (event_log,
// team scores, quiz answers) — no extra server-side tracking needed.
function AnalyticsTab({ state }) {
  const teams = state.teams || [];
  const zones = state.zones || [];
  const log = state.event_log || [];

  // ── Gauntlet round difficulty ──
  const roundStats = {};
  teams.forEach(t => {
    (t.phase1_scores || []).forEach(s => {
      const r = roundStats[s.round] || (roundStats[s.round] = { round: s.round, attempts: 0, correct: 0, totalTime: 0 });
      r.attempts += 1;
      if (s.correct) { r.correct += 1; r.totalTime += s.time_taken_ms || 0; }
    });
  });
  const roundRows = Object.values(roundStats)
    .map(r => ({ ...r, correctRate: r.attempts ? Math.round((r.correct / r.attempts) * 100) : 0, avgTimeS: r.correct ? Math.round(r.totalTime / r.correct / 100) / 10 : null }))
    .sort((a, b) => a.round - b.round);

  // ── Zone contest stats (parsed from the event log) ──
  const zoneStats = zones.map(z => {
    let attempts = 0, fails = 0, captures = 0;
    log.forEach(e => {
      if (!e.message?.includes(z.name)) return;
      if (e.type === 'zone_attempt') attempts += 1;
      else if (e.type === 'zone_fail') fails += 1;
      else if (e.type === 'zone_captured') captures += 1;
    });
    return { name: z.name, attempts, fails, captures, failRate: attempts ? Math.round((fails / attempts) * 100) : 0 };
  }).filter(z => z.attempts > 0).sort((a, b) => b.failRate - a.failRate);

  // ── Quiz per-question difficulty ──
  const quizQuestions = state.app_state?.quiz_questions || [];
  const memberAnswers = state.app_state?.quiz_member_answers || {};
  const quizRows = quizQuestions.map(q => {
    let total = 0, correct = 0;
    Object.values(memberAnswers).forEach(members => {
      Object.values(members).forEach(answers => {
        if (answers[q.id] === undefined) return;
        total += 1;
        // Mirror the server's lenient grading (server/lib/utils.js) so this
        // stat matches what teams were actually scored on, not a stricter
        // exact-match approximation.
        if (normalizeAnswerForDisplay(answers[q.id]) === normalizeAnswerForDisplay(q.answer)) correct += 1;
      });
    });
    return { question: q.question, total, correct, correctRate: total ? Math.round((correct / total) * 100) : null };
  }).filter(q => q.total > 0).sort((a, b) => a.correctRate - b.correctRate);

  const activeCount = teams.filter(t => !t.is_eliminated).length;
  const helpCount = (state.help_requests || []).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
        {[
          ['Teams', teams.length, 'var(--text2)'],
          ['Active', activeCount, 'var(--accent)'],
          ['Zones Contested', zoneStats.length, 'var(--warning)'],
          ['Open Help Requests', helpCount, helpCount>0?'var(--danger)':'var(--text3)'],
        ].map(([l,v,c])=>(
          <div key={l} className="card" style={{ textAlign:'center', padding:14 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:26, fontWeight:700, color:c }}>{v}</div>
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:4, textTransform:'uppercase' }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>GAUNTLET ROUND DIFFICULTY</h3>
        {roundRows.length===0 ? <div style={{ color:'var(--text3)', fontSize:12, fontFamily:'var(--font-mono)' }}>No Phase 1 attempts yet.</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {roundRows.map(r=>(
              <div key={r.round} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--bg3)', borderRadius:6 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:12, width:70 }}>Round {r.round}</div>
                <div style={{ flex:1, height:8, borderRadius:4, background:'var(--bg)', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${r.correctRate}%`, background: r.correctRate<40?'var(--danger)':r.correctRate<70?'var(--warning)':'var(--accent)', borderRadius:4 }}/>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:12, width:110, textAlign:'right' }}>{r.correctRate}% correct · {r.attempts} tries</div>
                {r.avgTimeS!==null && <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', width:70, textAlign:'right' }}>{r.avgTimeS}s avg</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>HARDEST ZONES (by fail rate)</h3>
        {zoneStats.length===0 ? <div style={{ color:'var(--text3)', fontSize:12, fontFamily:'var(--font-mono)' }}>No zone attempts yet.</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {zoneStats.map(z=>(
              <div key={z.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--bg3)', borderRadius:6 }}>
                <div style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:12 }}>{z.name}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>{z.captures} captured</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:12, width:110, textAlign:'right', color: z.failRate>50?'var(--danger)':'var(--text2)' }}>{z.failRate}% fail · {z.attempts} tries</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>QUIZ QUESTIONS — HARDEST FIRST</h3>
        {quizRows.length===0 ? <div style={{ color:'var(--text3)', fontSize:12, fontFamily:'var(--font-mono)' }}>No quiz answers yet.</div> : (
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:400, overflowY:'auto' }}>
            {quizRows.map((q,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--bg3)', borderRadius:6 }}>
                <div style={{ flex:1, fontSize:12, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.question}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:12, width:120, textAlign:'right', color: q.correctRate<40?'var(--danger)':q.correctRate<70?'var(--warning)':'var(--accent)' }}>{q.correctRate}% correct · {q.total} ans</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── QR code image — generated fully client-side (offline-capable) ──
// The old version called api.qrserver.com over the internet, which defeats
// the point on a local-hotspot deployment with no internet (see README).
function QRImage({ text, size = 160 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        .then(url => { if (!cancelled) setSrc(url); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [text, size]);
  if (!src) return <div style={{ width: size, height: size, background: '#fff', borderRadius: 8, margin: '10px auto 8px' }} />;
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 8, background: 'white', padding: 6, display: 'block', margin: '10px auto 8px' }} />;
}

// ── QR Tab Component ─────────────────────────────────────────────
function QRTab({ state }) {
  const base = window.location.origin;
  const passcodeCache = state.passcodeCache || {};
  const [section, setSection] = useState('qr'); // 'qr' | 'cards'

  const selfRegOpen = !!state.app_state?.event_config?.self_registration;
  const cards = [
    { label: 'Team Join', path: '/', color: 'var(--accent)', icon: '🎯' },
    { label: selfRegOpen ? 'Self-Registration' : 'Self-Registration (closed)',
      sublabel: 'Team leader scans to register',
      path: '/register', color: 'var(--warning)', icon: '📝' },
    { label: 'Spectator', path: '/spectator', color: 'var(--info)', icon: '👁' },
    ...state.zones.map(z => ({
      label: z.name, sublabel: z.location, path: `/zone/${z.id}`, color: 'var(--warning)', icon: '🗺️'
    })),
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="no-print" style={{ display:'flex', gap:8 }}>
        {[['qr','📱 QR Codes'],['cards','🪪 Passcode Cards']].map(([k,l])=>(
          <button key={k} onClick={()=>setSection(k)} style={{ padding:'8px 16px', borderRadius:6, fontSize:12,
            background: section===k?'var(--bg3)':'transparent', border:`1px solid ${section===k?'var(--border2)':'transparent'}`,
            color: section===k?'var(--text)':'var(--text3)' }}>{l}</button>
        ))}
      </div>

      {section==='qr' && (
        <>
          <div className="card no-print" style={{ border:'1px solid var(--info)', padding:'14px 18px' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>
              Base URL: <span style={{ color:'var(--accent)' }}>{base}</span>
              <span style={{ marginLeft:12, color:'var(--text3)' }}>· Generated offline — works with no internet on a local hotspot</span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:14 }}>
            {cards.map((c, i) => (
              <div key={i} className="card" style={{ textAlign:'center', border:`1px solid ${c.color}44`, padding:18 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:14, color:c.color, marginBottom:2 }}>
                  {c.icon} {c.label}
                </div>
                {c.sublabel && (
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:8 }}>{c.sublabel}</div>
                )}
                <QRImage text={base + c.path} />
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', wordBreak:'break-all' }}>
                  {base}{c.path}
                </div>
              </div>
            ))}
          </div>
          <div className="no-print" style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', textAlign:'center' }}>
            QR codes update automatically when zones are added. Use browser Print (Ctrl+P) to print this tab.
          </div>
        </>
      )}

      {section==='cards' && (
        <>
          <div className="card no-print" style={{ border:'1px solid var(--accent)', padding:'14px 18px' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>
              {state.teams.length} team{state.teams.length!==1?'s':''} · Print (Ctrl+P) and cut along the card borders for the registration desk.
            </div>
          </div>
          <div className="passcode-cards">
            {state.teams.map(t => (
              <div key={t.id} className="passcode-card" style={{ borderColor: t.color }}>
                <div className="passcode-card-name" style={{ color: t.color }}>{t.name}</div>
                <div className="passcode-card-year">{t.year} Year</div>
                <div className="passcode-card-code">{passcodeCache[t.id] || '····'}</div>
                <div className="passcode-card-hint">team passcode — keep private</div>
              </div>
            ))}
          </div>
          {state.teams.length===0 && (
            <div style={{ textAlign:'center', padding:32, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>
              No teams registered yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Config Tab Component ─────────────────────────────────────────
// BUG FIX: admin previously had no clear signal for whether a Phase 1
// round was actually live, ended, or hadn't started — just the Start/End
// buttons quietly changing disabled state, with no timer at all. This
// makes it unambiguous, using the server-computed phase1_round_end so the
// countdown is synced rather than guessed.
function Phase1RoundStatus({ state }) {
  const { phase1_round_active, phase1_round, phase1_round_end, phase1_paused_mid_round } = state.app_state;
  const timer = useCountdown(phase1_round_active ? phase1_round_end : null);
  const timesUp = phase1_round_active && timer?.isDone;

  // BUG FIX: master pause used to leave phase1_round_active=false with no
  // indication the round was actually just paused, not ended — this
  // showed "Round ended, click Start Round X+1" mid-pause, which would
  // have let an admin accidentally skip straight to a new round instead
  // of resuming the paused one.
  if (phase1_paused_mid_round) {
    return (
      <div style={{ marginTop:10, padding:'8px 14px', background:'color-mix(in srgb, var(--warning) 10%, transparent)', border:'1px solid var(--warning)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--warning)' }}>
        ⏸ Round {phase1_round} paused — timer frozen, resumes where it left off.
      </div>
    );
  }

  if (!phase1_round_active) {
    return (
      <div style={{ marginTop:10, padding:'8px 14px', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)' }}>
        {phase1_round > 0 ? `⏹ Round ${phase1_round} ended — click "Start Round ${phase1_round + 1}" when ready.` : '⏳ No round started yet.'}
      </div>
    );
  }

  return (
    <div style={{
      marginTop:10, padding:'10px 16px', borderRadius:6, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
      background: timesUp ? 'color-mix(in srgb, var(--danger) 12%, transparent)' : 'color-mix(in srgb, var(--accent) 8%, transparent)',
      border: `1px solid ${timesUp ? 'var(--danger)' : 'var(--accent)'}`,
    }}>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: timesUp ? 'var(--danger)' : 'var(--accent)', fontWeight:700 }}>
        {timesUp ? "⏰ TIME'S UP" : '● ROUND LIVE'}
      </span>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text2)' }}>Round {phase1_round}</span>
      {timer && <span style={{ fontFamily:'var(--font-mono)', fontSize:16, fontWeight:700, color: timesUp ? 'var(--danger)' : 'var(--text)', marginLeft:'auto' }}>{timer.formatted}</span>}
      {timesUp && <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--danger)' }}>→ click "End + Eliminate" above</span>}
    </div>
  );
}

// BUG FIX: this used to be defined *inside* ConfigTab's render body. Every
// keystroke called setForm, which re-rendered ConfigTab, which redefined F
// as a brand-new function — React then saw a different component type on
// every render and remounted the <input> from scratch, killing focus after
// every single character (type "n", input loses focus, click back in, type
// "i", ...). Hoisting it to module scope gives it a stable identity across
// renders, so React reconciles it as the same input and focus survives.
function ConfigField({ form, setForm, label, field, type='number', min, max, step=1, unit='' }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <input type={type} value={form[field]} min={min} max={max} step={step}
        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
        style={{ fontFamily:'var(--font-mono)', fontSize:15 }} />
    </div>
  );
}

function ConfigTab({ state, emit }) {
  const cfg = state.app_state.event_config || {};
  const [form, setForm] = useState({
    event_name: cfg.event_name || 'CODE SPRINT 2.0',
    college_name: cfg.college_name || '',
    phases_enabled: cfg.phases_enabled || ['phase1', 'quiz_round', 'phase2', 'phase3'],
    phase1_rounds: String(cfg.phase1_rounds ?? 5),
    quiz_num_questions: String(cfg.quiz_num_questions ?? 50),
    quiz_duration_min: String(cfg.quiz_duration_min ?? 30),
    phase2_duration_min: String(cfg.phase2_duration_min ?? 90),
    phase3_duration_min: String(cfg.phase3_duration_min ?? 150),
    battery_drain_rate: String(cfg.battery_drain_rate ?? 2),
    battery_attempt_cost: String(cfg.battery_attempt_cost ?? 5),
    battery_capture_gain: String(cfg.battery_capture_gain ?? 20),
    // Sprint 3
    speed_demo_enabled: cfg.speed_demo_enabled || false,
    speed_demo_duration_sec: String(cfg.speed_demo_duration_sec ?? 90),
    audience_weight_percent: String(cfg.audience_weight_percent ?? 10),
    reveal_top_n: String(cfg.reveal_top_n ?? 0),
    // CODE ARENA missions
    quiz_question_source: cfg.quiz_question_source || 'dsa',
    quiz_marks: String(cfg.quiz_marks ?? 20),
    bughunt_duration_min: String(cfg.bughunt_duration_min ?? 30),
    bughunt_marks: String(cfg.bughunt_marks ?? 30),
    bughunt_num_programs: String(cfg.bughunt_num_programs ?? 5),
    codestrike_duration_min: String(cfg.codestrike_duration_min ?? 45),
    codestrike_marks: String(cfg.codestrike_marks ?? 50),
  });

  const togglePhase = (p) => {
    const enabled = form.phases_enabled.includes(p)
      ? form.phases_enabled.filter(x => x !== p)
      : [...form.phases_enabled, p];
    setForm(f => ({ ...f, phases_enabled: enabled }));
  };

  const save = () => {
    // Parse all number fields on save — not on every keystroke (fixes freeze bug)
    emit('admin:save_config', { config: {
      ...form,
      phase1_rounds: parseInt(form.phase1_rounds) || 5,
      quiz_num_questions: parseInt(form.quiz_num_questions) || 50,
      quiz_duration_min: parseInt(form.quiz_duration_min) || 30,
      phase2_duration_min: parseInt(form.phase2_duration_min) || 90,
      phase3_duration_min: parseInt(form.phase3_duration_min) || 150,
      battery_drain_rate: parseFloat(form.battery_drain_rate) || 2,
      battery_attempt_cost: parseFloat(form.battery_attempt_cost) || 5,
      battery_capture_gain: parseFloat(form.battery_capture_gain) || 20,
      speed_demo_duration_sec: parseInt(form.speed_demo_duration_sec) || 90,
      audience_weight_percent: parseInt(form.audience_weight_percent) || 10,
      reveal_top_n: parseInt(form.reveal_top_n) || 0,
      quiz_marks: parseInt(form.quiz_marks) || 20,
      bughunt_duration_min: parseInt(form.bughunt_duration_min) || 30,
      bughunt_marks: parseInt(form.bughunt_marks) || 30,
      bughunt_num_programs: parseInt(form.bughunt_num_programs) || 5,
      codestrike_duration_min: parseInt(form.codestrike_duration_min) || 45,
      codestrike_marks: parseInt(form.codestrike_marks) || 50,
    }});
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div className="card card-lg" style={{ border:'1px solid var(--info)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:16, color:'var(--info)' }}>⚙️ EVENT CONFIGURATION</h2>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <ConfigField form={form} setForm={setForm} label="Event Name" field="event_name" type="text" />
          <ConfigField form={form} setForm={setForm} label="College / Org Name" field="college_name" type="text" />
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:8, textTransform:'uppercase' }}>Phases to Run</label>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[['phase1','Phase 1 — Gauntlet'],['quiz_round','Timed Quiz / Intelligence Scan'],['bug_hunt','Bug Hunt — Fix Broken Code'],['code_strike','Code Strike — 3 Problems'],['phase2','Campus Conquest — Zones'],['phase3','Final Build'],['speed_demo','Speed Demo — Audience Vote']].map(([key,label])=>(
              <button key={key} onClick={()=>togglePhase(key)} style={{
                padding:'8px 16px', borderRadius:6, fontSize:13,
                background: form.phases_enabled.includes(key) ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg3)',
                border: `1px solid ${form.phases_enabled.includes(key) ? 'var(--accent)' : 'var(--border)'}`,
                color: form.phases_enabled.includes(key) ? 'var(--accent)' : 'var(--text3)',
                textTransform:'none', letterSpacing:'normal', fontFamily:'var(--font-body)',
              }}>
                {form.phases_enabled.includes(key) ? '✓ ' : ''}{label}
              </button>
            ))}
          </div>
        </div>

        {/* UX FIX: only the settings for phases actually ticked above are
            shown — toggling a phase reveals/hides its section instantly,
            so the form always matches the event being configured. */}
        {(form.phases_enabled.includes('phase1') || form.phases_enabled.includes('phase2') || form.phases_enabled.includes('phase3')) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
          {form.phases_enabled.includes('phase1') && <ConfigField form={form} setForm={setForm} label="Phase 1 Rounds" field="phase1_rounds" min={1} max={10} />}
          {form.phases_enabled.includes('phase2') && <ConfigField form={form} setForm={setForm} label="Phase 2 Duration" field="phase2_duration_min" min={15} max={240} unit="min" />}
          {form.phases_enabled.includes('phase3') && <ConfigField form={form} setForm={setForm} label="Phase 3 Duration" field="phase3_duration_min" min={30} max={360} unit="min" />}
        </div>
        )}

        {form.phases_enabled.includes('quiz_round') && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Quiz Round Settings</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <ConfigField form={form} setForm={setForm} label="Number of Questions" field="quiz_num_questions" min={5} max={100} />
            <ConfigField form={form} setForm={setForm} label="Quiz Duration" field="quiz_duration_min" min={5} max={120} unit="min" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ display:'block', fontSize:10, color:'var(--text3)', fontFamily:'var(--font-mono)', marginBottom:4, textTransform:'uppercase' }}>Question Bank</label>
              <select value={form.quiz_question_source} onChange={e=>setForm(f=>({...f, quiz_question_source:e.target.value}))}>
                <option value="dsa">DSA pool (original 50)</option>
                <option value="arena">Multi-topic pool (Java/C/C++/Python/DBMS/OS/Git/Web/Aptitude)</option>
                <option value="both">Both pools combined</option>
              </select>
            </div>
            <ConfigField form={form} setForm={setForm} label="Quiz Marks (combined board)" field="quiz_marks" min={1} max={100} />
          </div>
        </div>
        )}

        {form.phases_enabled.includes('bug_hunt') && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Bug Hunt Settings</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <ConfigField form={form} setForm={setForm} label="Programs Per Team" field="bughunt_num_programs" min={1} max={8} />
            <ConfigField form={form} setForm={setForm} label="Duration" field="bughunt_duration_min" min={5} max={120} unit="min" />
            <ConfigField form={form} setForm={setForm} label="Total Marks" field="bughunt_marks" min={1} max={100} />
          </div>
        </div>
        )}

        {form.phases_enabled.includes('code_strike') && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Code Strike Settings</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <ConfigField form={form} setForm={setForm} label="Duration" field="codestrike_duration_min" min={10} max={180} unit="min" />
            <ConfigField form={form} setForm={setForm} label="Total Marks" field="codestrike_marks" min={1} max={100} />
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:6 }}>
            3 problems (Easy 10 / Medium 15 / Hard 25) scaled to Total Marks. Score = 70% correctness + 20% efficiency + 10% submission-time bonus.
          </div>
        </div>
        )}

        {form.phases_enabled.includes('phase2') && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Battery Settings</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <ConfigField form={form} setForm={setForm} label="Drain Rate" field="battery_drain_rate" min={0.5} max={10} step={0.5} unit="%/min" />
            <ConfigField form={form} setForm={setForm} label="Attempt Cost" field="battery_attempt_cost" min={0} max={30} unit="%" />
            <ConfigField form={form} setForm={setForm} label="Capture Gain" field="battery_capture_gain" min={0} max={50} unit="%" />
          </div>
        </div>
        )}

        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Speed Demo Phase (Sprint 3)</div>
          <div style={{ marginBottom:10 }}>
            <button onClick={()=>setForm(f=>({...f,speed_demo_enabled:!f.speed_demo_enabled}))} style={{
              padding:'8px 16px', borderRadius:6, fontSize:13,
              background:form.speed_demo_enabled?'color-mix(in srgb, var(--purple) 12%, transparent)':'var(--bg3)',
              border:`1px solid ${form.speed_demo_enabled?'var(--purple)':'var(--border)'}`,
              color:form.speed_demo_enabled?'var(--purple)':'var(--text3)',
              textTransform:'none', letterSpacing:'normal', fontFamily:'var(--font-body)',
            }}>{form.speed_demo_enabled?'✓ Enabled':'○ Disabled'} — Speed Demo Phase</button>
          </div>
          {form.speed_demo_enabled&&(
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <ConfigField form={form} setForm={setForm} label="Demo Duration Per Team" field="speed_demo_duration_sec" min={30} max={300} unit="sec" />
              <ConfigField form={form} setForm={setForm} label="Audience Vote Weight" field="audience_weight_percent" min={0} max={30} unit="% of score" />
            </div>
          )}
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Results Reveal</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <ConfigField form={form} setForm={setForm} label="Reveal Top N Places (0 = everyone)" field="reveal_top_n" min={0} max={200} />
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:6 }}>
            Limits the dramatic one-by-one reveal to just the top N teams instead of clicking through the whole field — useful for large events.
          </div>
        </div>

        {/* ── Event Templates ─────────────────────────────── */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Quick Templates</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {[
              { label:'🏆 Full Event', desc:'All phases, defaults', preset:{
                phases_enabled:['phase1','quiz_round','phase2','phase3'],
                phase1_rounds:'5', quiz_num_questions:'50', quiz_duration_min:'30',
                phase2_duration_min:'90', phase3_duration_min:'150',
                battery_drain_rate:'2', battery_attempt_cost:'5', battery_capture_gain:'20',
                speed_demo_enabled:false,
              }},
              { label:'⚡ Quick Quiz', desc:'Phase 1 only', preset:{
                phases_enabled:['phase1'],
                phase1_rounds:'8', quiz_num_questions:'50', quiz_duration_min:'30',
                phase2_duration_min:'90', phase3_duration_min:'150',
                battery_drain_rate:'2', battery_attempt_cost:'5', battery_capture_gain:'20',
                speed_demo_enabled:false,
              }},
              { label:'🗺️ Zone Wars', desc:'Phase 2 only', preset:{
                phases_enabled:['phase2'],
                phase1_rounds:'5', quiz_num_questions:'50', quiz_duration_min:'30',
                phase2_duration_min:'60', phase3_duration_min:'150',
                battery_drain_rate:'3', battery_attempt_cost:'10', battery_capture_gain:'25',
                speed_demo_enabled:false,
              }},
              { label:'🏗️ Hackathon', desc:'Build + Demo', preset:{
                phases_enabled:['phase3','speed_demo'],
                phase1_rounds:'5', quiz_num_questions:'50', quiz_duration_min:'30',
                phase2_duration_min:'90', phase3_duration_min:'180',
                battery_drain_rate:'2', battery_attempt_cost:'5', battery_capture_gain:'20',
                speed_demo_enabled:true, speed_demo_duration_sec:'120', audience_weight_percent:'20',
              }},
              { label:'🎯 Full + Demo', desc:'Everything', preset:{
                phases_enabled:['phase1','quiz_round','phase2','phase3','speed_demo'],
                phase1_rounds:'5', quiz_num_questions:'50', quiz_duration_min:'30',
                phase2_duration_min:'90', phase3_duration_min:'150',
                battery_drain_rate:'2', battery_attempt_cost:'5', battery_capture_gain:'20',
                speed_demo_enabled:true, speed_demo_duration_sec:'90', audience_weight_percent:'10',
              }},
              { label:'⚔️ CODE ARENA 2026', desc:'Reboot Club: Scan → Bug Hunt → Code Strike', preset:{
                event_name:'CODE ARENA 2026',
                phases_enabled:['quiz_round','bug_hunt','code_strike'],
                quiz_num_questions:'20', quiz_duration_min:'25', quiz_question_source:'arena', quiz_marks:'20',
                bughunt_num_programs:'5', bughunt_duration_min:'30', bughunt_marks:'30',
                codestrike_duration_min:'45', codestrike_marks:'50',
                speed_demo_enabled:false,
              }},
            ].map(({ label, desc, preset }) => (
              <button key={label} onClick={() => setForm(f => ({ ...f, ...preset }))}
                style={{ padding:'8px 14px', borderRadius:6, fontFamily:'var(--font-body)', fontSize:13,
                  background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)',
                  cursor:'pointer', textAlign:'left', textTransform:'none', letterSpacing:'normal' }}>
                <div>{label}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:6 }}>
            Templates fill the form — still click Save to apply.
          </div>
        </div>

        <button className="btn-primary" onClick={save} style={{ width:'100%', padding:14, fontSize:15 }}>
          💾 Save Configuration
        </button>
        <div style={{ marginTop:10, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
          Save before starting team registration. Event name appears on all screens. Phases disabled here are skipped automatically.
        </div>
      </div>

      {/* Live preview of current saved config */}
      <div className="card" style={{ background:'var(--bg3)' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', textTransform:'uppercase', marginBottom:10 }}>Current Saved Config</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {/* Only rows for what this event actually runs */}
          {(() => { const en = cfg.phases_enabled || []; return [
            ['Event', cfg.event_name || '—'],
            ['College', cfg.college_name || '—'],
            ['Phases', en.join(' → ') || '—'],
            ...(en.includes('phase1') ? [['P1 Rounds', cfg.phase1_rounds]] : []),
            ...(en.includes('phase2') ? [
              ['P2 Duration', `${cfg.phase2_duration_min} min`],
              ['Battery Drain', `${cfg.battery_drain_rate}%/min`],
              ['Attempt Cost', `${cfg.battery_attempt_cost}%`],
              ['Capture Gain', `+${cfg.battery_capture_gain}%`],
            ] : []),
            ...(en.includes('phase3') ? [['P3 Duration', `${cfg.phase3_duration_min} min`]] : []),
            ...(cfg.speed_demo_enabled || en.includes('speed_demo') ? [['Speed Demo', `✓ ${cfg.speed_demo_duration_sec}s / ${cfg.audience_weight_percent}% weight`]] : []),
            ...(en.includes('quiz_round') ? [['Quiz', `${cfg.quiz_num_questions}Q · ${cfg.quiz_duration_min} min · ${cfg.quiz_question_source || 'dsa'} bank · ${cfg.quiz_marks ?? 20} marks`]] : []),
            ...(en.includes('bug_hunt') ? [['Bug Hunt', `${cfg.bughunt_num_programs ?? 5} programs · ${cfg.bughunt_duration_min ?? 30} min · ${cfg.bughunt_marks ?? 30} marks`]] : []),
            ...(en.includes('code_strike') ? [['Code Strike', `${cfg.codestrike_duration_min ?? 45} min · ${cfg.codestrike_marks ?? 50} marks`]] : []),
          ]; })().map(([l,v])=>(
            <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'0.5px solid var(--border)', fontSize:12 }}>
              <span style={{ color:'var(--text3)' }}>{l}</span>
              <span style={{ fontFamily:'var(--font-mono)', color:'var(--accent)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Snapshots + Past-Event Archives ────────────────────────────────
// Snapshots are an automatic local safety net (every 5 min, plus before any
// restore/reset) against a corrupted write or a fat-fingered admin action.
// Archives are a full copy of a completed event saved automatically when
// Factory Reset runs, so results aren't lost when the DB is wiped for the
// next run. Note: on hosts with an ephemeral disk (e.g. Render free tier)
// both live only as long as the container does — download anything you
// want to keep before a redeploy.
function SnapshotsAndArchives() {
  const authHeader = () => ({ 'x-admin-token': sessionStorage.getItem('admin_session') || '' });
  const [snapshots, setSnapshots] = useState([]);
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/admin/snapshots', { headers: authHeader() }),
        fetch('/api/admin/archives', { headers: authHeader() }),
      ]);
      const s = await sRes.json();
      const a = await aRes.json();
      setSnapshots(s.snapshots || []);
      setArchives(a.archives || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const restoreSnapshot = async (filename) => {
    const takenAt = snapshots.find(s => s.filename === filename)?.taken_at;
    const when = takenAt ? new Date(takenAt).toLocaleString() : filename;
    if (!confirm(`Restore snapshot from ${when}? Current live data will be overwritten (a safety snapshot is taken first).`)) return;
    setBusy(filename);
    try {
      const res = await fetch(`/api/admin/snapshots/${encodeURIComponent(filename)}/restore`, { method:'POST', headers: authHeader() });
      const data = await res.json();
      if (data.success) alert(`✅ Restored. Teams: ${data.teams} · Zones: ${data.zones}`);
      else alert('Error: ' + JSON.stringify(data));
    } catch (e) { alert('Error: ' + e.message); }
    setBusy(null);
    load();
  };

  const downloadArchive = (filename) => {
    fetch(`/api/admin/archives/${encodeURIComponent(filename)}`, { headers: authHeader() })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="card card-lg" style={{ border:'1px solid var(--warning)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, color:'var(--warning)' }}>🕐 AUTO-SNAPSHOTS</h3>
          <button className="btn-ghost" onClick={load} style={{ fontSize:11, padding:'4px 10px' }}>{loading?'...':'↻ Refresh'}</button>
        </div>
        <p style={{ fontSize:12, color:'var(--text2)', marginBottom:12, lineHeight:1.6 }}>
          A local recovery point is saved automatically every 5 minutes, plus right before any restore or factory reset. Restoring takes a safety snapshot of the current state first.
        </p>
        {snapshots.length===0 ? (
          <div style={{ color:'var(--text3)', fontSize:12, fontFamily:'var(--font-mono)' }}>No snapshots yet.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
            {snapshots.map(s => (
              <div key={s.filename} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'var(--bg3)', borderRadius:6 }}>
                <div style={{ flex:1, fontFamily:'var(--font-mono)', fontSize:12 }}>{new Date(s.taken_at).toLocaleString()}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>{s.size_kb}KB</div>
                <button className="btn-ghost" disabled={busy===s.filename} onClick={()=>restoreSnapshot(s.filename)} style={{ fontSize:11, padding:'4px 10px', color:'var(--warning)', borderColor:'var(--warning)' }}>
                  {busy===s.filename?'...':'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card card-lg" style={{ border:'1px solid var(--purple)' }}>
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:8, color:'var(--purple)' }}>🗄️ PAST EVENTS</h3>
        <p style={{ fontSize:12, color:'var(--text2)', marginBottom:12, lineHeight:1.6 }}>
          Every Factory Reset automatically archives the completed event (teams, scores, top 3) before wiping. Download to keep it permanently — the archive itself only lives as long as this server's disk.
        </p>
        {archives.length===0 ? (
          <div style={{ color:'var(--text3)', fontSize:12, fontFamily:'var(--font-mono)' }}>No past events archived yet — this fills up after your first Factory Reset.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {archives.map(a => (
              <div key={a.filename} style={{ padding:'10px 14px', background:'var(--bg3)', borderRadius:6 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:14 }}>{a.event_name}</div>
                  <button className="btn-ghost" onClick={()=>downloadArchive(a.filename)} style={{ fontSize:11, padding:'4px 10px' }}>⬇ Download</button>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>
                  {new Date(a.archived_at).toLocaleString()} · {a.teams_count} teams · reached {a.phase_reached}
                  {a.top_teams?.length > 0 && <> · 🥇 {a.top_teams[0].name}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 🎨 Theme tab — full-spectrum color pickers, live preview ──────
// Every color in the app derives from 6 CSS variables, so this edits
// those. Picks preview instantly on THIS screen; "Apply to All Screens"
// broadcasts via event_config so teams + spectator re-theme live.
const THEME_PRESETS = [
  { label:'🏛 Colosseum', desc:'Molten gold on torchlit ink (default)', theme: { ...DEFAULT_THEME } },
  { label:'🖥 Neon Terminal', desc:'The original green-on-black hacker look', theme: { accent:'#00ff88', danger:'#ff3355', warning:'#ffaa00', info:'#00aaff', purple:'#aa55ff', bg:'#0a0a0f' } },
  { label:'👑 Royal', desc:'Indigo, lavender & midnight', theme: { accent:'#8b7cf8', danger:'#ff5470', warning:'#ffb454', info:'#64b5f6', purple:'#c792ea', bg:'#110f1d' } },
  { label:'🔥 Inferno', desc:'Fire orange on scorched black', theme: { accent:'#ff6b35', danger:'#ff2e2e', warning:'#ffc53d', info:'#90a4b8', purple:'#d96aa0', bg:'#160c08' } },
  { label:'🌊 Abyss', desc:'Teal & deep-sea blue', theme: { accent:'#35d0ba', danger:'#ff5c5c', warning:'#ffb020', info:'#58a6ff', purple:'#9d8cff', bg:'#0a1016' } },
  { label:'🌸 Sakura', desc:'Pink & plum on charcoal', theme: { accent:'#ff8fab', danger:'#ff4d6d', warning:'#ffb347', info:'#7fb8d8', purple:'#c77dff', bg:'#151015' } },
];

const THEME_TOKENS = [
  ['accent', 'Primary / Success', 'Buttons, scores, captures, correct answers — the brand color'],
  ['bg', 'Background', 'Dark-mode backdrop — cards and borders are derived from it'],
  ['danger', 'Danger', 'Eliminations, wrong answers, violations, Bug Hunt'],
  ['warning', 'Warning', 'Timers, pauses, help requests'],
  ['info', 'Info', 'Quiz round, neutral highlights'],
  ['purple', 'Flair', 'Results, Code Strike, spectator drama'],
];

function ThemeTab({ state, emit }) {
  const saved = state.app_state?.event_config?.theme || null;
  const [draft, setDraft] = useState({ ...DEFAULT_THEME, ...(saved || {}) });

  // BUG FIX: the unmount cleanup used to close over `saved` from the
  // render that created the effect. Because the effect only re-runs when
  // `draft` changes, clicking "Apply to All Screens" (which changes
  // `saved`, not `draft`) left the cleanup holding the PREVIOUS theme —
  // so leaving the Theme tab silently reverted the whole panel, and
  // AppContext never re-applied because its value hadn't changed since.
  // Net effect: the theme appeared to work only on the Theme page.
  // A ref keeps the cleanup pointed at whatever is actually saved now.
  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  // Live preview on this screen only; on leaving the tab, snap back to
  // the theme that's actually saved (AppContext owns it from there).
  useEffect(() => {
    applyCustomTheme(draft);
    return () => applyCustomTheme(savedRef.current);
  }, [draft]);

  const setColor = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  // Key-order-independent comparison (JSON.stringify was fragile)
  const isDefault = Object.keys(DEFAULT_THEME).every(k => (draft[k] || '').toLowerCase() === DEFAULT_THEME[k]);
  // Does what I'm previewing match what every other screen is showing?
  // (saved === null means everyone is on the stock palette)
  const savedEffective = saved || DEFAULT_THEME;
  const isLive = Object.keys(DEFAULT_THEME).every(k =>
    (draft[k] || '').toLowerCase() === (savedEffective[k] || '').toLowerCase());

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="card card-lg" style={{ border:'1px solid var(--accent)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:18, marginBottom:6, color:'var(--accent)' }}>🎨 EVENT THEME</h2>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16, lineHeight:1.6 }}>
          Every color in the app derives from these six. Changes preview <strong>live on this screen</strong> as you pick;
          hit <strong>Apply to All Screens</strong> to push the theme to every team phone, zone laptop and the spectator projector instantly.
          Button text and light-mode contrast adjust themselves automatically.
        </div>

        {/* Pickers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12, marginBottom:18 }}>
          {THEME_TOKENS.map(([key, label, desc]) => (
            <div key={key} style={{ display:'flex', gap:12, alignItems:'center', padding:'10px 12px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border)' }}>
              <input
                type="color"
                value={draft[key] || '#000000'}
                onChange={e=>setColor(key, e.target.value)}
                style={{ width:52, height:44, padding:2, borderRadius:8, border:'1px solid var(--border2)', background:'var(--bg2)', cursor:'pointer', flexShrink:0 }}
                title={`Pick ${label} — full spectrum + eyedropper`}
              />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</div>
                <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.4, marginTop:2 }}>{desc}</div>
              </div>
              <input
                type="text"
                value={draft[key] || ''}
                onChange={e=>{ const v = e.target.value; setDraft(d => ({ ...d, [key]: v })); }}
                onBlur={e=>{ if(!/^#[0-9a-f]{6}$/i.test(e.target.value)) setColor(key, DEFAULT_THEME[key]); }}
                maxLength={7}
                style={{ width:84, fontFamily:'var(--font-mono)', fontSize:12, textAlign:'center', flexShrink:0 }}
              />
            </div>
          ))}
        </div>

        {/* Live sample strip — real classes, so it always matches reality */}
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Live Preview</div>
        <div className="card" style={{ marginBottom:18 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
            <button className="btn-primary" style={{ padding:'8px 16px', fontSize:12 }}>Primary</button>
            <button className="btn-danger" style={{ padding:'8px 16px', fontSize:12 }}>Eliminate</button>
            <button className="btn-warning" style={{ padding:'8px 16px', fontSize:12 }}>Pause</button>
            <button className="btn-info" style={{ padding:'8px 16px', fontSize:12 }}>Info</button>
            <button className="btn-ghost" style={{ padding:'8px 16px', fontSize:12 }}>Ghost</button>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <span className="badge badge-success">Captured</span>
            <span className="badge badge-danger">Out</span>
            <span className="badge badge-warning">Busy</span>
            <span className="badge badge-info">Neutral</span>
            <span className="badge badge-purple">Reveal</span>
            <span style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--accent)', marginLeft:8 }}>SCORE 120</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text2)' }}>· body text</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)' }}>· muted</span>
          </div>
        </div>

        {/* Presets */}
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Presets — click to load into the pickers</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:18 }}>
          {THEME_PRESETS.map(p => (
            <button key={p.label} onClick={()=>setDraft({ ...p.theme })}
              style={{ padding:'8px 14px', borderRadius:6, fontFamily:'var(--font-body)', fontSize:13,
                background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)',
                cursor:'pointer', textAlign:'left', textTransform:'none', letterSpacing:'normal',
                display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ display:'flex', gap:3 }}>
                {['accent','danger','info','purple'].map(k => (
                  <span key={k} style={{ width:12, height:12, borderRadius:'50%', background:p.theme[k], border:'1px solid rgba(0,0,0,0.3)' }}/>
                ))}
              </span>
              <span>
                <div>{p.label}</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>{p.desc}</div>
              </span>
            </button>
          ))}
        </div>

        {/* Status — is what I'm looking at actually live for everyone?
            UX FIX: previously Apply sat behind a confirm() and gave no
            feedback at all, so a dismissed dialog (or never pressing it)
            looked identical to a successful apply — the preview made the
            admin's own screen look themed either way. */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          padding:'10px 14px', borderRadius:8, marginBottom:12,
          border:`1px solid ${isLive ? 'var(--accent)' : 'var(--warning)'}`,
          background: isLive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'color-mix(in srgb, var(--warning) 8%, transparent)',
        }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: isLive ? 'var(--accent)' : 'var(--warning)' }}>
            {isLive ? '● LIVE ON ALL SCREENS' : '○ PREVIEW ONLY — not applied yet'}
          </span>
          <span style={{ fontSize:12, color:'var(--text3)', flex:1, minWidth:180 }}>
            {isLive
              ? 'Teams, zone laptops and the projector are using these colors.'
              : 'You are the only one seeing these colors. Click Apply to push them everywhere.'}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn-primary" style={{ flex:1, padding:14, fontSize:15, minWidth:220 }}
            disabled={isLive}
            onClick={()=>emit('admin:set_theme',{ theme: isDefault ? null : draft })}>
            {isLive ? '✓ Applied to All Screens' : '🎨 Apply to All Screens'}
          </button>
          <button className="btn-ghost" style={{ padding:14, fontSize:13 }}
            onClick={()=>{ setDraft({ ...DEFAULT_THEME }); emit('admin:set_theme',{ theme:null }); }}>
            ↩ Reset to Default
          </button>
        </div>
        <div style={{ marginTop:10, fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', lineHeight:1.6 }}>
          The theme survives restarts and config saves. Light mode auto-darkens your picks so they stay readable on the pale background.
        </div>
      </div>
    </div>
  );
}

// ── CODE ARENA: Bug Hunt tab — control + review + overrides ───────
function BugHuntTab({ state, emit, phase }) {
  const s = state.app_state;
  const cfg = s.event_config || {};
  const active = s.bughunt_active;
  const paused = s.bughunt_paused;
  const programs = s.bughunt_programs || [];
  const submittedTeams = state.teams.filter(t => !t.is_eliminated && t.bughunt_submitted_at);
  const graded = state.teams.some(t => t.bughunt_score !== null && t.bughunt_score !== undefined);

  // Review data — pull-only, includes expected answers (admin eyes only)
  const [review, setReview] = useState(null);
  const [overrideDraft, setOverrideDraft] = useState({}); // `${team_id}_${prog_id}` -> marks
  const loadReview = () => {
    const socket = getSocket();
    socket.emit('admin:request_bughunt_review', { admin_token: sessionStorage.getItem('admin_session') || '' });
  };
  useEffect(() => {
    const socket = getSocket();
    const onReview = (d) => setReview(d);
    socket.on('admin:bughunt_review', onReview);
    loadReview();
    return () => socket.off('admin:bughunt_review', onReview);
  }, []);
  // Refresh review after any override ack
  useEffect(() => {
    const socket = getSocket();
    const onSaved = () => loadReview();
    socket.on('admin:bughunt_override_saved', onSaved);
    return () => socket.off('admin:bughunt_override_saved', onSaved);
  }, []);

  const perProgramMarks = Math.round(((cfg.bughunt_marks ?? 30) / ((programs.length || cfg.bughunt_num_programs || 5))) * 10) / 10;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Status + controls */}
      <div className="card card-lg" style={{ border:`1px solid ${active ? 'var(--danger)' : 'var(--border)'}` }}>
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--danger)', marginBottom:16 }}>🐛 BUG HUNT CONTROL</h3>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            ['Status', active ? (paused ? 'PAUSED' : 'LIVE') : 'IDLE', active ? (paused ? 'var(--warning)' : 'var(--accent)') : 'var(--text3)'],
            ['Programs', programs.length || (cfg.bughunt_num_programs ?? 5), 'var(--danger)'],
            ['Submitted', `${submittedTeams.length}/${state.teams.filter(t=>!t.is_eliminated).length}`, 'var(--accent)'],
            ['Config', `${cfg.bughunt_num_programs ?? 5}P / ${cfg.bughunt_duration_min ?? 30}min / ${cfg.bughunt_marks ?? 30}m`, 'var(--text2)'],
          ].map(([l,v,c])=>(
            <div key={l} style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:4, textTransform:'uppercase' }}>{l}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {active && s.bughunt_timer_end && !paused && (
          <div style={{ textAlign:'center', padding:'12px 0', marginBottom:16 }}>
            <CountdownTimer endTime={s.bughunt_timer_end} label="Bug Hunt Timer" />
          </div>
        )}
        {active && paused && (
          <div style={{ textAlign:'center', padding:'10px', marginBottom:16, background:'color-mix(in srgb, var(--warning) 10%, transparent)', border:'1px solid var(--warning)', borderRadius:8, fontFamily:'var(--font-mono)', color:'var(--warning)' }}>
            ⏸ PAUSED — {Math.round((s.bughunt_paused_remaining_ms||0)/60000)} min remaining
          </div>
        )}

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {!active && (
            <button className="btn-danger" style={{ flex:1, padding:14, fontSize:15 }}
              onClick={()=>{ if(phase!=='bug_hunt'){alert('Advance to the Bug Hunt phase first (Control tab).');return;} if(confirm(`Start Bug Hunt? ${cfg.bughunt_num_programs ?? 5} programs, ${cfg.bughunt_duration_min ?? 30} min. Any previous Bug Hunt scores are cleared.`)) emit('admin:start_bughunt',{}); }}>
              ▶ Start Bug Hunt ({cfg.bughunt_num_programs ?? 5} programs)
            </button>
          )}
          {active && !paused && (
            <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--warning)', borderRadius:6, color:'var(--warning)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
              onClick={()=>emit('admin:pause_bughunt',{})}>⏸ Pause</button>
          )}
          {active && paused && (
            <button className="btn-primary" style={{ flex:1, padding:12 }}
              onClick={()=>emit('admin:resume_bughunt',{})}>▶ Resume</button>
          )}
          {active && (
            <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--danger)', borderRadius:6, color:'var(--danger)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
              onClick={()=>{ if(confirm(`End Bug Hunt and auto-grade all fixes?\n\n${submittedTeams.length}/${state.teams.filter(t=>!t.is_eliminated).length} teams have submitted — teams that haven't score 0 (override later if needed).`)) emit('admin:end_bughunt',{}); }}>
              ⏹ End & Grade
            </button>
          )}
        </div>

        {active && (
          <div style={{ marginTop:14 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:8, textTransform:'uppercase' }}>Adjust Timer</div>
            <div style={{ display:'flex', gap:8 }}>
              {[-10,-5,+5,+10].map(d=>(
                <button key={d} onClick={()=>emit('admin:adjust_bughunt_timer',{delta_min:d})} style={{
                  flex:1, padding:'8px 0', background:'var(--bg3)', border:'1px solid var(--border)',
                  borderRadius:6, color: d<0?'var(--danger)':'var(--accent)',
                  fontFamily:'var(--font-mono)', fontSize:13, cursor:'pointer',
                }}>{d>0?'+':''}{d}m</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submission tracker */}
      <div className="card">
        <h3 style={{ fontFamily:'var(--font-display)', fontSize:16, marginBottom:12 }}>SUBMISSION TRACKER</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {state.teams.filter(t=>!t.is_eliminated).map(team=>(
            <div key={team.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'var(--bg3)', borderRadius:6, border:`1px solid ${team.bughunt_submitted_at?team.color+'44':'var(--border)'}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:team.color }}/>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>{team.name}</div>
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color: team.bughunt_submitted_at ? 'var(--accent)' : 'var(--text3)' }}>
                {team.bughunt_submitted_at
                  ? `✓ submitted ${new Date(team.bughunt_submitted_at).toLocaleTimeString()}${graded ? ` · ${team.bughunt_score ?? 0} marks` : ''}`
                  : '○ waiting...'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Review + override panel */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16 }}>REVIEW FIXES {graded ? '· GRADED' : '(answers visible only to you)'}</h3>
          <button className="btn-ghost" onClick={loadReview} style={{ fontSize:11, padding:'4px 10px' }}>🔄 Refresh</button>
        </div>
        {!review || review.programs.length===0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:13 }}>
            Nothing to review yet — start the Bug Hunt first.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {review.teams.filter(t=>t.submission).map(t=>(
              <div key={t.team_id} style={{ border:`1px solid ${t.color}44`, borderRadius:8, padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:15, color:t.color }}>{t.team_name}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>{t.score !== null && t.score !== undefined ? `${t.score} marks` : 'not graded yet'}</div>
                </div>
                {review.programs.map(p=>{
                  const theirAnswer = t.submission?.answers?.[p.id];
                  const auto = t.results?.auto?.[p.id];
                  const marks = t.results?.per_program?.[p.id];
                  const overridden = t.results?.overrides?.[p.id] !== undefined;
                  const draftKey = `${t.team_id}_${p.id}`;
                  return (
                    <div key={p.id} style={{ padding:'8px 0', borderTop:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                        <div style={{ flex:1, minWidth:220 }}>
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:2 }}>{p.title}</div>
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:13 }}>
                            {theirAnswer ? <span style={{ color:'var(--text)' }}>"{theirAnswer}"</span> : <span style={{ color:'var(--text3)' }}>— no fix submitted</span>}
                          </div>
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)', marginTop:2 }}>
                            expected: {(p.answers || [p.answer]).filter(Boolean).join('  |  ')}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          {t.results && (
                            <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color: auto ? 'var(--accent)' : 'var(--danger)' }}>
                              {auto ? '✅ auto-correct' : '❌ auto-wrong'} · {marks ?? 0}m{overridden ? ' (override)' : ''}
                            </span>
                          )}
                          {t.results && (
                            <>
                              <input type="number" min={0} max={perProgramMarks} step={0.5} placeholder={`0–${perProgramMarks}`}
                                value={overrideDraft[draftKey] ?? ''}
                                onChange={e=>setOverrideDraft(o=>({ ...o, [draftKey]: e.target.value }))}
                                style={{ width:74, padding:'4px 6px', fontSize:12, fontFamily:'var(--font-mono)' }}/>
                              <button className="btn-ghost" style={{ fontSize:11, padding:'4px 10px' }}
                                onClick={()=>{ emit('admin:bughunt_override',{ team_id:t.team_id, program_id:p.id, marks:overrideDraft[draftKey] }); }}>
                                Set
                              </button>
                              {overridden && (
                                <button className="btn-ghost" style={{ fontSize:11, padding:'4px 8px', color:'var(--warning)' }}
                                  onClick={()=>emit('admin:bughunt_override',{ team_id:t.team_id, program_id:p.id, marks:null })}>
                                  ↩ auto
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {review.teams.filter(t=>t.submission).length===0 && (
              <div style={{ textAlign:'center', padding:16, color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:13 }}>No team submissions yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CODE ARENA: Code Strike tab — control + judge panel ───────────
function CodeStrikeTab({ state, emit, phase }) {
  const s = state.app_state;
  const cfg = s.event_config || {};
  const active = s.codestrike_active;
  const paused = s.codestrike_paused;
  const problems = s.codestrike_problems || [];
  const totalSubs = state.teams.reduce((n,t)=>n+Object.keys(t.codestrike_submitted||{}).length, 0);

  const [data, setData] = useState(null); // pull: full code + judge state
  const [judgeDraft, setJudgeDraft] = useState({}); // `${team}_${prob}` -> {correctness, efficiency}
  const [openCode, setOpenCode] = useState(null); // `${team}_${prob}` expanded
  const loadSubs = () => {
    getSocket().emit('admin:request_codestrike_submissions', { admin_token: sessionStorage.getItem('admin_session') || '' });
  };
  useEffect(() => {
    const socket = getSocket();
    const onData = (d) => setData(d);
    const onJudged = () => loadSubs();
    socket.on('admin:codestrike_submissions', onData);
    socket.on('admin:codestrike_judged', onJudged);
    loadSubs();
    return () => { socket.off('admin:codestrike_submissions', onData); socket.off('admin:codestrike_judged', onJudged); };
  }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Status + controls */}
      <div className="card card-lg" style={{ border:`1px solid ${active ? 'var(--purple)' : 'var(--border)'}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--purple)' }}>⚔️ CODE STRIKE CONTROL</h3>
          <button onClick={()=>{
            fetch('/api/admin/codestrike-export', { headers:{ 'x-admin-token': sessionStorage.getItem('admin_session')||'' }})
              .then(r=>r.blob()).then(blob=>{
                const url=URL.createObjectURL(blob);
                const a=document.createElement('a'); a.href=url; a.download='codestrike_submissions.csv'; a.click();
              });
          }} style={{ padding:'8px 14px', background:'var(--bg3)', border:'1px solid var(--accent)', borderRadius:6, color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:12, cursor:'pointer', textTransform:'uppercase' }}>
            ⬇ Export CSV
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {[
            ['Status', active ? (paused ? 'PAUSED' : 'LIVE') : 'IDLE', active ? (paused ? 'var(--warning)' : 'var(--accent)') : 'var(--text3)'],
            ['Problems', problems.length || 3, 'var(--purple)'],
            ['Submissions', totalSubs, 'var(--accent)'],
            ['Config', `${cfg.codestrike_duration_min ?? 45}min / ${cfg.codestrike_marks ?? 50}m`, 'var(--text2)'],
          ].map(([l,v,c])=>(
            <div key={l} style={{ background:'var(--bg3)', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:4, textTransform:'uppercase' }}>{l}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {active && s.codestrike_timer_end && !paused && (
          <div style={{ textAlign:'center', padding:'12px 0', marginBottom:16 }}>
            <CountdownTimer endTime={s.codestrike_timer_end} label="Code Strike Timer" />
          </div>
        )}
        {active && paused && (
          <div style={{ textAlign:'center', padding:'10px', marginBottom:16, background:'color-mix(in srgb, var(--warning) 10%, transparent)', border:'1px solid var(--warning)', borderRadius:8, fontFamily:'var(--font-mono)', color:'var(--warning)' }}>
            ⏸ PAUSED — {Math.round((s.codestrike_paused_remaining_ms||0)/60000)} min remaining
          </div>
        )}

        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {!active && (
            <button style={{ flex:1, padding:14, fontSize:15, background:'color-mix(in srgb, var(--purple) 15%, transparent)', border:'1px solid var(--purple)', borderRadius:6, color:'var(--purple)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
              onClick={()=>{ if(phase!=='code_strike'){alert('Advance to the Code Strike phase first (Control tab).');return;} if(confirm(`Start Code Strike? 3 problems revealed, ${cfg.codestrike_duration_min ?? 45} min timer. Any previous Code Strike data is cleared.`)) emit('admin:start_codestrike',{}); }}>
              ▶ Start Code Strike (reveal problems)
            </button>
          )}
          {active && !paused && (
            <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--warning)', borderRadius:6, color:'var(--warning)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
              onClick={()=>emit('admin:pause_codestrike',{})}>⏸ Pause</button>
          )}
          {active && paused && (
            <button className="btn-primary" style={{ flex:1, padding:12 }}
              onClick={()=>emit('admin:resume_codestrike',{})}>▶ Resume</button>
          )}
          {active && (
            <button style={{ flex:1, padding:12, background:'var(--bg3)', border:'1px solid var(--danger)', borderRadius:6, color:'var(--danger)', fontFamily:'var(--font-mono)', cursor:'pointer' }}
              onClick={()=>{ if(confirm('End Code Strike? Submissions lock immediately; judging can continue after.')) emit('admin:end_codestrike',{}); }}>
              ⏹ End (lock submissions)
            </button>
          )}
        </div>

        {active && (
          <div style={{ marginTop:14 }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginBottom:8, textTransform:'uppercase' }}>Adjust Timer</div>
            <div style={{ display:'flex', gap:8 }}>
              {[-10,-5,+5,+10].map(d=>(
                <button key={d} onClick={()=>emit('admin:adjust_codestrike_timer',{delta_min:d})} style={{
                  flex:1, padding:'8px 0', background:'var(--bg3)', border:'1px solid var(--border)',
                  borderRadius:6, color: d<0?'var(--danger)':'var(--accent)',
                  fontFamily:'var(--font-mono)', fontSize:13, cursor:'pointer',
                }}>{d>0?'+':''}{d}m</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Judge panel */}
      <div className="card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:16 }}>JUDGE SUBMISSIONS</h3>
          <button className="btn-ghost" onClick={loadSubs} style={{ fontSize:11, padding:'4px 10px' }}>🔄 Refresh</button>
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', marginBottom:14 }}>
          Correctness and Efficiency are 0–10 each. Final marks per problem = 70% correctness + 20% efficiency + 10% time bonus (computed automatically from submission time). Judge notes are only visible here.
        </div>
        {!data || (data.problems||[]).length===0 ? (
          <div style={{ textAlign:'center', padding:24, color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:13 }}>
            Nothing to judge yet — start Code Strike first.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {data.teams.filter(t=>Object.keys(t.submissions||{}).length>0).map(t=>(
              <div key={t.team_id} style={{ border:`1px solid ${t.color}44`, borderRadius:8, padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:15, color:t.color }}>{t.team_name}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>
                    {t.score !== null && t.score !== undefined ? `${t.score} marks` : 'not judged yet'}
                  </div>
                </div>
                {data.problems.map(p=>{
                  const sub = t.submissions?.[p.id];
                  if (!sub) return (
                    <div key={p.id} style={{ padding:'8px 0', borderTop:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)' }}>
                      {p.title} — no submission
                    </div>
                  );
                  const key = `${t.team_id}_${p.id}`;
                  const judge = t.judge?.[p.id];
                  const draft = judgeDraft[key] || {};
                  return (
                    <div key={p.id} style={{ padding:'10px 0', borderTop:'1px solid var(--border)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                        <div style={{ flex:1, minWidth:200 }}>
                          <div style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>
                            <span style={{ fontWeight:600 }}>{p.title}</span>
                            <span style={{ color:'var(--text3)' }}> · {p.marks} marks · {sub.language} · {new Date(sub.submitted_at).toLocaleTimeString()}{sub.resubmits > 0 ? ` · ${sub.resubmits} resubmit${sub.resubmits!==1?'s':''}` : ''}</span>
                          </div>
                          {p.judge_notes && (
                            <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--info)', marginTop:2 }}>📝 {p.judge_notes}</div>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                          <button className="btn-ghost" style={{ fontSize:11, padding:'4px 10px' }}
                            onClick={()=>setOpenCode(openCode===key?null:key)}>
                            {openCode===key ? '▲ Hide Code' : '▼ View Code'}
                          </button>
                          <input type="number" min={0} max={10} placeholder="C 0-10"
                            value={draft.correctness ?? judge?.correctness ?? ''}
                            onChange={e=>setJudgeDraft(j=>({ ...j, [key]: { ...draft, correctness: e.target.value } }))}
                            style={{ width:70, padding:'4px 6px', fontSize:12, fontFamily:'var(--font-mono)' }}/>
                          <input type="number" min={0} max={10} placeholder="E 0-10"
                            value={draft.efficiency ?? judge?.efficiency ?? ''}
                            onChange={e=>setJudgeDraft(j=>({ ...j, [key]: { ...draft, efficiency: e.target.value } }))}
                            style={{ width:70, padding:'4px 6px', fontSize:12, fontFamily:'var(--font-mono)' }}/>
                          <button className="btn-primary" style={{ fontSize:11, padding:'5px 12px' }}
                            onClick={()=>emit('admin:judge_codestrike',{
                              team_id: t.team_id, problem_id: p.id,
                              correctness: draft.correctness ?? judge?.correctness ?? 0,
                              efficiency: draft.efficiency ?? judge?.efficiency ?? 0,
                            })}>
                            {judge ? 'Update' : 'Score'}
                          </button>
                          {judge && <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--accent)' }}>✓ C{judge.correctness}/E{judge.efficiency}</span>}
                        </div>
                      </div>
                      {openCode===key && (
                        <pre style={{
                          fontFamily:'var(--font-mono)', fontSize:12, lineHeight:1.5,
                          background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6,
                          padding:12, overflowX:'auto', whiteSpace:'pre', marginTop:10, maxHeight:340, overflowY:'auto',
                        }}>{sub.code}</pre>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {data.teams.filter(t=>Object.keys(t.submissions||{}).length>0).length===0 && (
              <div style={{ textAlign:'center', padding:16, color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:13 }}>No code submitted yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CODE ARENA: Tie-break tab — pick tied teams, fire a question ──
function TieBreakTab({ state, emit }) {
  const s = state.app_state;
  const tb = s.tiebreak;
  const cfg = s.event_config || {};
  const enabled = cfg.phases_enabled || [];
  const [teamIds, setTeamIds] = useState([]);
  const [customQ, setCustomQ] = useState('');
  const [customA, setCustomA] = useState('');
  // The starting admin socket receives the full question (with answer) via
  // admin:state_delta once; later sanitized broadcasts overwrite it in
  // app_state, so keep the last seen answer locally for display.
  const answerRef = useRef(null);
  useEffect(() => {
    if (tb?.question?.answer || tb?.question?.answers) {
      answerRef.current = tb.question.answer || tb.question.answers?.[0];
    }
    if (!tb) answerRef.current = null;
  }, [tb]);

  // Combined totals help spot the actual tie
  const totalOf = t =>
    (enabled.includes('quiz_round') ? (t.quiz_marks_scored||0) : 0)
    + (enabled.includes('bug_hunt') ? (t.bughunt_score||0) : 0)
    + (enabled.includes('code_strike') ? (t.codestrike_score||0) : 0);
  const ranked = [...state.teams].filter(t=>!t.is_eliminated).sort((a,b)=>totalOf(b)-totalOf(a));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {tb ? (
        <div className="card card-lg" style={{ border:'1px solid var(--warning)' }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--warning)', marginBottom:12 }}>⚡ TIE-BREAK LIVE</h3>
          <div style={{ fontSize:15, marginBottom:8, whiteSpace:'pre-wrap' }}>{tb.question?.question}</div>
          {answerRef.current && (
            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)', marginBottom:12 }}>Answer: {answerRef.current}</div>
          )}
          <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginBottom:12 }}>
            Between: {tb.team_ids.map(id=>state.teams.find(t=>t.id===id)?.name).filter(Boolean).join(' vs ')}
          </div>
          {(tb.answers||[]).length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
              {tb.answers.map((a,i)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 12px', background:'var(--bg3)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:13 }}>
                  <span style={{ color:a.color }}>{a.team_name}</span>
                  <span style={{ color:a.correct?'var(--accent)':'var(--danger)' }}>{a.correct?'✅':'❌'} {(a.time_ms/1000).toFixed(1)}s</span>
                </div>
              ))}
            </div>
          )}
          {tb.winner ? (
            <div style={{ padding:'12px 16px', border:'1px solid var(--accent)', borderRadius:8, textAlign:'center', fontFamily:'var(--font-display)', fontSize:18, color:'var(--accent)', marginBottom:12 }}>
              🏆 {tb.winner.team_name} — {(tb.winner.time_ms/1000).toFixed(1)}s
            </div>
          ) : (
            <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginBottom:12 }}>Waiting for the first correct answer...</div>
          )}
          <button className="btn-ghost" style={{ width:'100%', padding:12 }}
            onClick={()=>{ if(confirm('Clear this tie-break from all screens?')) emit('admin:end_tiebreak',{}); }}>
            ✖ Clear Tie-Break
          </button>
        </div>
      ) : (
        <div className="card card-lg" style={{ border:'1px solid var(--warning)' }}>
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--warning)', marginBottom:8 }}>⚡ START A TIE-BREAK</h3>
          <div style={{ fontSize:13, color:'var(--text2)', marginBottom:14, lineHeight:1.6 }}>
            Pick the tied teams and fire one rapid-fire question at them. The server timestamps every answer — the first correct team wins and gets a ⚡ tie-break win (used to order equal totals on the final leaderboard).
          </div>

          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Select teams (2+) — sorted by current total</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14, maxHeight:260, overflowY:'auto' }}>
            {ranked.map((t,i)=>{
              const selected = teamIds.includes(t.id);
              return (
                <label key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:selected?`${t.color}11`:'var(--bg3)', border:`1px solid ${selected?t.color+'44':'var(--border)'}`, borderRadius:6, cursor:'pointer' }}>
                  <input type="checkbox" checked={selected}
                    onChange={e=>setTeamIds(ids=>e.target.checked?[...ids,t.id]:ids.filter(id=>id!==t.id))}
                    style={{ accentColor:t.color }}/>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', width:26 }}>#{i+1}</span>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:t.color, flexShrink:0 }}/>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:13, flex:1 }}>{t.name}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)' }}>{Math.round(totalOf(t)*10)/10}m{(t.tiebreak_wins||0)>0?` ⚡${t.tiebreak_wins}`:''}</span>
                </label>
              );
            })}
          </div>

          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:8 }}>Question — leave blank for a random rapid-fire question</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10, marginBottom:14 }}>
            <input value={customQ} onChange={e=>setCustomQ(e.target.value)} placeholder="Custom question (optional)"/>
            <input value={customA} onChange={e=>setCustomA(e.target.value)} placeholder="Its answer" style={{ fontFamily:'var(--font-mono)' }}/>
          </div>

          <button className="btn-warning" style={{ width:'100%', padding:14, fontSize:15 }}
            disabled={teamIds.length < 2 || (!!customQ.trim() !== !!customA.trim())}
            onClick={()=>{ emit('admin:start_tiebreak',{ team_ids:teamIds, custom_question:customQ, custom_answer:customA }); setTeamIds([]); setCustomQ(''); setCustomA(''); }}>
            ⚡ FIRE TIE-BREAKER at {teamIds.length} team{teamIds.length!==1?'s':''}
          </button>
        </div>
      )}
    </div>
  );
}
