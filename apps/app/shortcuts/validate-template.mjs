import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const readPlist = path => JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }));
const template = readPlist(fileURLToPath(new URL('./Padelaso.plist', import.meta.url)));
const actions = template.WFWorkflowActions;
const params = a => a.WFWorkflowActionParameters;
const kind = a => a.WFWorkflowActionIdentifier.replace('is.workflow.actions.', '');
const conditions = actions.filter(a => kind(a) === 'conditional' && params(a).WFControlFlowMode === 0);
assert.equal(conditions.length, 2);
for (const item of conditions) {
  const p = params(item);
  assert.equal(p.WFCondition, 101);
  assert.equal(p.WFNumberValue, undefined);
  assert.equal(p.WFInput.Type, 'Variable');
  const source = actions.find(a => params(a).UUID === p.WFInput.Variable.Value.OutputUUID);
  assert.equal(params(source).WFDictionaryKey, 'error');
}
assert.equal(template.WFWorkflowName, 'Padelaso');
assert.equal(template.WFWorkflowImportQuestions.length, 1);
assert.equal(params(actions[0]).WFTextActionText, '');
assert.ok(template.WFWorkflowTypes.includes('Watch'));
assert.equal(JSON.stringify(template).includes('?token=\ufffc'), true);
assert.equal(/[?&]token=[0-9a-f-]{36}/i.test(JSON.stringify(template)), false);
const requests = actions.filter(a => kind(a) === 'downloadurl');
assert.equal(requests.length, 4);
for (const item of requests) {
  const url = params(item).WFURL.Value;
  assert.match(url.string, /^https:\/\/app\.padelaso\.com\/api\/(score|events|shortcut\/options)\?token=\ufffc$/u);
  const references = Object.entries(url.attachmentsByRange);
  assert.equal(references.length, 1);
  assert.equal(references[0][0], `{${url.string.indexOf('\ufffc')}, 1}`);
  assert.equal(references[0][1].OutputUUID, params(actions[0]).UUID);
}
const question = template.WFWorkflowImportQuestions[0];
assert.equal(question.ActionIndex, 0);
assert.equal(question.ParameterKey, 'WFTextActionText');
assert.equal(question.DefaultValue, '');
const seen = new Set(), stack = [];
function checkReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (value.Type === 'ActionOutput') assert.ok(seen.has(value.OutputUUID));
  for (const child of Object.values(value)) checkReferences(child);
}
for (const item of actions) {
  const p = params(item);
  checkReferences(p);
  if (p.WFControlFlowMode === 0) stack.push(p.GroupingIdentifier);
  else if (p.WFControlFlowMode === 1 || p.WFControlFlowMode === 2) {
    assert.equal(stack.at(-1), p.GroupingIdentifier);
    if (p.WFControlFlowMode === 2) stack.pop();
  }
  if (p.UUID) {
    assert.ok(!seen.has(p.UUID));
    seen.add(p.UUID);
  }
}
assert.equal(stack.length, 0);
const eventStart = actions.findIndex(a => kind(a) === 'choosefrommenu' && params(a).WFMenuItemTitle === 'Evento');
const scoreRequests = actions.slice(0, eventStart).filter(a => kind(a) === 'downloadurl');
assert.equal(scoreRequests.length, 2);
for (const [index, item] of scoreRequests.entries()) {
  assert.equal(params(item).WFHTTPMethod, 'POST');
  const fields = params(item).WFJSONValues.Value.WFDictionaryFieldValueItems;
  assert.equal(fields[0].WFKey.Value.string, 'team');
  assert.equal(fields[0].WFItemType, 3);
  assert.equal(fields[0].WFValue.Value.string, String(index + 1));
}
for (const item of actions.slice(0, eventStart).filter(a => kind(a) === 'getvalueforkey')) {
  assert.equal(params(item).WFDictionaryKey, 'spoken');
}

// Replay event control flow with mock responses only: no HTTP requests or writes.
function simulate(responses) {
  const values = new Map();
  const branches = [];
  const requests = [], alerts = [], choices = [];
  const active = () => branches.every(b => b.parent && (b.otherwise ? !b.condition : b.condition));
  const attachment = a => values.get(a.Value.OutputUUID);
  for (const item of actions.slice(eventStart + 1)) {
    const p = params(item), k = kind(item);
    if (k === 'choosefrommenu' && p.WFControlFlowMode === 2) break;
    if (k === 'conditional') {
      if (p.WFControlFlowMode === 0) {
        const value = attachment(p.WFInput.Variable);
        branches.push({ parent: active(), condition: value === undefined || value === null || value === '', otherwise: false });
      } else if (p.WFControlFlowMode === 1) {
        branches.at(-1).otherwise = true;
      } else {
        branches.pop();
      }
      continue;
    }
    if (!active()) continue;
    if (k === 'downloadurl') {
      const path = p.WFURL.Value.string.split('?')[0];
      const endpoint = path.endsWith('/options') ? 'options' : 'events';
      requests.push(endpoint);
      values.set(p.UUID, responses[endpoint]);
    } else if (k === 'getvalueforkey') {
      values.set(p.UUID, attachment(p.WFInput)?.[p.WFDictionaryKey]);
    } else if (k === 'choosefromlist') {
      const list = attachment(p.WFInput);
      assert.ok(Array.isArray(list) && list.length > 0);
      choices.push(list[0]);
      values.set(p.UUID, list[0]);
    } else if (k === 'alert') {
      const reference = Object.values(p.WFAlertActionMessage.Value.attachmentsByRange)[0];
      alerts.push(values.get(reference.OutputUUID));
    } else {
      assert.equal(k, 'setvariable');
    }
  }
  assert.equal(branches.length, 0);
  return { requests, alerts, choices };
}

for (const withOk of [false, true]) {
  const options = { eventOptions: ['Evento de prueba'], playerOptions: ['Jugador de prueba'], ...(withOk ? { ok: true } : {}) };
  const success = { id: 'fixture-event', spoken: 'Evento guardado', ...(withOk ? { ok: true } : {}) };
  assert.deepEqual(simulate({ options, events: success }), {
    requests: ['options', 'events'], alerts: [], choices: ['Evento de prueba', 'Jugador de prueba'],
  });
  const failure = { error: 'Invalid token', spoken: 'Token inválido.', ...(withOk ? { ok: false } : {}) };
  assert.deepEqual(simulate({ options: failure }), { requests: ['options'], alerts: ['Token inválido.'], choices: [] });
  assert.deepEqual(simulate({ options, events: failure }), {
    requests: ['options', 'events'], alerts: ['Token inválido.'], choices: ['Evento de prueba', 'Jugador de prueba'],
  });
}
console.log('PASS: 6 mocked event flows; conditions, score branches, request bodies, token privacy, name and Watch metadata checked. Not an iOS runtime test.');
