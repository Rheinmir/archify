// Two lifecycle regressions a user caught by eye while every gate stayed green:
//  1. The primary rail sat at phaseY + 31 (default height 62), so a spec with its
//     own state height drew a second line 2px beside every phase arrow.
//  2. A bottom-channel loop climbing into a column-1 state struck through the
//     "02 /" band title, which is drawn under the transition layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-lifecycle-rail-'));

const state = (id, lane, col, type = 'active') => ({ id, type, label: id, lane, col, height: 58 });
const spec = {
  schema_version: 1,
  diagram_type: 'lifecycle',
  meta: { title: 'Rail and band title regression', output: 'rail.html', viewBox: [1080, 510] },
  lanes: [{ id: 'main', label: 'Task state in the Orca run' }, { id: 'endsess', label: 'Carried across sessions in the repo' }],
  states: [
    state('pending', 'main', 0, 'start'),
    state('ready', 'main', 1),
    state('dispatched', 'main', 2),
    state('completed', 'main', 3, 'success'),
    state('sessionend', 'endsess', 0, 'waiting'),
    state('recall', 'endsess', 2, 'neutral'),
  ],
  transitions: [
    { id: 'pending-ready', from: 'pending', to: 'ready' },
    { id: 'ready-dispatched', from: 'ready', to: 'dispatched' },
    { id: 'dispatched-completed', from: 'dispatched', to: 'completed' },
    { id: 'dispatched-sessionend', from: 'dispatched', to: 'sessionend', variant: 'dashed' },
    { id: 'sessionend-recall', from: 'sessionend', to: 'recall' },
    { id: 'recall-ready', from: 'recall', to: 'ready', variant: 'emphasis', route: 'bottom-channel', fromSide: 'bottom', toSide: 'bottom' },
  ],
};

function render(name, input) {
  const output = path.join(tmp, `${name}.html`);
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/lifecycle/render-lifecycle.mjs'), input, output]);
  return fs.readFileSync(output, 'utf8');
}

const specPath = path.join(tmp, 'rail.lifecycle.json');
fs.writeFileSync(specPath, JSON.stringify(spec));
const html = render('rail', specPath);

test('primary rail runs on the same centre line as the phase arrows for a custom state height', () => {
  const rail = html.match(/<path d="M 154 ([\d.]+) L [\d.]+ ([\d.]+)" class="a-emphasis"/);
  const arrow = html.match(/data-edge-id="pending-ready"[^>]*\bd="M [\d.]+ ([\d.]+) L [\d.]+ ([\d.]+)"/);
  assert.ok(rail && arrow, 'rail and pending-ready arrow are both rendered');
  assert.equal(rail[1], arrow[1], `rail y ${rail[1]} must equal arrow y ${arrow[1]}`);
});

test('a band title crossed by a route is re-drawn above the routes on a mask plate', () => {
  const copies = html.match(/>02 \/ Carried across sessions in the repo</g) || [];
  assert.equal(copies.length, 2, 'original title plus one masked copy above the routes');
  const routes = html.indexOf('<!-- Transition paths -->');
  const masked = html.indexOf('class="c-mask" aria-hidden="true"');
  const statesLayer = html.indexOf('<!-- States -->');
  assert.ok(routes < masked && masked < statesLayer, 'mask sits after the routes and before the states');
});

test('a lifecycle whose routes clear the band titles gets no masked copy', () => {
  const plain = render('agent-run', path.join(skillRoot, 'examples', 'agent-run.lifecycle.json'));
  assert.ok(!plain.includes('class="c-mask" aria-hidden="true"'), 'no mask plate when nothing crosses a title');
});
