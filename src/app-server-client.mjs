import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import readline from 'node:readline';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const clientVersion = packageJson.version ?? '0.0.0';
const MAX_STDERR_BYTES = 64 * 1024;

export class AppServerClient {
  static async start(options) {
    const child = spawn(options.command, options.args ?? [], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return new AppServerClient(child, options.timeoutMs);
  }

  constructor(child, timeoutMs) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.responseIds = new Set();
    this.failure = null;
    this.closing = false;
    this.stderrChunks = [];
    this.stderrBytes = 0;
    this.lines = readline.createInterface({ input: child.stdout });
    this.lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (cause) {
        this.#fail(new Error('App-server emitted malformed JSONL', { cause }));
        return;
      }
      if (message.id === undefined) return;

      if (this.responseIds.has(message.id)) {
        this.#fail(new Error(`App-server emitted duplicate response ID ${message.id}`));
        return;
      }
      this.responseIds.add(message.id);

      const pending = this.pending.get(message.id);
      if (!pending) return;

      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error !== undefined) {
        const error = new Error(
          `JSON-RPC error ${message.error.code}: ${message.error.message}`
        );
        error.code = message.error.code;
        error.data = message.error.data;
        pending.reject(error);
        return;
      }
      pending.resolve(message.result);
    });
    child.once('error', (cause) => {
      this.#fail(new Error(`App-server process failed: ${cause.message}`, { cause }));
    });
    child.stderr.on('data', (chunk) => {
      const remaining = MAX_STDERR_BYTES - this.stderrBytes;
      if (remaining > 0) {
        const boundedChunk = chunk.subarray(0, remaining);
        this.stderrChunks.push(Buffer.from(boundedChunk));
        this.stderrBytes += boundedChunk.length;
      }
      if (chunk.length > remaining) {
        this.#fail(new Error('App-server stderr exceeded 64 KiB'));
      }
    });
    child.once('exit', (code, signal) => {
      if (this.closing) return;
      const status = code === null ? `signal ${signal}` : `code ${code}`;
      this.#fail(new Error(`App-server exited prematurely with ${status}`));
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      clientInfo: {
        name: 'codex-plugin-check',
        version: clientVersion
      },
      capabilities: { experimentalApi: true }
    });
    this.#write({ method: 'initialized' });
    return result;
  }

  request(method, params) {
    if (this.failure) return Promise.reject(this.failure);

    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `App-server request ${method} timed out after ${this.timeoutMs} ms`
          )
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.#write({ id, method, params });
    return promise;
  }

  close() {
    if (this.closePromise) return this.closePromise;

    this.closing = true;
    let forceTimer;
    this.closePromise = new Promise((resolve) => {
      const finish = () => {
        clearTimeout(forceTimer);
        resolve();
      };
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        finish();
        return;
      }
      this.child.once('close', finish);
    });
    this.#fail(new Error('App-server client closed'));
    if (this.child.exitCode === null && this.child.signalCode === null) {
      forceTimer = setTimeout(() => this.child.kill('SIGKILL'), 100);
      forceTimer.unref();
    }
    return this.closePromise;
  }

  #write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #fail(error) {
    if (this.failure) return;

    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.lines.close();
    this.child.stdin.destroy();
    this.child.kill();
  }
}
