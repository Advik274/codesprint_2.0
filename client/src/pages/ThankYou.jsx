import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

// Golden particle field
function GoldParticles() {
  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: `${2 + Math.random() * 4}px`,
    delay: `${Math.random() * 4}s`,
    duration: `${3 + Math.random() * 4}s`,
    opacity: 0.15 + Math.random() * 0.5,
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0px) scale(1);   opacity: var(--op); }
          50%  { transform: translateY(-30px) scale(1.3); opacity: calc(var(--op) * 1.6); }
          100% { transform: translateY(0px) scale(1);   opacity: var(--op); }
        }
        @keyframes spinGlow {
          0%   { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes scanH {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100vw); }
        }
        @keyframes borderPulse {
          0%, 100% { border-color: rgba(255,215,0,0.3); box-shadow: 0 0 20px rgba(255,215,0,0.1); }
          50%       { border-color: rgba(255,215,0,0.7); box-shadow: 0 0 40px rgba(255,215,0,0.3); }
        }
        @keyframes glitchGold {
          0%,100% { text-shadow: 0 0 30px rgba(255,215,0,0.8), 0 0 60px rgba(255,165,0,0.4); }
          25%  { text-shadow: -3px 0 rgba(255,100,0,0.8), 3px 0 rgba(255,215,0,0.8), 0 0 60px rgba(255,215,0,0.4); }
          75%  { text-shadow: 3px 0 rgba(255,100,0,0.8), -3px 0 rgba(255,215,0,0.8), 0 0 60px rgba(255,215,0,0.4); }
        }
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: p.left, top: p.top,
          width: p.size, height: p.size,
          borderRadius: '50%',
          background: `rgba(255, ${180 + Math.floor(Math.random()*75)}, 0, ${p.opacity})`,
          '--op': p.opacity,
          animation: `floatUp ${p.duration} ${p.delay} ease-in-out infinite`,
        }} />
      ))}
    </div>
  );
}

// Horizontal scan line for techy feel
function ScanLine() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', overflow: 'hidden', zIndex: 1,
    }}>
      <div style={{
        position: 'absolute', top: '30%', left: 0,
        width: '200px', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.6), transparent)',
        animation: 'scanH 4s linear infinite',
      }} />
      <div style={{
        position: 'absolute', top: '65%', left: 0,
        width: '120px', height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,165,0,0.4), transparent)',
        animation: 'scanH 6s 2s linear infinite',
      }} />
    </div>
  );
}

// Corner brackets — techy HUD frame
function HUDCorners({ color = 'rgba(255,215,0,0.5)', size = 24, thickness = 2 }) {
  const s = size, t = thickness;
  const style = (top, right, bottom, left, rotateX, rotateY) => ({
    position: 'absolute', top, right, bottom, left,
    width: s, height: s,
    borderTop: top !== undefined ? `${t}px solid ${color}` : 'none',
    borderRight: right !== undefined ? `${t}px solid ${color}` : 'none',
    borderBottom: bottom !== undefined ? `${t}px solid ${color}` : 'none',
    borderLeft: left !== undefined ? `${t}px solid ${color}` : 'none',
  });
  return (
    <>
      <div style={style(0, undefined, undefined, 0, 0, 0)} />         {/* top-left */}
      <div style={style(0, 0, undefined, undefined, 0, 0)} />         {/* top-right */}
      <div style={style(undefined, undefined, 0, 0, 0, 0)} />         {/* bottom-left */}
      <div style={style(undefined, 0, 0, undefined, 0, 0)} />         {/* bottom-right */}
    </>
  );
}

const JOKE = {
  setup: 'Engineering student ne apni girlfriend ko propose kiya:',
  punchline: '"Tu meri life ki undefined variable hai — bina tujhare mera code compile hi nahi hota." 💀',
  subtext: 'She replied: "Tera code toh already runtime error pe chal raha hai bhai."',
};

