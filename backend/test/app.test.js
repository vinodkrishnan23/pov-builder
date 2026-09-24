const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../src/app');

function makeDb(overrides = {}) {
  return {
    command: async () => ({ ok: 1 }),
    collection(name) {
      if (overrides.collection) return overrides.collection(name);
      throw new Error('collection mock missing');
    }
  };
}

function request(server, method, path, body) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('health endpoint returns ok', async () => {
  const app = createApp({ db: makeDb() });
  const server = app.listen(0);
  const res = await request(server, 'GET', '/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
  server.close();
});

test('list tickets validates query params', async () => {
  const app = createApp({ db: makeDb({ collection: () => ({}) }) });
  const server = app.listen(0);
  const res = await request(server, 'GET', '/api/tickets?limit=500');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_QUERY_PARAMETER');
  server.close();
});

test('resolve ticket validates body', async () => {
  const app = createApp({ db: makeDb({ collection: () => ({}) }) });
  const server = app.listen(0);
  const res = await request(server, 'POST', '/api/tickets/T-1/resolve', {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_REQUEST_BODY');
  server.close();
});
