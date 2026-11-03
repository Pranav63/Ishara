const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', compiled)(exports);
  return exports;
}
const { parsePrefs, DEFAULTS } = load('preferences.ts');
assert.deepEqual(parsePrefs('broken JSON'), DEFAULTS);
assert.deepEqual(parsePrefs('null'), DEFAULTS);
assert.equal(parsePrefs('{"lang":"ar","theme":"dark","contrast":true,"size":2,"textOnly":true}').lang, 'ar');
assert.equal(parsePrefs('{"lang":"xx","theme":"invalid","size":99,"alerts":"yes"}').theme, 'system');
assert.equal(parsePrefs('{"size":99,"alerts":"yes"}').size, 0);
assert.equal(parsePrefs('{"alerts":"yes"}').alerts, false);
assert.equal(parsePrefs('{}').companion, 'falcon');
assert.equal(parsePrefs('{"companion":"robot"}').companion, 'falcon');
for (const companion of ['falcon', 'fox', 'pearl']) assert.equal(parsePrefs(JSON.stringify({ companion })).companion, companion);
const { dubaiEpoch, dubaiInputValue } = load('review.ts');
const expected = Date.UTC(2026, 10, 12, 6, 30) / 1000;
assert.equal(dubaiEpoch('2026-11-12T10:30'), expected);
assert.equal(dubaiInputValue(expected), '2026-11-12T10:30');
assert.throws(() => dubaiEpoch('2026-02-30T10:30'));
assert.throws(() => dubaiEpoch('2026-11-12T25:30'));
assert.throws(() => dubaiEpoch('not a date'));
const { areaName, languageName } = load('locale.ts');
assert.equal(areaName('Oud Metha', 'ar'), 'عود ميثاء');
assert.equal(areaName('Oud Metha', 'en'), 'Oud Metha');
assert.equal(areaName('Unlisted place', 'ar'), 'Unlisted place');
assert.equal(languageName('UAE Sign Language', 'ar'), 'لغة الإشارة الإماراتية');
const { stepOf } = load('state.ts');
assert.equal(stepOf('reviewing'), 0);
assert.equal(stepOf('dispatching'), 1);
assert.equal(stepOf('replanning'), 1);
assert.equal(stepOf('confirmed'), 2);
assert.equal(stepOf('completed'), 3);
console.log('UI self-checks passed: saved preference validation, Dubai date conversion, and review/matching progress.');

// Exercise async ownership with hook stubs, without adding a browser-test dependency.
(async () => {
  const hooks = []; let cursor = 0; let scheduled = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useRef(value) { const index = cursor++; hooks[index] ??= { current: value }; return hooks[index]; },
    useCallback(fn, deps) { const index = cursor++; if (!same(hooks[index]?.deps, deps)) hooks[index] = { value: fn, deps }; return hooks[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (!same(hooks[index]?.deps, deps)) { const previous = hooks[index]; hooks[index] = { deps }; scheduled.push(() => { previous?.cleanup?.(); hooks[index].cleanup = fn(); }); } },
  };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'lib', 'live.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sources = [];
  class Stream { constructor(url) { this.url = url; sources.push(this); } close() { this.closed = true; } }
  new Function('require', 'exports', 'EventSource', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', compiled)(name => name === 'react' ? react : { API: '' }, exports, Stream, () => 1, () => {}, () => 1, () => {});
  const pending = [];
  const load = () => new Promise(resolve => pending.push(resolve));
  const render = options => { cursor = 0; scheduled = []; const result = exports.useLive(load, options); scheduled.forEach(fn => fn()); return result; };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  render({ requesterToken: 'first' });
  render({ requesterToken: 'second' });
  pending[1]({ owner: 'second' }); await tick();
  pending[0]({ owner: 'first' }); await tick();
  assert.deepEqual(render({ requesterToken: 'second' }).data, { owner: 'second' });
  assert.equal(sources[0].closed, true);
  assert.equal(sources[1].url, '/api/stream?requester_token=second');
  const current = render({ requesterToken: 'second' });
  current.refresh();
  render({ enabled: false });
  pending[2]({ owner: 'second' }); await tick();
  assert.equal(render({ enabled: false }).data, null);
  assert.equal(sources[1].closed, true);
  console.log('Live UI self-checks passed: scoped stream, stale response rejection, and disabled session cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