export default function ThankYou() {
  const { state } = useApp();
  const eventName = state.app_state?.event_config?.event_name || 'CODE SPRINT 2.0';
  const collegeName = state.app_state?.event_config?.college_name || '';

  const [step, setStep] = useState(0); // 0=nothing, 1=title, 2=subtitle, 3=joke, 4=credits

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 900),
      setTimeout(() => setStep(3), 1800),
      setTimeout(() => setStep(4), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const tickerText = '✦ THANKS FOR COMPETING ✦ MAY YOUR CODE NEVER CRASH IN PRODUCTION ✦ DRINK WATER ✦ SLEEP PLEASE ✦ 404: YOUR EXCUSES NOT FOUND ✦ GIT PUSH YOUR DREAMS ✦ ';

  // DELIBERATELY THEME-INDEPENDENT: the closing curtain is always the
  // golden send-off, whatever palette the admin picked for the event.
  // Every color on this page is pinned locally — don't swap these for
  // theme variables or a custom theme will repaint the finale.
  const CURTAIN_BG = '#16110b';

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse at 50% 0%, rgba(255,165,0,0.12) 0%, rgba(255,215,0,0.04) 40%, ${CURTAIN_BG} 70%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      padding: '40px 20px 80px',
    }}>
      <GoldParticles />
      <ScanLine />

      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(255,215,0,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,215,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 700, textAlign: 'center' }}>

        {/* ── EVENT OVER badge ── */}
        <div style={{
          opacity: step >= 1 ? 1 : 0,
          transform: step >= 1 ? 'none' : 'translateY(20px)',
          transition: 'all 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          marginBottom: 12,
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: '#FFD700', letterSpacing: '0.35em',
            border: '1px solid rgba(255,215,0,0.4)',
            padding: '4px 16px', borderRadius: 2,
            background: 'rgba(255,215,0,0.06)',
          }}>
            ◈ EVENT COMPLETE ◈
          </span>
        </div>

        {/* ── Main title ── */}
        <div style={{
          opacity: step >= 1 ? 1 : 0,
          transform: step >= 1 ? 'none' : 'translateY(30px)',
          transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s',
          marginBottom: 8,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(52px, 10vw, 88px)',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#FFD700',
            animation: step >= 1 ? 'glitchGold 3s ease-in-out infinite' : 'none',
            lineHeight: 1,
          }}>
            THANK YOU
          </div>
        </div>

        {/* ── Subtitle ── */}
        <div style={{
          opacity: step >= 2 ? 1 : 0,
          transform: step >= 2 ? 'none' : 'translateY(16px)',
          transition: 'all 0.6s ease 0.1s',
          marginBottom: 48,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 18,
            color: 'rgba(255,215,0,0.6)', letterSpacing: '0.25em',
          }}>
            FOR PARTICIPATING IN {eventName}{collegeName ? ` — ${collegeName}` : ''}
          </div>
        </div>

        {/* ── Divider ── */}
        {step >= 2 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            marginBottom: 48, justifyContent: 'center',
          }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.4))' }} />
            <div style={{ color: '#FFD700', fontSize: 18 }}>⚡</div>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,215,0,0.4), transparent)' }} />
          </div>
        )}

        {/* ── Joke card ── */}
        <div style={{
          opacity: step >= 3 ? 1 : 0,
          transform: step >= 3 ? 'none' : 'translateY(24px) scale(0.95)',
          transition: 'all 0.7s cubic-bezier(0.34,1.56,0.64,1)',
          marginBottom: 48,
        }}>
          <div style={{
            position: 'relative',
            background: 'rgba(255,215,0,0.04)',
            border: '1px solid rgba(255,215,0,0.25)',
            borderRadius: 12,
            padding: '32px 36px',
            animation: step >= 3 ? 'borderPulse 3s ease-in-out infinite' : 'none',
          }}>
            <HUDCorners color="rgba(255,215,0,0.6)" size={20} thickness={2} />

            {/* bug label */}
            <div style={{
              position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'var(--font-mono)', fontSize: 10, color: '#FFD700',
              background: CURTAIN_BG, padding: '0 12px', letterSpacing: '0.2em',
            }}>
              // ENGINEERING_JOKE.js
            </div>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13,
              color: 'rgba(255,215,0,0.5)', letterSpacing: '0.1em', marginBottom: 16,
            }}>
              {JOKE.setup}
            </div>

            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 'clamp(16px, 3vw, 22px)',
              color: '#FFD700', lineHeight: 1.5, marginBottom: 16,
              fontWeight: 600,
            }}>
              {JOKE.punchline}
            </div>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'rgba(255,165,0,0.6)', fontStyle: 'italic',
            }}>
              {JOKE.subtext}
            </div>
          </div>
        </div>

        {/* ── Credits ── */}
        <div style={{
          opacity: step >= 4 ? 1 : 0,
          transform: step >= 4 ? 'none' : 'translateY(16px)',
          transition: 'all 0.6s ease',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            fontFamily: 'var(--font-mono)', color: 'rgba(255,215,0,0.35)',
            fontSize: 12, letterSpacing: '0.15em',
          }}>
            <div>Built with ☕ caffeine, 🐛 bugs, and 0 sleep</div>
            <div style={{ color: 'rgba(255,215,0,0.2)', fontSize: 11 }}>
              {eventName} · {new Date().getFullYear()} · All bugs are features
            </div>
          </div>
        </div>

      </div>

      {/* ── Bottom ticker ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 36, background: 'rgba(10,10,15,0.97)',
        borderTop: '1px solid rgba(255,215,0,0.2)',
        display: 'flex', alignItems: 'center',
        overflow: 'hidden', zIndex: 10,
      }}>
        <div style={{
          display: 'flex', whiteSpace: 'nowrap',
          animation: 'tickerScroll 20s linear infinite',
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'rgba(255,215,0,0.5)', letterSpacing: '0.15em',
        }}>
          {tickerText}{tickerText}
        </div>
      </div>
    </div>
  );
}
