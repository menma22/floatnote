const test = require('node:test');
const assert = require('node:assert/strict');
const { NoteScheduler } = require('../../electron/scheduler.cjs');

test('each open note has its own deadline and closed notes never resurface', () => {
  const due = [];
  const scheduler = new NoteScheduler({
    onDue: (id) => due.push(id),
    now: () => 0,
  });
  scheduler.open('first', 5);
  scheduler.open('second', 15);
  scheduler.open('closed', 5);
  scheduler.close('closed');
  scheduler.tick(299999);
  assert.deepEqual(due, []);
  scheduler.tick(300000);
  assert.deepEqual(due, ['first']);
  scheduler.tick(900000);
  assert.deepEqual(due, ['first', 'first', 'second']);
  assert.equal(scheduler.entries.has('closed'), false);
});

test('changing interval restarts that note at the time of the change', () => {
  const due = [];
  let now = 0;
  const scheduler = new NoteScheduler({
    onDue: (id) => due.push(id),
    now: () => now,
  });
  scheduler.open('note', 30);
  now = 25 * 60000;
  scheduler.setInterval('note', 15);
  scheduler.tick(30 * 60000);
  assert.deepEqual(due, []);
  scheduler.tick(40 * 60000);
  assert.deepEqual(due, ['note']);
});

test('wake after a long sleep emits once and computes the next deadline from wake time', () => {
  const due = [];
  const scheduler = new NoteScheduler({
    onDue: (id) => due.push(id),
    now: () => 0,
  });
  scheduler.open('note', 5);
  const wake = 10 * 60 * 60000;
  assert.deepEqual(scheduler.tick(wake), ['note']);
  assert.deepEqual(scheduler.tick(wake), []);
  scheduler.tick(wake + 299999);
  assert.deepEqual(due, ['note']);
  scheduler.tick(wake + 300000);
  assert.deepEqual(due, ['note', 'note']);
});

test('closing and reopening resets the deadline; editing closed notes does not open them', () => {
  const scheduler = new NoteScheduler({
    onDue: () => assert.fail('closed note resurfaced'),
    now: () => 0,
  });
  scheduler.open('note', 5);
  scheduler.close('note');
  scheduler.setInterval('note', 15);
  assert.equal(scheduler.entries.size, 0);
  scheduler.open('note', 15, 1000000);
  assert.deepEqual(scheduler.tick(1000001), []);
  assert.equal(scheduler.entries.get('note').nextAt, 1900000);
});

test('timer start is idempotent and uses the same production tick callback', () => {
  let callback;
  let starts = 0;
  let stops = 0;
  const due = [];
  const scheduler = new NoteScheduler({
    now: () => 300000,
    onDue: (id) => due.push(id),
    setTimer: (fn, delay) => {
      callback = fn;
      starts++;
      assert.equal(delay, 1000);
      return 42;
    },
    clearTimer: (id) => {
      assert.equal(id, 42);
      stops++;
    },
  });
  scheduler.open('note', 5, 0);
  scheduler.start();
  scheduler.start();
  callback();
  assert.deepEqual(due, ['note']);
  assert.equal(starts, 1);
  scheduler.stop();
  scheduler.stop();
  assert.equal(stops, 1);
});

test('callbacks may close other due notes without resurrecting them', () => {
  const due = [];
  const scheduler = new NoteScheduler({
    onDue: (id) => {
      due.push(id);
      scheduler.close('second');
    },
    now: () => 0,
  });
  scheduler.open('first', 5);
  scheduler.open('second', 5);
  scheduler.tick(300000);
  assert.deepEqual(due, ['first']);
});
