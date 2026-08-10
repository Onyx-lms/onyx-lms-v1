/**
 * In-memory stand-in for the Supabase query builder.
 * Supports the subset the services use: select/eq/or/order/limit/range/
 * maybeSingle/insert(.select)/update/delete, plus exact counts.
 */
type Row = Record<string, unknown>;

export class FakeDb {
  tables: Record<string, Row[]>;
  constructor(tables: Record<string, Row[]>) { this.tables = tables; }

  from(table: string) {
    const rows = (): Row[] => (this.tables[table] ??= []);
    const eqs: [string, unknown][] = [];
    const ins: [string, unknown[]][] = [];
    let headOnly = false;
    let projection: string[] | null = null;
    let orTerm: string | null = null;
    const likes: string[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    let range: [number, number] | null = null;
    const neqs: [string, unknown][] = [];
    let pendingUpdate: Row | null = null;
    let pendingDelete = false;
    let inserted: Row[] | null = null;

    const matches = (r: Row) => {
      if (!eqs.every(([c, v]) => r[c] === v)) return false;
      if (!neqs.every(([c, v]) => r[c] !== v)) return false;
      if (!ins.every(([c, vs]) => vs.includes(r[c]))) return false;
      if (likes.length && !likes.every((clause) => clauseMatches(r, clause))) return false;
      if (orTerm) return splitTop(orTerm).some((clause) => clauseMatches(r, clause));
      return true;
    };

    const resolve = () => {
      if (inserted) return { data: inserted, count: inserted.length, error: null };
      if (pendingDelete) {
        const keep = rows().filter((r) => !matches(r));
        const removed = rows().length - keep.length;
        this.tables[table] = keep;
        return { data: null, count: removed, error: null };
      }
      if (pendingUpdate) {
        let n = 0;
        for (const r of rows()) if (matches(r)) { Object.assign(r, pendingUpdate); n++; }
        return { data: null, count: n, error: null };
      }
      let out = rows().filter(matches);
      const total = out.length;
      if (headOnly) return { data: null, count: total, error: null };
      if (orderBy) {
        const { col, asc } = orderBy;
        out = [...out].sort((a, b) =>
          (Number(a[col] ?? 0) - Number(b[col] ?? 0)) * (asc ? 1 : -1));
      }
      if (range) out = out.slice(range[0], range[1] + 1);
      if (projection) {
        const keep = projection;
        out = out.map((r) => Object.fromEntries(
          keep.filter((c) => c in r).map((c) => [c, r[c]])) as Row);
      }
      if (limitN !== null) out = out.slice(0, limitN);
      return { data: out, count: total, error: null };
    };

    const builder: any = {
      // Honours the column list, like PostgREST does. Without this, tests that
      // assert a field is NOT returned (answer keys, password hashes) silently
      // pass against a fake that returns everything.
      select: (cols?: string, opts?: { head?: boolean }) => {
        if (opts && opts.head) headOnly = true;
        if (cols && cols.trim() !== '*') {
          projection = cols.split(',').map((c) => c.trim().split(' ')[0]!).filter(Boolean);
        }
        return builder;
      },
      in: (col: string, vals: unknown[]) => { ins.push([col, vals]); return builder; },
      eq: (col: string, val: unknown) => { eqs.push([col, val]); return builder; },
      neq: (col: string, val: unknown) => { neqs.push([col, val]); return builder; },
      or: (term: string) => { orTerm = term; return builder; },
      // Same clause grammar as or(), so one implementation covers both.
      ilike: (col: string, pattern: string) => {
        likes.push(col + '.ilike.' + pattern); return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy = { col, asc: opts?.ascending !== false }; return builder;
      },
      limit: (n: number) => { limitN = n; return builder; },
      range: (a: number, b: number) => { range = [a, b]; return builder; },
      update: (patch: Row) => { pendingUpdate = patch; return builder; },
      delete: () => { pendingDelete = true; return builder; },
      insert: (row: Row | Row[]) => {
        const list = Array.isArray(row) ? row : [row];
        const nextId = () => rows().reduce((m, r) => Math.max(m, Number(r['id'] ?? 0)), 0) + 1;
        inserted = list.map((r) => {
          const created = { id: r['id'] ?? nextId(), ...r };
          rows().push(created);
          return created;
        });
        return builder;
      },
      maybeSingle: async () => {
        const res = resolve();
        const list = (res.data ?? []) as Row[];
        return { data: list[0] ?? null, count: res.count, error: null };
      },
      then: (resolveFn: (v: unknown) => unknown) => Promise.resolve(resolve()).then(resolveFn),
    };
    return builder;
  }
}

/**
 * Splits a PostgREST filter list on top-level commas only, so a nested group
 * like `and(a.eq.1,b.eq.2)` stays in one piece. Splitting naively made
 * `or(and(...),and(...))` unparseable, which silently turned a two-condition
 * pair lookup into "match everything".
 */
function splitTop(expr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { out.push(expr.slice(start, i)); start = i + 1; }
  }
  out.push(expr.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** One clause: `and(...)`, `or(...)`, `col.eq.v` or `col.ilike.%v%`. */
function clauseMatches(row: Record<string, unknown>, clause: string): boolean {
  const group = /^(and|or)\((.*)\)$/s.exec(clause);
  if (group) {
    const parts = splitTop(group[2] ?? '');
    return group[1] === 'and'
      ? parts.every((p) => clauseMatches(row, p))
      : parts.some((p) => clauseMatches(row, p));
  }
  const dot = clause.indexOf('.');
  const col = clause.slice(0, dot);
  const rest = clause.slice(dot + 1);
  const op = rest.slice(0, rest.indexOf('.'));
  const value = rest.slice(rest.indexOf('.') + 1);

  if (op === 'ilike' || op === 'like') {
    const needle = value.replace(/%/g, '');
    const cell = String(row[col] ?? '');
    return op === 'ilike'
      ? cell.toLowerCase().includes(needle.toLowerCase())
      : cell.includes(needle);
  }
  if (op === 'eq') return String(row[col] ?? '') === value;
  if (op === 'neq') return String(row[col] ?? '') !== value;
  if (op === 'is') return value === 'null' ? row[col] == null : String(row[col]) === value;
  throw new Error('fake-db: unsupported filter operator ' + JSON.stringify(op));
}
