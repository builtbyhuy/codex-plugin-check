import readline from 'node:readline';
import { closeSync } from 'node:fs';

const mode = process.argv[2];
if (mode === undefined) process.exit(0);
const lines = readline.createInterface({ input: process.stdin });

if (mode === 'stubborn' || mode === 'stubborn-malformed') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1_000);
}
if (mode === 'stdin-race') setInterval(() => {}, 1_000);

let initialized = false;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

lines.on('line', (line) => {
  const message = JSON.parse(line);

  if (message.method === 'initialize') {
    const expectedParams = {
      clientInfo: {
        name: 'codex-plugin-check',
        version: '0.1.0'
      },
      capabilities: { experimentalApi: true }
    };

    if (JSON.stringify(message.params) !== JSON.stringify(expectedParams)) {
      send({
        id: message.id,
        error: { code: -32602, message: 'unexpected initialize params' }
      });
      return;
    }

    send({
      id: message.id,
      result: {
        codexHome: '/tmp/fake-codex-home',
        platformFamily: 'unix',
        platformOs: 'fake-os',
        userAgent: 'fake-app-server/1.0',
        ...(mode === 'ids' ? { receivedId: message.id } : {})
      }
    });
    return;
  }

  if (message.method === 'initialized' && message.id === undefined) {
    initialized = true;
    if (mode === 'stdin-race') {
      process.stdin.on('error', () => {});
      lines.close();
      closeSync(0);
    }
    return;
  }

  if (!initialized) {
    send({
      id: message.id,
      error: { code: -32002, message: 'Not initialized' }
    });
    return;
  }

  if (mode === 'ids') {
    send({ id: message.id, result: { receivedId: message.id } });
    return;
  }

  if (mode === 'rpc-error') {
    send({
      id: message.id,
      error: { code: -32001, message: 'fixture RPC failure' }
    });
    return;
  }

  if (mode === 'malformed') {
    process.stdout.write('{not valid JSON}\n');
    return;
  }

  if (mode === 'stubborn-malformed') {
    process.stdout.write('{fatal malformed JSON}\n');
    return;
  }

  if (mode === 'json-null') {
    process.stdout.write('null\n');
    return;
  }

  if (mode === 'json-array') {
    process.stdout.write('[]\n');
    return;
  }

  if (mode === 'null-error') {
    send({ id: message.id, error: null });
    return;
  }

  if (mode === 'invalid-error') {
    send({ id: message.id, error: { code: 'bad', message: 7 } });
    return;
  }

  if (mode === 'unknown-id') {
    send({ id: message.id + 100, result: {} });
    return;
  }

  if (mode === 'invalid-id') {
    send({ id: String(message.id), result: {} });
    return;
  }

  if (mode === 'no-response') return;

  if (mode === 'exit') {
    process.exit(23);
  }

  if (mode === 'duplicate') {
    const response = {
      id: message.id,
      result: { plugin: { summary: { name: 'sample' } } }
    };
    send(response);
    send(response);
    return;
  }

  if (mode === 'stderr-overflow') {
    process.stderr.write(Buffer.alloc(65_537, 'x'));
    return;
  }

  if (mode === 'ok' && message.method === 'plugin/read') {
    send({
      id: message.id,
      result: {
        plugin: {
          summary: { name: message.params.pluginName },
          skills: ['skill-a'],
          hooks: ['hook-a']
        }
      }
    });
    return;
  }

  if (mode === 'ok' && message.method === 'skills/list') {
    send({ id: message.id, result: { data: [{ name: 'skill-a' }] } });
    return;
  }

  if (mode === 'ok' && message.method === 'hooks/list') {
    send({ id: message.id, result: { data: [{ name: 'hook-a' }] } });
    return;
  }

  send({
    id: message.id,
    error: { code: -32601, message: `unknown method: ${message.method}` }
  });
});
