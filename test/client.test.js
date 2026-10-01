'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client, ConnectMediaError, normalizeMsisdn } = require('../src/index.js');

function fakeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (response instanceof Error) throw response;
    return { text: async () => (typeof response === 'string' ? response : JSON.stringify(response)) };
  };
  fn.calls = calls;
  return fn;
}

test('normalizeMsisdn handles local and international formats', () => {
  assert.equal(normalizeMsisdn('0712345678'), '254712345678');
  assert.equal(normalizeMsisdn('0110 123 456'), '254110123456');
  assert.equal(normalizeMsisdn('+254 712-345-678'), '254712345678');
  assert.equal(normalizeMsisdn('256712345678'), '256712345678');
});

test('send builds the request', async () => {
  const f = fakeFetch({ code: '201', message: 'Queued' });
  const res = await new Client('k'.repeat(64), { fetch: f }).send(['0712345678', '+254733000111'], 'Hi', { sender: 'Brand' });
  const { url, init, body } = f.calls[0];
  assert.equal(url, 'https://app.connectmedia.co.ke/api.php');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${'k'.repeat(64)}`);
  assert.deepEqual(body, { action: 'send', to: '254712345678,254733000111', message: 'Hi', sender: 'Brand' });
  assert.equal(res.code, '201');
});

test('send splits comma strings and schedules', async () => {
  const f = fakeFetch({ code: '201', message: 'ok' });
  await new Client('k', { fetch: f }).send('0712345678, 0722000000', 'Hi', { scheduleAt: new Date(2026, 11, 1, 9, 0, 0) });
  assert.equal(f.calls[0].body.to, '254712345678,254722000000');
  assert.equal(f.calls[0].body.schedule, 1);
  assert.equal(f.calls[0].body.schedule_datetime, '2026-12-01 09:00:00');
});

test('validation errors', () => {
  const c = new Client('k', { fetch: fakeFetch({}) });
  assert.throws(() => c.send([], 'Hi'), TypeError);
  assert.throws(() => c.send('0712345678', ''), TypeError);
  assert.throws(() => c.send('0712345678', 'Hi', { sender: 'ThisIsTooLong' }), TypeError);
  assert.throws(() => new Client(''), TypeError);
});

test('each action checks its own success code', async () => {
  for (const [method, code] of [['balance', '200'], ['history', '202'], ['inbox', '302']]) {
    const f = fakeFetch({ code, message: 'ok' });
    assert.equal((await new Client('k', { fetch: f })[method]()).code, code);
    assert.equal(f.calls[0].body.action, method);
  }
  await assert.rejects(new Client('k', { fetch: fakeFetch({ code: '200', message: '?' }) }).send('0712345678', 'Hi'), ConnectMediaError);
});

test('api, parse and network errors become ConnectMediaError', async () => {
  await assert.rejects(new Client('k', { fetch: fakeFetch({ code: '100', message: 'Invalid or missing API key' }) }).balance(), (e) => e.code === '100');
  await assert.rejects(new Client('k', { fetch: fakeFetch('<html>') }).balance(), (e) => e.code === 'invalid_response');
  await assert.rejects(new Client('k', { fetch: fakeFetch(new Error('ECONNRESET')) }).balance(), (e) => e.code === 'network');
});

test('history passes optional dates', async () => {
  const f = fakeFetch({ code: '202', message: 'ok' });
  await new Client('k', { fetch: f }).history({ limit: 5, startDate: '2026-09-01' });
  assert.deepEqual(f.calls[0].body, { action: 'history', limit: 5, offset: 0, start_date: '2026-09-01' });
});
