import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { ALL_SPORTS, categoryOf, type Match } from '@live-scores/shared';
import type { ScoresProvider } from './types';

/**
 * Simulated provider: about 20 matches for today across all sports, with a random
 * score or status change every 3–8 s. No key, no network.
 */

type Random = () => number;

interface ClockRules {
  kind: 'clock';
  periods: number;
  periodLength: number;
  points: number[];
  scoreChance: number;
  trackPeriods: boolean;
  label: (period: number, minute: number) => string;
  /** Label shown between `period` and the next one; null = no break. */
  breakLabel: (period: number) => string | null;
}

interface SetRules {
  kind: 'sets';
  setsToWin: number;
  /** Games (tennis) or points (volleyball) needed to take a set. */
  target: (setIndex: number) => number;
  /** Tennis: at target-1 all, the next game takes the set (tie-break). */
  tieBreak: boolean;
}

type Rules = ClockRules | SetRules;

const RULES: Record<string, Rules> = {
  football: {
    kind: 'clock',
    periods: 2,
    periodLength: 45,
    points: [1],
    scoreChance: 0.25,
    trackPeriods: false,
    label: (p, m) => `${(p - 1) * 45 + m}′`,
    breakLabel: () => 'Half-time',
  },
  rugby: {
    kind: 'clock',
    periods: 2,
    periodLength: 40,
    points: [3, 5, 7],
    scoreChance: 0.35,
    trackPeriods: false,
    label: (p, m) => `${(p - 1) * 40 + m}′`,
    breakLabel: () => 'Half-time',
  },
  handball: {
    kind: 'clock',
    periods: 2,
    periodLength: 30,
    points: [1],
    scoreChance: 0.9,
    trackPeriods: false,
    label: (p, m) => `${(p - 1) * 30 + m}′`,
    breakLabel: () => 'Half-time',
  },
  hockey: {
    kind: 'clock',
    periods: 3,
    periodLength: 20,
    points: [1],
    scoreChance: 0.2,
    trackPeriods: true,
    label: (p, m) => `P${p} ${m}′`,
    breakLabel: () => 'Intermission',
  },
  basketball: {
    kind: 'clock',
    periods: 4,
    periodLength: 12,
    points: [1, 2, 2, 2, 3],
    scoreChance: 1,
    trackPeriods: true,
    label: (p) => `Q${p}`,
    breakLabel: (p) => (p === 2 ? 'Half-time' : 'Break'),
  },
  'american-football': {
    kind: 'clock',
    periods: 4,
    periodLength: 15,
    points: [3, 7],
    scoreChance: 0.3,
    trackPeriods: true,
    label: (p) => `Q${p}`,
    breakLabel: (p) => (p === 2 ? 'Half-time' : null),
  },
  baseball: {
    kind: 'clock',
    periods: 9,
    periodLength: 3,
    points: [1, 1, 2],
    scoreChance: 0.3,
    trackPeriods: true,
    label: (p) => `Inning ${p}`,
    breakLabel: () => null,
  },
  tennis: { kind: 'sets', setsToWin: 2, target: () => 6, tieBreak: true },
  volleyball: { kind: 'sets', setsToWin: 3, target: (i) => (i === 4 ? 15 : 25), tieBreak: false },
};

const COMPETITIONS: Record<
  string,
  { id: string; name: string; country?: string; teams: string[] }[]
> = {
  football: [
    {
      id: 'ekstraklasa',
      name: 'Ekstraklasa',
      country: 'Poland',
      teams: [
        'Lech Poznań',
        'Legia Warszawa',
        'Raków Częstochowa',
        'Jagiellonia',
        'Pogoń Szczecin',
        'Górnik Zabrze',
      ],
    },
    {
      id: 'premier-league',
      name: 'Premier League',
      country: 'England',
      teams: ['Arsenal', 'Liverpool', 'Chelsea', 'Newcastle', 'Aston Villa', 'Brighton'],
    },
  ],
  tennis: [
    {
      id: 'atp-vienna',
      name: 'ATP Vienna',
      country: 'Austria',
      teams: [
        'H. Hurkacz',
        'J. Sinner',
        'A. Zverev',
        'C. Alcaraz',
        'D. Medvedev',
        'T. Fritz',
        'C. Ruud',
        'A. de Minaur',
      ],
    },
  ],
  basketball: [
    {
      id: 'euroleague',
      name: 'EuroLeague',
      teams: [
        'Real Madrid',
        'Panathinaikos',
        'Fenerbahçe',
        'Olympiacos',
        'Barcelona',
        'Monaco',
        'Partizan',
        'Žalgiris',
      ],
    },
  ],
  hockey: [
    {
      id: 'nhl',
      name: 'NHL',
      country: 'USA',
      teams: ['Rangers', 'Bruins', 'Oilers', 'Maple Leafs', 'Avalanche', 'Panthers'],
    },
  ],
  handball: [
    {
      id: 'ehf-cl',
      name: 'EHF Champions League',
      teams: ['Industria Kielce', 'Wisła Płock', 'Aalborg', 'Veszprém'],
    },
  ],
  volleyball: [
    {
      id: 'plusliga',
      name: 'PlusLiga',
      country: 'Poland',
      teams: [
        'Jastrzębski Węgiel',
        'ZAKSA Kędzierzyn-Koźle',
        'Projekt Warszawa',
        'Aluron Zawiercie',
      ],
    },
  ],
  baseball: [
    { id: 'mlb', name: 'MLB', country: 'USA', teams: ['Yankees', 'Dodgers', 'Mets', 'Astros'] },
  ],
  rugby: [
    {
      id: 'top14',
      name: 'Top 14',
      country: 'France',
      teams: ['Toulouse', 'La Rochelle', 'Racing 92', 'Toulon'],
    },
  ],
  'american-football': [
    { id: 'nfl', name: 'NFL', country: 'USA', teams: ['Chiefs', 'Eagles', 'Bills', '49ers'] },
  ],
};

