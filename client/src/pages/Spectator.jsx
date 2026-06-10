import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BatteryBar, CountdownTimer } from '../components/shared/index.jsx';
import { getSocket } from '../hooks/useSocket';

export default function Spectator() {
  const { state } = useApp();
  const navigate = useNavigate();
  const eventName = state.app_state?.event_config?.event_name || 'CODE SPRINT 2.0';
  const collegeName = state.app_state?.event_config?.college_name || '';
  const phase = state.app_state.current_phase;

  useEffect(() => {
    if (state.showThankYou) navigate('/thankyou');
  }, [state.showThankYou]);

  const phaseColors = { setup:'var(--text3)', phase1:'var(--warning)', phase2:'var(--accent)', quiz_round:'var(--info)', phase3:'var(--info)', speed_demo:'var(--purple)', results:'var(--purple)' };
  const phaseNames = { setup:'Setting Up', phase1:'Phase 1 — The Gauntlet', phase2:'Phase 2 — Campus Conquest', quiz_round:'Quiz Round', phase3:'Phase 3 — Final Build', speed_demo:'Speed Demo — Audience Vote', results:'Final Results' };

  const phase1Board = [...state.teams].sort((a,b) => b.phase1_total_score - a.phase1_total_score);
  const phase2Board = [...state.teams].filter(t=>!t.is_eliminated).sort((a,b) => b.zones_captured-a.zones_captured||b.battery-a.battery);

  // Smart finalBoard — use the right score metric based on which phases were enabled
  // This fixes the bug where quiz-only events showed nothing in Results
  const phasesEnabled = state.app_state?.event_config?.phases_enabled || [];
  const finalBoard = (() => {
    if (phasesEnabled.includes('phase3')) {
      return [...state.teams]
        .filter(t => t.phase3_judge_scores)
        .sort((a, b) => b.phase3_judge_scores.total - a.phase3_judge_scores.total);
    }
    if (phasesEnabled.includes('quiz_round')) {
      return [...state.teams]
        .filter(t => !t.is_eliminated)
        .sort((a, b) => (b.quiz_score || 0) - (a.quiz_score || 0));
    }
    return [...state.teams]
      .filter(t => !t.is_eliminated)
      .sort((a, b) => (b.phase1_total_score || 0) - (a.phase1_total_score || 0));
  })();
  const finalScoreOf = (team) => {
    if (phasesEnabled.includes('phase3')) return team.phase3_judge_scores?.total ?? '—';
    if (phasesEnabled.includes('quiz_round')) return team.quiz_score ?? '—';
    return team.phase1_total_score ?? '—';
  };
  const finalScoreLabel = phasesEnabled.includes('phase3') ? 'Judge Score'
    : phasesEnabled.includes('quiz_round') ? 'Quiz Score' : 'Gauntlet Score';
  const medal = (i) => ['🥇','🥈','🥉'][i]||`#${i+1}`;
  const rankColor = (i) => ['#FFD700','#C0C0C0','#CD7F32'][i]||'var(--text3)';

  // Speed Demo state
  const votes = state.audience_votes || {};
  const demoOrder = state.app_state.speed_demo_order || [];
  const doneDemoIds = state.app_state.speed_demo_done_ids || [];
  const currentDemoId = state.app_state.speed_demo_current_team_id;
  const currentDemoTeam = state.teams.find(t => t.id === currentDemoId);
  const maxVotes = Math.max(...Object.values(votes), 1);
  const totalVotes = Object.values(votes).reduce((s, v) => s + v, 0);
  const [hasVoted, setHasVoted] = useState(false);

  // Live ticker — scrolling event log
  const tickerRef = useRef(null);
  const log = state.event_log || [];
  const tickerItems = log.slice(0, 30);

  // Auto-scroll ticker continuously
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    let frame;
    let pos = 0;
    const scroll = () => {
      pos += 0.4;
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.scrollLeft = pos;
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [tickerItems.length]);

  const castVote = (team_id) => {
    if (hasVoted) return;
    getSocket().emit('audience:vote', { team_id });
    setHasVoted(true);
  };

  return (
    <div style={{ minHeight:'100vh', paddingBottom:70, position:'relative' }}>

      {/* Header */}
      <div style={{ background:'var(--bg2)', borderBottom:'1px solid var(--border)', padding:'18px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:30, fontWeight:700, color:'var(--accent)', letterSpacing:'0.1em' }}>{eventName}</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', marginTop:2, letterSpacing:'0.2em' }}>{collegeName || 'EBULLIANCE · REBOOT × CSI × NCC'}</div>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:phaseColors[phase] }}>{phaseNames[phase]}</div>
          {phase==='phase1'&&state.app_state.phase1_round>0&&<div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginTop:4 }}>Round {state.app_state.phase1_round}/5 {state.app_state.phase1_round_active?<span style={{color:'var(--danger)'}}>● LIVE</span>:''}</div>}
          {phase==='phase2'&&<CountdownTimer endTime={state.app_state.phase2_timer_end} paused={state.app_state.phase2_paused}/>}
          {phase==='quiz_round'&&state.app_state.quiz_round_active&&<CountdownTimer endTime={state.app_state.quiz_timer_end} paused={state.app_state.quiz_paused}/>}
          {phase==='quiz_round'&&state.app_state.quiz_paused&&<span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--warning)'}}>⏸ PAUSED</span>}
          {phase==='phase3'&&<CountdownTimer endTime={state.app_state.phase3_timer_end} paused={state.app_state.phase3_paused}/>}
          {phase==='speed_demo'&&currentDemoId&&<CountdownTimer endTime={state.app_state.speed_demo_timer_end} paused={false}/>}
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text3)' }}>{state.teams.filter(t=>!t.is_eliminated).length} active</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--danger)', marginTop:2 }}>{state.teams.filter(t=>t.is_eliminated).length} eliminated</div>
        </div>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', padding:'28px 16px' }}>

        {phase==='setup'&&(
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontFamily:'var(--font-display)', fontSize:72, color:'var(--accent)', animation:'glitch 4s infinite', marginBottom:16, lineHeight:1 }}>{eventName}</div>
            <div style={{ fontFamily:'var(--font-mono)', color:'var(--text3)', fontSize:14, marginBottom:32, letterSpacing:'0.2em' }}>GET READY. THE BATTLE BEGINS SOON.</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center' }}>
              {state.teams.map(t=>(
                <div key={t.id} style={{ padding:'8px 20px', borderRadius:6, background:`${t.color}22`, border:`1px solid ${t.color}66`, color:t.color, fontFamily:'var(--font-display)', fontSize:16 }}>{t.name}</div>
              ))}
            </div>
          </div>
        )}

        {phase==='phase1'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {phase1Board.map((team,i)=>(
              <div key={team.id} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 20px', borderRadius:8, background:i===0?'rgba(0,255,136,0.06)':'var(--bg2)', border:`1px solid ${i<3?rankColor(i)+'44':'var(--border)'}`, opacity:team.is_eliminated?0.3:1 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:26, width:48, textAlign:'center', color:rankColor(i) }}>{i<3?medal(i):`#${i+1}`}</div>
                <div style={{ width:12, height:12, borderRadius:'50%', background:team.color, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:20, textDecoration:team.is_eliminated?'line-through':'none' }}>{team.name}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>{team.year} year</div>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:30, fontWeight:700, color:team.is_eliminated?'var(--text3)':'var(--accent)' }}>{team.phase1_total_score}</div>
              </div>
            ))}
          </div>
        )}

        {phase==='quiz_round'&&(()=>{
          const quizBoard = [...state.teams].filter(t=>!t.is_eliminated).sort((a,b)=>(b.quiz_score||0)-(a.quiz_score||0));
          const totalTeams = state.teams.filter(t=>!t.is_eliminated).length;
          const memberAnswers = state.app_state.quiz_member_answers || {};
          const submittedCount = Object.values(memberAnswers).filter(m => Object.keys(m).length > 0).length;
          const isActive = state.app_state.quiz_round_active;
          const scoresReady = quizBoard.some(t => t.quiz_member_scores !== null && t.quiz_member_scores !== undefined);
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Status banner */}
              <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
                <div style={{ padding:'8px 20px', borderRadius:6, background:'var(--bg2)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:13 }}>
                  {isActive ? <span style={{color:'var(--danger)'}}>● LIVE</span> : <span style={{color:'var(--text3)'}}>● ENDED</span>}
                </div>
                <div style={{ padding:'8px 20px', borderRadius:6, background:'var(--bg2)', border:'1px solid var(--border)', fontFamily:'var(--font-mono)', fontSize:13, color:'var(--accent)' }}>
                  📋 {submittedCount} / {totalTeams} teams submitted
                </div>
              </div>

              {/* If scores ready, show leaderboard */}
              {scoresReady ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Quiz Scores</div>
                  {quizBoard.map((team,i)=>(
                    <div key={team.id} style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 20px', borderRadius:8, background:i===0?'rgba(0,255,136,0.06)':'var(--bg2)', border:`1px solid ${i<3?rankColor(i)+'44':'var(--border)'}` }}>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:26, width:48, textAlign:'center', color:rankColor(i) }}>{i<3?medal(i):`#${i+1}`}</div>
                      <div style={{ width:12, height:12, borderRadius:'50%', background:team.color, flexShrink:0 }}/>
                      <div style={{ flex:1, fontFamily:'var(--font-display)', fontSize:20 }}>{team.name}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:30, fontWeight:700, color:'var(--accent)' }}>{team.quiz_score ?? '—'}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)' }}>pts</div>
                    </div>
                  ))}
                </div>
              ) : (
                /* While active — show submission status per team */
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Submission Status</div>
                  {quizBoard.map((team)=>{
                    const submitted = Object.keys(memberAnswers[team.id]||{}).length > 0;
                    return (
                      <div key={team.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 18px', borderRadius:8, background:'var(--bg2)', border:`1px solid ${submitted?team.color+'55':'var(--border)'}` }}>
                        <div style={{ width:10, height:10, borderRadius:'50%', background:team.color, flexShrink:0 }}/>
                        <div style={{ flex:1, fontFamily:'var(--font-display)', fontSize:18 }}>{team.name}</div>
                        <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color: submitted ? 'var(--accent)' : 'var(--text3)' }}>
                          {submitted ? `✓ ${Object.keys(memberAnswers[team.id]).length} submitted` : '○ answering...'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {phase==='phase2'&&(
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* ── Zone Map Grid ── */}
            <div style={{ marginBottom:8 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:8 }}>Zone Map</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
                {state.zones.map(z => (
                  <div key={z.id} style={{
                    borderRadius:8, padding:'10px 12px',
                    background: z.owner_team_id ? `${z.owner_color}18` : 'var(--bg3)',
                    border: `2px solid ${z.is_attempting ? 'var(--warning)' : z.owner_team_id ? z.owner_color+'66' : 'var(--border)'}`,
                    position:'relative', overflow:'hidden',
                    animation: z.is_attempting ? 'pulse-warn 1s infinite' : 'none',
                  }}>
                    {z.is_attempting && (
                      <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'var(--warning)', animation:'pulse-accent 0.8s infinite' }}/>
                    )}
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color: z.owner_team_id ? z.owner_color : 'var(--text3)', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {z.owner_team_id ? '🏴' : '○'} {z.name}
                    </div>
                    {z.owner_team_id ? (
                      <div style={{ fontSize:10, color:z.owner_color, opacity:0.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{z.owner_name}</div>
                    ) : (
                      <div style={{ fontSize:10, color:'var(--text3)' }}>Uncaptured</div>
                    )}
                    {z.is_attempting && (
                      <div style={{ fontSize:10, color:'var(--warning)', marginTop:2 }}>⚡ {z.attempting_team_name}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Zone status strip (legacy compact) */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
              {state.zones.map(z=>(
                <div key={z.id} style={{ padding:'6px 14px', borderRadius:6, background:z.owner_team_id?`${z.owner_color}22`:'var(--bg3)', border:`1px solid ${z.owner_team_id?z.owner_color+'55':'var(--border)'}`, color:z.owner_team_id?z.owner_color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:11 }}>
                  {z.is_attempting?`⚡ ${z.name} — ${z.attempting_team_name} attempting`:z.owner_team_id?`🏴 ${z.name} — ${z.owner_name}`:`○ ${z.name}`}
                </div>
              ))}
            </div>
            {phase2Board.map((team,i)=>(
              <div key={team.id} style={{ padding:'16px 20px', borderRadius:8, background:'var(--bg2)', border:`1px solid ${i<4?team.color+'55':'var(--border)'}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:22, width:44, color:i<4?'var(--accent)':'var(--text3)' }}>#{i+1}</div>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:team.color, flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:20 }}>{team.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginTop:2 }}>🏴 {team.zones_captured} zone{team.zones_captured!==1?'s':''}{i<4&&<span className="badge badge-success" style={{marginLeft:8,fontSize:9}}>ADVANCING</span>}</div>
                  </div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:28, fontWeight:700, color:team.battery>30?'var(--accent)':'var(--danger)' }}>⚡{team.battery}%</div>
                </div>
                <BatteryBar battery={team.battery} showLabel={false} height={6}/>
              </div>
            ))}
          </div>
        )}

        {phase==='phase3'&&(
          <div>
            {state.app_state.phase3_problem&&(
              <div className="card" style={{ border:'1px solid var(--info)', marginBottom:24, textAlign:'center' }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--info)', marginBottom:8, letterSpacing:'0.15em' }}>GLOBAL MISSION</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:15, color:'var(--text)', lineHeight:1.7 }}>{state.app_state.phase3_problem}</div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {state.teams.filter(t=>!t.is_eliminated).map(team=>(
                <div key={team.id} style={{ padding:'14px 20px', borderRadius:8, background:'var(--bg2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:team.color }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:18 }}>{team.name}</div>
                    {team.phase3_problem&&team.phase3_problem!==state.app_state.phase3_problem&&<div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>Custom problem</div>}
                  </div>
                  {team.phase3_submission?<span className="badge badge-success">Submitted ✓</span>:<span className="badge badge-info">Building...</span>}
                  {team.phase3_judge_scores&&<div style={{ fontFamily:'var(--font-mono)', fontSize:24, fontWeight:700, color:'var(--accent)' }}>{team.phase3_judge_scores.total}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {phase==='speed_demo'&&(
          <div>
            {/* Currently demoing */}
            {currentDemoTeam ? (
              <div style={{ textAlign:'center', marginBottom:28 }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--purple)', letterSpacing:'0.2em', marginBottom:6 }}>NOW DEMOING</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:42, color:currentDemoTeam.color, marginBottom:8 }}>{currentDemoTeam.name}</div>
                <div style={{ marginBottom:16 }}>
                  <CountdownTimer endTime={state.app_state.speed_demo_timer_end} paused={false}/>
                </div>
                {!hasVoted ? (
                  <div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)', marginBottom:12, letterSpacing:'0.15em' }}>CAST YOUR VOTE</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center' }}>
                      {demoOrder.map(tid => {
                        const t = state.teams.find(x => x.id === tid);
                        if (!t) return null;
                        return (
                          <button key={tid} onClick={()=>castVote(tid)} style={{
                            padding:'12px 24px', borderRadius:8, fontSize:16, fontFamily:'var(--font-display)',
                            background:`${t.color}22`, border:`2px solid ${t.color}`,
                            color:t.color, cursor:'pointer', transition:'transform 0.1s',
                          }}
                          onMouseDown={e=>e.currentTarget.style.transform='scale(0.95)'}
                          onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}
                          >{t.name}</button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--accent)' }}>✓ Vote Cast!</div>
                )}
              </div>
            ) : (
              <div style={{ textAlign:'center', padding:'40px 0', marginBottom:24 }}>
                <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--purple)', marginBottom:8 }}>Speed Demo Round</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text3)' }}>
                  {doneDemoIds.length}/{demoOrder.length} teams completed
                </div>
              </div>
            )}

            {/* Live vote bars */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.15em', marginBottom:4 }}>
                Live Votes — {totalVotes} total
              </div>
              {[...demoOrder].sort((a,b) => (votes[b]||0)-(votes[a]||0)).map(tid => {
                const t = state.teams.find(x => x.id === tid);
                if (!t) return null;
                const pct = maxVotes > 0 ? Math.round(((votes[tid]||0)/maxVotes)*100) : 0;
                const isDone = doneDemoIds.includes(tid);
                const isCurrent = tid === currentDemoId;
                return (
                  <div key={tid} style={{ padding:'12px 16px', borderRadius:8, background:'var(--bg2)', border:`1px solid ${isCurrent?t.color+'88':'var(--border)'}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:t.color, flexShrink:0 }}/>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:16, flex:1 }}>{t.name}</div>
                      {isCurrent&&<span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--purple)', border:'1px solid var(--purple)', padding:'2px 6px', borderRadius:4 }}>● LIVE</span>}
                      {isDone&&!isCurrent&&<span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text3)' }}>Done</span>}
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:18, fontWeight:700, color:t.color }}>{votes[tid]||0}</div>
                    </div>
                    <div style={{ height:8, borderRadius:4, background:'var(--bg3)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:t.color, borderRadius:4, transition:'width 0.5s ease' }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {phase==='results'&&(
          <div>
            <div style={{ textAlign:'center', marginBottom:32 }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:44, color:'var(--purple)', animation:'glitch 3s infinite', marginBottom:8 }}>FINAL RESULTS</div>
              <div style={{ fontFamily:'var(--font-mono)', color:'var(--text3)', fontSize:13, letterSpacing:'0.15em' }}>RESULTS BEING REVEALED...</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {finalBoard.map((team,i)=>(
                <div key={team.id} style={{ padding:'20px 24px', borderRadius:10, background:i===0?'rgba(255,215,0,0.08)':i===1?'rgba(192,192,192,0.06)':'var(--bg2)', border:`${i===0?2:1}px solid ${rankColor(i)}`, transform:i===0?'scale(1.02)':'none' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:i===0?48:32 }}>{medal(i)}</div>
                    <div style={{ width:12, height:12, borderRadius:'50%', background:team.color }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:'var(--font-display)', fontSize:i===0?28:22, color:i===0?'#FFD700':'var(--text)' }}>{team.name}</div>
                      {i===0&&team.phase3_judge_scores&&<div style={{ display:'flex', gap:16, marginTop:4 }}>{[['UI',team.phase3_judge_scores.ui],['Func',team.phase3_judge_scores.functionality],['Fit',team.phase3_judge_scores.problem_fit]].map(([l,v])=><span key={l} style={{ fontFamily:'var(--font-mono)', fontSize:12, color:'var(--text3)' }}>{l}: {v}/10</span>)}</div>}
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:i===0?40:28, fontWeight:700, color:i===0?'#FFD700':'var(--accent)' }}>{finalScoreOf(team)}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{finalScoreLabel}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Live Ticker ───────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0, height:36,
          background:'rgba(10,10,18,0.95)', borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', zIndex:50, overflow:'hidden',
        }}>
          <div style={{
            flexShrink:0, padding:'0 14px', fontFamily:'var(--font-display)',
            fontSize:11, color:'var(--accent)', letterSpacing:'0.15em',
            borderRight:'1px solid var(--border)', whiteSpace:'nowrap', height:'100%',
            display:'flex', alignItems:'center',
          }}>
            LIVE
          </div>
          <div
            ref={tickerRef}
            style={{
              flex:1, display:'flex', alignItems:'center', gap:0,
              overflowX:'hidden', whiteSpace:'nowrap',
              scrollbarWidth:'none',
            }}
          >
            {/* Duplicate items for seamless loop */}
            {[...tickerItems, ...tickerItems].map((entry, i) => {
              const typeColor = {
                zone_captured:'var(--accent)', zone_attempt:'var(--warning)',
                elimination:'var(--danger)', phase_change:'var(--info)',
                speed_demo:'var(--purple)', scoring:'var(--accent)',
              }[entry.type] || 'var(--text3)';
              const typeIcon = {
                zone_captured:'🏴', zone_attempt:'⚡', elimination:'💀',
                phase_change:'⚙️', speed_demo:'🎤', scoring:'📊',
              }[entry.type] || '•';
              return (
                <span key={i} style={{
                  fontFamily:'var(--font-mono)', fontSize:12,
                  color:typeColor, padding:'0 24px',
                  borderRight:'1px solid var(--border2)',
                  display:'inline-flex', alignItems:'center', gap:6, height:36,
                }}>
                  <span>{typeIcon}</span>
                  <span>{entry.message}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
