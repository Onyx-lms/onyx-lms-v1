/**
 * The Onyx design system.
 *
 * One place for the primitives every Onyx screen is built from, so a change
 * to a card or a stat tile lands on all 36 of them at once rather than being
 * re-typed per page. Everything here is a server component unless it needs
 * state -- these are all presentational, so none of them do.
 *
 * The colour rules the tokens encode (see tailwind.config.ts) matter here:
 * `accent-500` is the logo orange at 3.17:1 on white, which fails AA for
 * text. It is used below for fills, rings and large numerals only; anywhere
 * orange has to carry words, it is `accent-700` at 5.71:1.
 */
import Link from 'next/link';

/* ------------------------------------------------------------------ icons */

/**
 * One sprite, one stroke weight, one 24px grid.
 *
 * The alternative -- reaching for whatever Unicode glyph is closest (◎ ▣ ◇ ₹)
 * -- was what the first prototype did, and it read as exactly what it was:
 * placeholder. Optical weight has to be consistent or the whole product looks
 * unfinished, and that consistency has to live in one file.
 */
export const ICONS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-6h5v6" /></>,
  book: <><path d="M4 4.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4z" /><path d="M20 4.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H20z" /></>,
  code: <><path d="m8.5 8.5-4 3.5 4 3.5" /><path d="m15.5 8.5 4 3.5-4 3.5" /><path d="m13.5 5-3 14" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  edit: <><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5v1.5a3 3 0 0 0 3 3" /><path d="M17 6h2.5v1.5a3 3 0 0 1-3 3" /><path d="M12 14v3.5" /><path d="M8.5 20.5h7" /><path d="M10 17.5h4v3h-4z" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" /><path d="M12 17.2v.1" /></>,
  briefcase: <><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M3 12.5h18" /></>,
  mic: <><rect x="9.5" y="3" width="5" height="10" rx="2.5" /><path d="M6 11a6 6 0 0 0 12 0" /><path d="M12 17v4" /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></>,
  users: <><circle cx="9" cy="8.5" r="3.4" /><path d="M2.5 20a6.6 6.6 0 0 1 13 0" /><path d="M16 5.4a3.4 3.4 0 0 1 0 6.3" /><path d="M17.5 14.2A6.6 6.6 0 0 1 21.5 20" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  bell: <><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></>,
  play: <><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" /></>,
  chevron: <><path d="m9.5 5.5 7 6.5-7 6.5" /></>,
  dots: <><circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.4 2" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  flag: <><path d="M5.5 21V4.5h13l-2.5 4 2.5 4h-13" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.4-3 8.2-7.5 9.5-4.5-1.3-7.5-5.1-7.5-9.5V6z" /></>,
  building: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2" /><path d="M10 20.5v-4h4v4" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-[19px] w-[19px]' }: {
  name: IconName; className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      className={'shrink-0 ' + className}
      fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

/* --------------------------------------------------------------- surfaces */

export function Card({ children, className = '', as: As = 'div' }: {
  children: React.ReactNode; className?: string; as?: 'div' | 'section' | 'li';
}) {
  return (
    <As className={'rounded-2xl border border-line bg-white shadow-card ' + className}>
      {children}
    </As>
  );
}

