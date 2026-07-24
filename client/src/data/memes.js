// Random engineering memes — same Hinglish CS-student voice as the Thank
// You page's closing joke. Pop up ambiently on the Spectator screen and
// during idle/waiting moments on the team dashboard. Never during a timed
// question or Phase 3 build — that's cruelty, not comedy.
// Each entry: either a single punchy `line`, or a `setup` + `punchline`.

export const MEME_POOL = [
  { line: 'Mera code first try mein chal gaya... ab dar lag raha hai. 💀' },
  { setup: 'Interviewer: "Weakness batao."', punchline: '"Semicolon bhool jaata hoon." — "Ye toh syntax error hai." — "Bas yehi meri weakness hai."' },
  { line: 'git commit -m "fixed bug" → git commit -m "actually fixed it" → git commit -m "please work now" 🙏' },
  { line: 'Ctrl+Z is the only relationship advice engineers actually trust.' },
  { setup: 'Professor: "Assignment kal submit karna hai."', punchline: 'Class: *starts writing code at 11:58 PM sharp.*' },
  { line: '404: MOTIVATION NOT FOUND' },
  { setup: 'Mummy: "Beta khana kha le."', punchline: '"Ek minute, bas ye bug fix kar raha hoon..." (2 ghante baad still fixing) 🍛❌' },
  { line: 'Debugging = being the detective in a crime movie where you\'re also the murderer.' },
  { line: '"It works on my machine" — famous last words before production goes down. 🔥' },
  { line: 'Semicolon lagana bhool gaya. Poora dopahar barbaad. ; ; ;' },
  { line: 'Life ka sabse bada plot twist: assignment submit karne ke agle din professor postpone kar deta hai.' },
  { line: 'Engineer ki love story: "I love you" → SyntaxError: unexpected token \'you\'' },
  { line: 'Stack Overflow ek din ke liye down ho jaaye, half the industry retire ho jayegi.' },
  { line: 'Sapno mein bhi ab merge conflict aata hai. 😩' },
  { setup: '"Have you tried turning it off and on again?"', punchline: 'Solves 60% of problems. Causes the other 40%.' },
  { line: 'CS student ki diet: coffee, code, chaos, repeat. ☕' },
  { line: 'Naming variables is harder than the actual programming. Exhibit A: temp2FinalACTUALLYFinal.js' },
  { line: 'Engineer ka WiFi password: "IStillLoveYou123!" — bhai move on kar ja.' },
  { line: 'Rubber duck debugging: baat karna ek duck se, kyunki code toh waise bhi sunta nahi. 🦆' },
  { line: '"Kal se serious ho jaunga" — every engineering student, everyday, forever.' },
  { line: 'Assignment deadline dekh ke dil bolta hai: "Vim se exit kaise karte hain yaar."' },
  { setup: 'Compiler: "0 errors."', punchline: 'Me: "Kuch toh galat hai." 🫠' },
  { setup: 'Teacher: "Explain OOP."', punchline: 'Me: "Jisme sab kuch object hai — including my sleep schedule. Abstract."' },
  { line: '3 AM: "Bas ek aur function bana ke sota hoon." 6 AM: still coding.' },
  { line: 'Two engineers walk into a bar. The third one ducks — for backward compatibility.' },
  { line: 'Whiteboard interview mein sabse bada bug: apna hi confidence.' },
  { line: 'Group project ka MVP: the one person doing everyone else\'s part too.' },
  { line: 'while(alive) { code(); coffee(); repeat(); } — no break statement found.' },
];

export function randomMeme(excludeIndex = -1) {
  if (MEME_POOL.length <= 1) return { meme: MEME_POOL[0], index: 0 };
  let i = excludeIndex;
  while (i === excludeIndex) i = Math.floor(Math.random() * MEME_POOL.length);
  return { meme: MEME_POOL[i], index: i };
}