/** Matches per sport; sums to about 20, and every sidebar category gets some. */
const MATCHES_PER_SPORT: Record<string, number> = {
  football: 6,
  tennis: 3,
  basketball: 3,
  hockey: 3,
  handball: 1,
  volleyball: 1,
  baseball: 1,
  rugby: 1,
  'american-football': 1,
};

interface SimMatch {
  match: Match;
  period: number;
  minute: number;
}

const MINUTE = 60_000;

export interface MockOptions {
  random?: Random;
  now?: () => number;
  timeZone?: string;
  /** Tick delay range in ms. */
  minDelay?: number;
  maxDelay?: number;
}

export class MockProvider implements ScoresProvider {
  readonly name = 'mock' as const;
  private readonly random: Random;
  private readonly now: () => number;
  private readonly timeZone: string;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private sims: SimMatch[] = [];
  private day = '';
  private listeners = new Set<(matches: Match[]) => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: MockOptions = {}) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.timeZone = options.timeZone ?? 'Europe/Warsaw';
    this.minDelay = options.minDelay ?? 3000;
    this.maxDelay = options.maxDelay ?? 8000;
  }

  async getToday(sport: string): Promise<Match[]> {
    this.ensureToday();
    return this.sims.filter((s) => s.match.sport === sport).map((s) => structuredClone(s.match));
  }

  subscribe(onUpdate: (matches: Match[]) => void): () => void {
    this.listeners.add(onUpdate);
    if (!this.timer) this.schedule();
    return () => {
      this.listeners.delete(onUpdate);
      if (this.listeners.size === 0 && this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    };
  }

  onStatus(listener: (state: 'connected') => void): () => void {
    listener('connected');
    return () => {};
  }

  rateLimitRemaining(): null {
    return null;
  }

  /** Applies one random change and returns the changed matches. Public for tests. */
  tick(): Match[] {
    this.ensureToday();
    const now = this.now();
    const changed = new Set<SimMatch>();

    // Kick off scheduled matches that are due, plus occasionally the next one so the demo stays lively.
    const scheduled = this.sims
      .filter((s) => s.match.status === 'scheduled')
      .sort((a, b) => a.match.startTime.localeCompare(b.match.startTime));
    for (const s of scheduled) {
      if (Date.parse(s.match.startTime) <= now) this.start(s, changed);
    }
    const live = this.sims.filter((s) => s.match.status === 'live' || s.match.status === 'break');
    if (scheduled[0]?.match.status === 'scheduled' && (live.length < 3 || this.random() < 0.08)) {
      scheduled[0].match.startTime = new Date(now).toISOString();
      this.start(scheduled[0], changed);
    }

    const pool = this.sims.filter((s) => s.match.status === 'live' || s.match.status === 'break');
    const picks = Math.min(pool.length, 1 + Math.floor(this.random() * 2));
    for (let i = 0; i < picks; i++) {
      const s = pool.splice(Math.floor(this.random() * pool.length), 1)[0];
      if (s) {
        this.advance(s);
        changed.add(s);
      }
    }

    return [...changed].map((s) => {
      s.match.updatedAt = now;
      return structuredClone(s.match);
    });
  }

  private schedule() {
    const delay = this.minDelay + this.random() * (this.maxDelay - this.minDelay);
    this.timer = setTimeout(() => {
      const changed = this.tick();
      if (changed.length) for (const l of this.listeners) l(changed);
      this.schedule();
    }, delay);
  }

  private ensureToday() {
    const today = formatInTimeZone(this.now(), this.timeZone, 'yyyy-MM-dd');
    if (today !== this.day) {
      this.day = today;
      this.sims = this.generate(today);
    }
  }

  private generate(day: string): SimMatch[] {
    const now = this.now();
    const dayStart = fromZonedTime(`${day}T00:00:00`, this.timeZone).getTime();
    const dayEnd = fromZonedTime(`${day}T23:55:00`, this.timeZone).getTime();
    const clamp = (t: number) => Math.min(dayEnd, Math.max(dayStart, t));
    const sims: SimMatch[] = [];

    for (const sport of ALL_SPORTS) {
      const count = MATCHES_PER_SPORT[sport] ?? 0;
      const competitions = COMPETITIONS[sport] ?? [];
      for (let i = 0; i < count; i++) {
        const competition = competitions[i % competitions.length]!;
        const pairIndex = Math.floor(i / competitions.length) * 2;
        const home = competition.teams[pairIndex % competition.teams.length]!;
        const away = competition.teams[(pairIndex + 1) % competition.teams.length]!;
        // Roughly a third each: finished, live, scheduled.
        const state = i % 3 === 0 ? 'live' : i % 3 === 1 ? 'scheduled' : 'finished';
        const offset =
          state === 'finished'
            ? -(120 + this.random() * 180) * MINUTE
            : state === 'live'
              ? -(10 + this.random() * 60) * MINUTE
              : (30 + this.random() * 360) * MINUTE;

        const sim: SimMatch = {
          period: 0,
          minute: 0,
          match: {
            id: `mock:${sport}:${sport}-${i + 1}`,
            sport,
            category: categoryOf(sport),
            competition: {
              id: `${sport}:${competition.id}`,
              name: competition.name,
              country: competition.country,
            },
            home: { name: home, score: null },
            away: { name: away, score: null },
            status: 'scheduled',
            statusLabel: '',
            startTime: new Date(clamp(now + offset)).toISOString(),
            updatedAt: now,
          },
        };

        if (state !== 'scheduled') {
          this.start(sim);
          const steps = state === 'finished' ? 500 : 2 + Math.floor(this.random() * 8);
          for (let n = 0; n < steps && sim.match.status !== 'finished'; n++) this.advance(sim);
        }
        sims.push(sim);
      }
    }
    return sims;
  }

  private start(s: SimMatch, changed?: Set<SimMatch>) {
    const rules = RULES[s.match.sport]!;
    s.period = 1;
    s.minute = 0;
    s.match.status = 'live';
    s.match.home.score = 0;
    s.match.away.score = 0;
    if (rules.kind === 'sets') {
      s.match.periodScores = [{ home: 0, away: 0 }];
      s.match.statusLabel = 'Set 1';
    } else {
      if (rules.trackPeriods) s.match.periodScores = [{ home: 0, away: 0 }];
      s.match.statusLabel = rules.label(1, 1);
    }
    changed?.add(s);
  }

  private advance(s: SimMatch) {
    const rules = RULES[s.match.sport]!;
    if (rules.kind === 'sets') this.advanceSets(s, rules);
    else this.advanceClock(s, rules);
  }

  private advanceClock(s: SimMatch, rules: ClockRules) {
    const m = s.match;
    if (m.status === 'break') {
      s.period += 1;
      s.minute = 0;
      m.status = 'live';
      if (rules.trackPeriods) m.periodScores = [...(m.periodScores ?? []), { home: 0, away: 0 }];
      m.statusLabel = rules.label(s.period, 1);
      return;
    }

    const step = 1 + Math.floor(this.random() * Math.max(1, Math.ceil(rules.periodLength / 6)));
    s.minute = Math.min(rules.periodLength, s.minute + step);

    if (this.random() < rules.scoreChance) {
      const side = this.random() < 0.5 ? 'home' : 'away';
      const points = rules.points[Math.floor(this.random() * rules.points.length)]!;
      m[side].score = (m[side].score ?? 0) + points;
      const current = m.periodScores?.[s.period - 1];
      if (current) current[side] += points;
    }

    if (s.minute < rules.periodLength) {
      m.statusLabel = rules.label(s.period, s.minute);
      return;
    }
    if (s.period >= rules.periods) {
      m.status = 'finished';
      m.statusLabel = 'FT';
      return;
    }
    const breakLabel = rules.breakLabel(s.period);
    if (breakLabel) {
      m.status = 'break';
      m.statusLabel = breakLabel;
    } else {
      s.period += 1;
      s.minute = 0;
      if (rules.trackPeriods) m.periodScores = [...(m.periodScores ?? []), { home: 0, away: 0 }];
      m.statusLabel = rules.label(s.period, 1);
    }
  }

  private advanceSets(s: SimMatch, rules: SetRules) {
    const m = s.match;
    const sets = m.periodScores!;
    const setIndex = sets.length - 1;
    const set = sets[setIndex]!;
    const side = this.random() < 0.5 ? 'home' : 'away';
    const other = side === 'home' ? 'away' : 'home';
    set[side] += 1;

    const target = rules.target(setIndex);
    const won =
      (set[side] >= target && set[side] - set[other] >= 2) ||
      (rules.tieBreak && set[side] === target + 1 && set[other] === target);
    if (!won) return;

    m[side].score = (m[side].score ?? 0) + 1;
    if ((m[side].score ?? 0) >= rules.setsToWin) {
      m.status = 'finished';
      m.statusLabel = 'FT';
      return;
    }
    sets.push({ home: 0, away: 0 });
    m.statusLabel = `Set ${sets.length}`;
  }
}