/** A section label + optional action, at the one size used everywhere. */
export function SectionHead({ title, id, action }: {
  title: string; id?: string; action?: { href: string; label: string };
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[11.5px] font-bold uppercase tracking-[.085em] text-muted">
        {title}
      </h2>
      {action ? (
        <Link href={action.href}
          className="inline-flex min-h-[28px] items-center px-0.5 text-[13px] font-semibold
                     text-brand-600 hover:underline">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ atoms */

/**
 * A progress ring. Reads faster than a 100px track at small sizes and, unlike
 * a bar, does not need horizontal room it will not get on a phone.
 */
export function Ring({ percent, label, size = 46 }: {
  percent: number; label?: string; size?: number;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <span
      role="img" aria-label={label ?? `${p} percent complete`}
      className="relative shrink-0" style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(#D87818 ${p}%, #D7E9EE 0)` }} />
      <span className="absolute rounded-full bg-white" style={{ inset: size * 0.11 }} />
      <span className="absolute inset-0 z-10 grid place-items-center text-[11.5px]
                       font-extrabold tabular-nums text-brand-700">
        {p}%
      </span>
    </span>
  );
}

/** A horizontal meter. `tone="light"` for use on the dark resume card. */
export function Meter({ percent, label, tone = 'dark' }: {
  percent: number; label: string; tone?: 'dark' | 'light';
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}
      aria-label={label}
      className={'h-2.5 overflow-hidden rounded-full '
        + (tone === 'light' ? 'bg-white/20' : 'bg-brand-100')}
    >
      <span className="block h-full rounded-full bg-gradient-to-r from-[#F0A24A] to-accent-500"
        style={{ width: p + '%' }} />
    </div>
  );
}

export function StatTile({ label, value, note, delta }: {
  label: string; value: string | number; note?: string; delta?: number;
}) {
  return (
    // The label renders in sentence case and is uppercased by CSS, so a test
    // matching on "LESSONS" finds nothing. The testid is the stable handle.
    <Card className="p-3.5">
      <div data-testid={'stat-' + label.toLowerCase().replace(/\s+/g, '-')}
        className="text-[10.5px] font-bold uppercase tracking-[.08em] text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums">{value}</div>
      {note || delta !== undefined ? (
        <div className="mt-1.5 text-xs text-muted">
          {delta !== undefined && delta !== 0 ? (
            <span className={'font-bold ' + (delta > 0 ? 'text-green-700' : 'text-red-700')}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}{' '}
            </span>
          ) : null}
          {note}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A status pill. `tone` maps to meaning, never to decoration -- `late` is the
 * only red thing on a student's dashboard, so red always means the same.
 */
export function Pill({ children, tone = 'neutral' }: {
  children: React.ReactNode; tone?: 'neutral' | 'soon' | 'late' | 'good' | 'brand';
}) {
  const tones = {
    neutral: 'bg-slate-100 text-muted',
    soon:    'bg-accent-50 text-accent-700',
    late:    'bg-red-50 text-red-700',
    good:    'bg-green-50 text-green-700',
    brand:   'bg-brand-50 text-brand-700',
  } as const;
  return (
    <span className={'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] '
      + 'font-bold ' + tones[tone]}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ dates */

/**
 * Human, relative dates -- "Tomorrow", "in 5 days", "2 days late".
 *
 * The dashboard previously rendered `toLocaleString()`, i.e.
 * "8/17/2026, 12:00:00 AM". For the one thing a student scans a list for --
 * what is urgent -- that is the least readable format available, and it makes
 * lateness something you work out rather than something you see.
 */
export function relativeDue(due: string | null | undefined, now = Date.now()): {
  text: string; tone: 'neutral' | 'soon' | 'late';
} {
  if (!due) return { text: 'No due date', tone: 'neutral' };
  const t = Date.parse(due);
  if (!Number.isFinite(t)) return { text: 'No due date', tone: 'neutral' };

  const dayMs = 86_400_000;
  // Compare calendar days, not elapsed hours: something due at 09:00 tomorrow
  // is "Tomorrow" whether it is now 22:00 or 08:00, which is how a person
  // reading a timetable thinks about it.
  const startOf = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOf(t) - startOf(now)) / dayMs);

  if (days < 0) {
    const n = Math.abs(days);
    return { text: n === 1 ? '1 day late' : `${n} days late`, tone: 'late' };
  }
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  if (days === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (days <= 7) return { text: `in ${days} days`, tone: days <= 3 ? 'soon' : 'neutral' };
  if (days <= 30) return { text: `in ${Math.round(days / 7)} weeks`, tone: 'neutral' };
  return { text: new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    tone: 'neutral' };
}

/** Empty states, styled once so no screen invents its own. */
export function Empty({ children, icon }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon ? <span className="text-muted"><Icon name={icon} className="h-7 w-7" /></span> : null}
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
