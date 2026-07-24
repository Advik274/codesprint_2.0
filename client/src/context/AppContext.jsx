import { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { useSocket, getSocket, onConnectionChange } from '../hooks/useSocket';

const AppContext = createContext(null);

const init = {
  app_state: {
    current_phase: 'setup', phase1_round: 0, phase1_round_active: false,
    phase2_paused: false, phase3_paused: false, results_reveal_index: -1,
    master_paused: false, master_pause_reason: '',
    speed_demo_current_team_id: null, speed_demo_timer_end: null,
    speed_demo_order: [], speed_demo_done_ids: [],
  },
  phase_history_count: 0,
  teams: [], zones: [], event_log: [],
  leaderboard: [], toasts: [],
  currentQuestion: null, roundResult: null, announcement: null,
  audience_votes: {},
  help_requests: [],
  showThankYou: false,
  connected: true,
  passcodeCache: {}, // { team_id: passcode } — admin only, never wiped by state:sync
};

function reducer(state, { type, payload }) {
  switch (type) {

    // Full sync — only on connect / admin structural changes
    // Preserve client-only keys that the server never sends
    case 'STATE_SYNC':
      return { ...state, ...payload, passcodeCache: state.passcodeCache, toasts: state.toasts, showThankYou: state.showThankYou };

    // Delta — patch only changed app_state fields
    case 'STATE_DELTA':
      return { ...state, app_state: { ...state.app_state, ...payload },
        ...(payload.phase_history_count !== undefined ? { phase_history_count: payload.phase_history_count } : {}) };

    // Delta — add a newly registered team (avoids full state:sync broadcast)
    case 'TEAM_NEW':
      return { ...state, teams: [...state.teams, payload] };

    // Delta — remove a deleted team
    case 'TEAM_REMOVED':
      return { ...state, teams: state.teams.filter(t => t.id !== payload.team_id) };

    // Delta — add a newly created zone
    case 'ZONE_NEW':
      return { ...state, zones: [...state.zones, payload] };

    // Delta — remove a deleted zone
    case 'ZONE_REMOVED':
      return { ...state, zones: state.zones.filter(z => z.id !== payload.zone_id) };

    // Delta — patch only the one team that changed
    case 'TEAM_DELTA': {
      const teams = state.teams.map(t =>
        t.id === payload.id ? { ...t, ...payload } : t
      );
      return { ...state, teams };
    }

    // Batched battery update — all at once, no N re-renders
    case 'BATTERIES_BATCH': {
      const map = {};
      payload.forEach(u => { map[u.team_id] = u.battery; });
      const teams = state.teams.map(t =>
        map[t.id] !== undefined ? { ...t, battery: map[t.id] } : t
      );
      return { ...state, teams };
    }

    // Delta — patch only the one zone that changed
    case 'ZONE_DELTA': {
      const zones = state.zones.map(z =>
        z.id === payload.id ? { ...z, ...payload } : z
      );
      return { ...state, zones };
    }

    // Phase change — reset transient state
    case 'PHASE_CHANGED':
      return {
        ...state,
        app_state: { ...state.app_state, current_phase: payload.new_phase },
        currentQuestion: null, roundResult: null,
      };

    // Team eliminated — patch just that team
    case 'TEAM_ELIMINATED': {
      const teams = state.teams.map(t =>
        t.id === payload.team_id ? { ...t, is_eliminated: true } : t
      );
      return { ...state, teams };
    }

    case 'LEADERBOARD':
      return { ...state, leaderboard: payload };

    case 'ROUND_STARTED':
      return {
        ...state,
        currentQuestion: payload, roundResult: null,
        app_state: { ...state.app_state, phase1_round: payload.round_number, phase1_round_active: true },
      };

    case 'ROUND_ENDED':
      return {
        ...state, roundResult: payload,
        app_state: { ...state.app_state, phase1_round_active: false },
      };

    case 'LOG_ENTRY':
      return { ...state, event_log: [payload, ...state.event_log].slice(0, 50) };

    case 'ANNOUNCEMENT':
      return { ...state, announcement: payload.index === -1 ? null : payload };

    case 'AUDIENCE_VOTES':
      return { ...state, audience_votes: payload };

    // Cache passcode from team registration or bulk fetch — never wiped by STATE_SYNC
    case 'TEAM_REGISTERED':
      return { ...state, passcodeCache: { ...state.passcodeCache, [payload.team.id]: payload.team.passcode } };
    case 'PASSCODES': {
      // Server sends array [{id, passcode}] — convert to map
      const incoming = Array.isArray(payload)
        ? Object.fromEntries(payload.map(p => [p.id, p.passcode]))
        : payload;
      return { ...state, passcodeCache: { ...state.passcodeCache, ...incoming } };
    }

    case 'ADD_TOAST': {
      const id = payload.id || Date.now() + Math.random();
      return { ...state, toasts: [{ ...payload, id }, ...state.toasts].slice(0, 4) };
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== payload) };

    case 'SHOW_THANKYOU':
      return { ...state, showThankYou: true };

    case 'CONNECTED':
      return { ...state, connected: payload };

    case 'HELP_NEW':
      return { ...state, help_requests: [payload, ...state.help_requests.filter(h => h.id !== payload.id)] };
    case 'HELP_RESOLVED':
      return { ...state, help_requests: state.help_requests.filter(h => h.id !== payload.help_id) };

    default: return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);

  const addToast = useCallback((data) => {
    const id = Date.now() + Math.random();
    dispatch({ type: 'ADD_TOAST', payload: { ...data, id } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 4500);
  }, []);

  useSocket({
    // Full sync — only on connect or structural changes
    'state:sync':          (d) => dispatch({ type: 'STATE_SYNC', payload: d }),

    // FIX V7.1: targeted delta events for team/zone add/remove (replaces full state:sync)
    'team:new':            (d) => dispatch({ type: 'TEAM_NEW', payload: d }),
    'team:removed':        (d) => dispatch({ type: 'TEAM_REMOVED', payload: d }),
    'zone:new':            (d) => dispatch({ type: 'ZONE_NEW', payload: d }),
    'zone:removed':        (d) => dispatch({ type: 'ZONE_REMOVED', payload: d }),

    // Delta events — minimal re-renders
    'state:delta':         (d) => dispatch({ type: 'STATE_DELTA', payload: d }),
    'team:delta':          (d) => dispatch({ type: 'TEAM_DELTA', payload: d }),
    'zone:delta':          (d) => dispatch({ type: 'ZONE_DELTA', payload: d }),

    // Batched battery — one update for all teams
    'batteries:batch':     (d) => dispatch({ type: 'BATTERIES_BATCH', payload: d }),

    // Events
    'phase:changed':       (d) => dispatch({ type: 'PHASE_CHANGED', payload: d }),
    'team:eliminated':     (d) => dispatch({ type: 'TEAM_ELIMINATED', payload: d }),
    'leaderboard:phase1':  (d) => dispatch({ type: 'LEADERBOARD', payload: d }),
    'leaderboard:phase2':  (d) => dispatch({ type: 'LEADERBOARD', payload: d }),
    'leaderboard:final':   (d) => dispatch({ type: 'LEADERBOARD', payload: d }),
    'phase1:round_started':(d) => dispatch({ type: 'ROUND_STARTED', payload: d }),
    'phase1:round_ended':  (d) => dispatch({ type: 'ROUND_ENDED', payload: d }),
    'log:entry':           (d) => dispatch({ type: 'LOG_ENTRY', payload: d }),
    'results:announce':    (d) => dispatch({ type: 'ANNOUNCEMENT', payload: d }),
    'audience:votes':      (d) => dispatch({ type: 'AUDIENCE_VOTES', payload: d }),
    'admin:team_registered': (d) => dispatch({ type: 'TEAM_REGISTERED', payload: d }),
    'admin:passcodes':     (d) => dispatch({ type: 'PASSCODES', payload: d }),
    // Quiz real-time sync
    'quiz:started':        (d) => dispatch({ type: 'STATE_DELTA', payload: { quiz_round_active: true, quiz_questions: d.questions, quiz_timer_end: d.timer_end, quiz_paused: false, quiz_member_answers: {} } }),
    'quiz:ended':          (d) => dispatch({ type: 'STATE_DELTA', payload: { quiz_round_active: false } }),
    // Submission update — also comes via state:delta but keep this as backup
    'quiz:submission_update': (d) => dispatch({ type: 'STATE_DELTA', payload: { quiz_member_answers: d.submissions } }),
    'quiz:eliminated':     (d) => addToast({ message: `💀 ${d.count} team(s) eliminated after quiz`, type: 'warning' }),
    'toast:broadcast':     (d) => addToast(d),
    // Admin feedback events
    'admin:problem_assigned': (d) => addToast({ message: `✅ Problem sent to ${d.target === 'all' ? `all teams` : d.team_name}`, type: 'success' }),
    'admin:error':         (d) => addToast({ message: `❌ ${d.message}`, type: 'danger' }),
    'admin:config_saved': (d) => addToast({ message: `✅ Config saved: ${d.config?.event_name}`, type: 'success' }),
    'admin:reset_complete':(d) => addToast({ message: d.message || '✅ Factory reset complete', type: 'success' }),
    'admin:rollback_complete':(d) => addToast({ message: `⏪ Rolled back to ${d.restored_phase}`, type: 'warning' }),
    'event:thankyou':      () => dispatch({ type: 'SHOW_THANKYOU' }),
    'help:new':            (d) => dispatch({ type: 'HELP_NEW', payload: d }),
    'help:resolved':       (d) => dispatch({ type: 'HELP_RESOLVED', payload: d }),
  });

  useEffect(() => onConnectionChange((c) => dispatch({ type: 'CONNECTED', payload: c })), []);

  const emit = useCallback((event, data = {}) =>
    getSocket().emit(event, data)
  , []);

  // Admin/zone-scoped events carry the session token obtained at login
  // (see AdminDashboard / ZoneOperator) — never a hardcoded password.
  const adminEmit = useCallback((event, data = {}) =>
    getSocket().emit(event, { ...data, admin_token: sessionStorage.getItem('admin_session') || '' })
  , []);

  return (
    <AppContext.Provider value={{ state, dispatch, emit, adminEmit, addToast }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
