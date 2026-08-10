import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CHECKOUT = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262';
const SETUP_NODE = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020';
const UPLOAD = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02';

function section(source, key, indentation = 0) {
  const lines = source.split(/\r?\n/u);
  const prefix = `${' '.repeat(indentation)}${key}:`;
  const start = lines.findIndex((line) => line === prefix);
  if (start === -1) throw new Error(`Missing YAML section ${key}`);
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') {
      body.push(line);
      continue;
    }
    const observedIndent = line.length - line.trimStart().length;
    if (observedIndent <= indentation) break;
    body.push(line);
  }
  return body;
}

function mappingKeys(lines, indentation) {
  return lines.flatMap((line) => {
    const match = line.match(new RegExp(`^ {${indentation}}([A-Za-z0-9_-]+):(?:\\s.*)?$`, 'u'));
    return match ? [match[1]] : [];
  });
}

function scalar(lines, key, indentation) {
  const pattern = new RegExp(`^ {${indentation}}${key}:\\s*(.+)$`, 'u');
  const line = lines.find((candidate) => pattern.test(candidate));
  if (!line) throw new Error(`Missing YAML scalar ${key}`);
  return line.match(pattern)[1];
}

function steps(source) {
  const lines = source.split(/\r?\n/u);
  const results = [];
  let current;
  for (const line of lines) {
    const name = line.match(/^ {6}- name:\s*(.+)$/u);
    if (name) {
      current = { name: name[1], source: [] };
      results.push(current);
    }
    if (current) current.source.push(line);
  }
  return results;
}

function stepUsing(source, action) {
  const result = steps(source).find((step) => step.source.includes(`        uses: ${action}`));
  if (!result) throw new Error(`Missing workflow step using ${action}`);
  return result;
}

async function workflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
}

test('ordinary CI is least-privilege Node 24 validation on pushes and pull requests', async () => {
  const source = await workflow('ci.yml');

  assert.deepEqual(mappingKeys(section(source, 'on'), 2), [
    'push',
    'pull_request',
    'workflow_dispatch'
  ]);
  assert.deepEqual(section(source, 'permissions').filter((line) => line.trim()), [
    '  contents: read'
  ]);
  assert.match(source, /^    runs-on: ubuntu-24\.04$/mu);
  assert.match(source, /^    timeout-minutes: 10$/mu);
  assert.match(source, /^          node-version: 24\.19\.0$/mu);
  assert.equal(
    scalar(stepUsing(source, CHECKOUT).source, 'persist-credentials', 10),
    'false'
  );
  assert.ok(stepUsing(source, SETUP_NODE));
  assert.deepEqual(
    steps(source).filter((step) => step.source.some((line) => line.includes('uses:'))).length,
    2
  );
});

test('strict released falsifier runs only from trusted main pushes or manual dispatch', async () => {
  const source = await workflow('released-codex.yml');

  assert.deepEqual(mappingKeys(section(source, 'on'), 2), ['push', 'workflow_dispatch']);
  assert.deepEqual(section(source, 'permissions').filter((line) => line.trim()), [
    '  contents: read'
  ]);
  assert.match(source, /^    runs-on: ubuntu-24\.04$/mu);
  assert.match(source, /^    timeout-minutes: 20$/mu);
  assert.match(source, /^      - \.dockerignore$/mu);
  assert.match(source, /^      CODEX_CURRENT_VERSION: 0\.147\.0$/mu);
  assert.match(source, /^      CODEX_PRIOR_VERSION: 0\.146\.1$/mu);
  assert.match(
    source,
    /^      CODEX_FALSIFIER_OUTPUT_ROOT: artifacts\/released-codex$/mu
  );
  assert.equal(
    scalar(stepUsing(source, CHECKOUT).source, 'persist-credentials', 10),
    'false'
  );
  assert.ok(stepUsing(source, SETUP_NODE));
  const upload = stepUsing(source, UPLOAD);
  assert.equal(scalar(upload.source, 'path', 10), 'artifacts/released-codex');
  assert.equal(scalar(upload.source, 'if-no-files-found', 10), 'error');
  assert.deepEqual(
    steps(source).filter((step) => step.source.some((line) => line.includes('uses:'))).length,
    3
  );
});
