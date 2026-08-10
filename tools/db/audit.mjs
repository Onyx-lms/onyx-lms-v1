/**
 * Deep deployment audit.
 *
 * verify-live checks table and column NAMES. This goes further: data types,
 * nullability, indexes, identity sequences, RLS coverage, seed fidelity and
 * storage configuration -- everything that must be right for the port to
 * behave like Laravel, not merely resemble it.
 */
import fs from 'node:fs';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { connect } from './connect.mjs';
import { laravelDb } from './laravel-source.mjs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^[/]([A-Za-z]:)/, '$1');
const env = Object.fromEntries(fs.readFileSync(ROOT + '.env', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

const PY = [
  'import sqlite3, json, sys',
  "c = sqlite3.connect(r'" + laravelDb() + "')",
  "out = {'tables': {}, 'indexes': [], 'counts': {}}",
  'for (t,) in c.execute("select name from sqlite_master where type=\'table\' and name not like \'sqlite_%\' order by name"):',
  "    out['tables'][t] = [",
  "        {'name': r[1], 'type': (r[2] or '').lower(), 'notnull': r[3], 'pk': r[5]}",
  '        for r in c.execute(\'pragma table_info("%s")\' % t)]',
  "    out['counts'][t] = c.execute('select count(*) from \"%s\"' % t).fetchone()[0]",
  'for (n,) in c.execute("select name from sqlite_master where type=\'index\' and sql is not null"):',
  "    out['indexes'].append(n)",
  'sys.stdout.write(json.dumps(out))',
].join('\n');

const source = JSON.parse(execFileSync('python', ['-c', PY],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

const EXPECTED_TYPE = {
  integer: 'bigint', varchar: 'character varying', text: 'text',
  'tinyint(1)': 'smallint', double: 'numeric', float: 'double precision',
  numeric: 'numeric', datetime: 'timestamp with time zone',
};

// Falls back to the IPv4 pooler when the IPv6-only direct host is unroutable.
const client = await connect(env);

const fail = [], warn = [], pass = [];

const { rows: liveCols } = await client.query(
  "select table_name, column_name, data_type, is_nullable, ordinal_position " +
  "from information_schema.columns where table_schema='public' " +
  'order by table_name, ordinal_position');
const liveByTable = {};
for (const r of liveCols) (liveByTable[r.table_name] ??= []).push(r);

let typeChecked = 0, typeBad = 0, nullBad = 0;
for (const [table, cols] of Object.entries(source.tables)) {
  const live = liveByTable[table] ?? [];
  for (let i = 0; i < cols.length; i++) {
    const src = cols[i], got = live[i];
    if (!got) { fail.push(table + '.' + src.name + ' missing'); continue; }
    typeChecked++;
    const want = EXPECTED_TYPE[src.type];
    if (want && got.data_type !== want) {
      typeBad++;
      fail.push(table + '.' + src.name + ': type ' + got.data_type + ', expected ' + want);
    }
    if ((src.notnull === 1) !== (got.is_nullable === 'NO') && !src.pk) {
      nullBad++;
      warn.push(table + '.' + src.name + ': nullable=' + got.is_nullable + ' laravel_notnull=' + src.notnull);
    }
  }
}
pass.push('column types: ' + (typeChecked - typeBad) + '/' + typeChecked + ' match the documented mapping');
if (!nullBad) pass.push('nullability: matches Laravel on every column');

const { rows: liveIdx } = await client.query(
  "select indexname from pg_indexes where schemaname='public'");
const liveIdxNames = new Set(liveIdx.map((r) => r.indexname));
const missingIdx = source.indexes.filter((n) => !liveIdxNames.has(n));
if (missingIdx.length) fail.push('missing indexes: ' + missingIdx.join(', '));
else pass.push('indexes: all ' + source.indexes.length + ' Laravel indexes present, ' +
  (liveIdxNames.size - source.indexes.length) + ' primary keys added');

// ---------- identity sequences ----------
const seqProblems = [];
for (const table of Object.keys(source.tables)) {
  if (!(source.tables[table] ?? []).some((c) => c.name === 'id')) continue;
  const { rows: [r] } = await client.query(
    'select coalesce(max(id), 0)::bigint as max_id, ' +
    "coalesce((select last_value from pg_sequences where schemaname='public' " +
    'and sequencename = $1), 0)::bigint as seq from public."' + table + '"',
    [table + '_id_seq']);
  if (Number(r.max_id) > Number(r.seq)) {
    seqProblems.push(table + ': max(id)=' + r.max_id + ' > sequence=' + r.seq +
      ' (next insert would collide)');
  }
}
if (seqProblems.length) fail.push(...seqProblems);
else pass.push('identity sequences: at or ahead of max(id) on every table');

// ---------- RLS ----------
// quiz_submissions exists by explicit decision (migration 0004): Laravel's own
// QuizSubmission model requires it but no migration ever created it.
const INTENTIONAL_ADDITIONS = ['quiz_submissions', 'blog_comments', 'blog_likes', 'user_reviews', 'bootcamp_resources'];
const tableCount = Object.keys(source.tables).length + INTENTIONAL_ADDITIONS.length;
const { rows: [rls] } = await client.query(
  "select count(*)::int c from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
  "where n.nspname='public' and c.relkind='r' and c.relrowsecurity");
const { rows: [forced] } = await client.query(
  "select count(*)::int c from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
  "where n.nspname='public' and c.relkind='r' and c.relforcerowsecurity");
if (rls.c !== tableCount) fail.push('RLS enabled on only ' + rls.c + '/' + tableCount + ' tables');
else pass.push('RLS: enabled on ' + rls.c + '/' + tableCount + ' tables (61 ported + '
  + INTENTIONAL_ADDITIONS.length + ' added), FORCEd on ' + forced.c);

const { rows: [fns] } = await client.query(
  "select count(*)::int c from pg_proc p join pg_namespace n on n.oid=p.pronamespace " +
  "where n.nspname='onyx'");
if (fns.c < 2) fail.push('onyx.current_user_id / onyx.current_app_role helpers missing');
else pass.push('claim helpers: onyx.current_user_id + onyx.current_app_role present');

// A policy that referenced auth.uid() would throw on our bigint ids (ADR-001).
const { rows: badPolicies } = await client.query(
  "select policyname, tablename from pg_policies where schemaname='public' " +
  "and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')");
if (badPolicies.length) {
  fail.push('policies using auth.uid() (throws on bigint ids): ' +
    badPolicies.map((p) => p.tablename + '.' + p.policyname).join(', '));
} else {
  pass.push('no policy depends on auth.uid() -- correct for bigint user ids');
}

// ---------- seed fidelity ----------
for (const table of ['settings', 'languages', 'language_phrases',
  'blog_categories', 'bootcamp_categories']) {
  const { rows: [r] } = await client.query('select count(*)::int c from public."' + table + '"');
  const want = source.counts[table] ?? 0;
  if (r.c !== want) fail.push(table + ': ' + r.c + ' rows live, source has ' + want);
  else pass.push('seed ' + table + ': ' + r.c + '/' + want + ' rows');
}

// Byte-level spot check on a couple of seeded values.
const { rows: [title] } = await client.query(
  "select description from public.settings where type='system_title'");
if (title?.description !== 'EZiL Certify') {
  fail.push('settings.system_title is ' + JSON.stringify(title?.description));
} else {
  pass.push('seed values: system_title matches the source byte for byte');
}

await client.end();

// ---------- storage ----------
const bucket = env.STORAGE_BUCKET || 'uploads';
try {
  const res = await fetch(env.SUPABASE_URL + '/storage/v1/bucket', {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
               Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  const buckets = res.ok ? await res.json() : [];
  const found = Array.isArray(buckets) && buckets.find((b) => b.name === bucket);
  if (!found) {
    fail.push('storage bucket "' + bucket + '" does not exist -- P-04 uploads and ' +
      'H-02 file migration cannot work until it is created');
  } else {
    pass.push('storage: bucket "' + bucket + '" exists (public=' + found.public + ')');
  }
} catch (e) {
  fail.push('storage check failed: ' + e.message);
}

console.log('DEPLOYMENT AUDIT');
console.log('\nPASS (' + pass.length + ')');
for (const p of pass) console.log('  +', p);
if (warn.length) {
  console.log('\nWARN (' + warn.length + ')');
  for (const w of warn.slice(0, 12)) console.log('  ~', w);
  if (warn.length > 12) console.log('  ~ ... and ' + (warn.length - 12) + ' more');
}
if (fail.length) {
  console.log('\nFAIL (' + fail.length + ')');
  for (const f of fail.slice(0, 20)) console.log('  x', f);
}
console.log('\n' + (fail.length ? 'AUDIT FAILED: ' + fail.length + ' problem(s)' : 'AUDIT CLEAN'));
// process.exit() here tore down libuv while a socket was still closing, which
// aborted the process AFTER a clean audit -- enough to break the && chain in
// verify:all so the end-to-end stage never ran. Set the code and let Node exit.
process.exitCode = fail.length ? 1 : 0;
