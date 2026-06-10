export const PHASES = ['lobby', 'phase1', 'phase2', 'phase3', 'results'];

export function canTransition(from, to) {
  const fromIdx = PHASES.indexOf(from);
  const toIdx = PHASES.indexOf(to);
  return toIdx === fromIdx + 1;
}

export function getPhaseLabel(phase) {
  const labels = {
    lobby: 'Lobby',
    phase1: 'Phase 1 — The Gauntlet',
    phase2: 'Phase 2 — Campus Conquest',
    phase3: 'Phase 3 — Final Build',
    results: 'Results',
  };
  return labels[phase] || phase;
}
