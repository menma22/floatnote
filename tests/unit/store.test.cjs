const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NoteStore } = require('../../electron/store.cjs');
const { createNote } = require('../../electron/model.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'floatnote-unit-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, 'notes.json') };
}

test('first launch is distinct from an existing empty collection', (t) => {
  const { file } = fixture(t);
  const store = new NoteStore(file);
  assert.equal(store.load().firstRun, true);
  store.changed();
  try {
    store.flush();
  } catch (error) {
    throw error.cause || error;
  }
  assert.equal(new NoteStore(file).load().firstRun, false);
});

test('flush persists the latest edit, interval, color, closed state and bounds', (t) => {
  const { file } = fixture(t);
  const store = new NoteStore(file);
  store.load();
  const note = createNote();
  store.state.notes.push(note);
  note.text = '終了直前の入力';
  note.content.content[0].content = [{ type: 'text', text: note.text }];
  note.intervalMinutes = 15;
  note.color = 'sage';
  note.isOpen = false;
  note.bounds = { x: 120, y: 150, width: 420, height: 380 };
  store.changed();
  store.flush();
  assert.deepEqual(new NoteStore(file).load().state, store.state);
  assert.equal(store.dirty, false);
});

test('rapid updates are debounced into a single atomic disk replacement', async (t) => {
  const { file } = fixture(t);
  let replacements = 0;
  const filesystem = {
    ...fs,
    renameSync: (...args) => {
      replacements++;
      fs.renameSync(...args);
    },
  };
  const store = new NoteStore(file, { filesystem, debounceMilliseconds: 20 });
  store.load();
  store.state.notes.push(createNote());
  for (let index = 0; index < 20; index++) {
    store.state.notes[0].text = String(index);
    store.changed();
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(replacements, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).notes[0].text, '19');
});

test('malformed saved data is preserved byte for byte and cannot be overwritten', (t) => {
  const { file } = fixture(t);
  const raw = Buffer.from('{"version":1,"notes":[BROKEN\n');
  fs.writeFileSync(file, raw);
  const store = new NoteStore(file);
  assert.throws(() => store.load(), /破損/);
  assert.throws(() => store.changed(), /上書き/);
  assert.throws(() => store.flush(), /上書き/);
  assert.deepEqual(fs.readFileSync(file), raw);
});

test('unsupported future schema and unreadable files never become a first launch', (t) => {
  const { file } = fixture(t);
  fs.writeFileSync(file, '{"version":99,"notes":[]}');
  assert.throws(() => new NoteStore(file).load(), /未対応/);
  const denied = {
    ...fs,
    readFileSync: () => {
      const error = new Error('denied');
      error.code = 'EACCES';
      throw error;
    },
  };
  const store = new NoteStore(file, { filesystem: denied });
  assert.throws(() => store.load(), /読み込めません/);
  assert.throws(() => store.changed());
});

test('a failed atomic replacement preserves prior data and a recovery copy; retry saves', (t) => {
  const { directory, file } = fixture(t);
  let fail = false;
  const filesystem = {
    ...fs,
    renameSync: (...args) => {
      if (fail) throw new Error('locked');
      return fs.renameSync(...args);
    },
  };
  const store = new NoteStore(file, { filesystem });
  store.load();
  store.state.notes.push(createNote());
  store.changed();
  store.flush();
  const previous = fs.readFileSync(file);
  store.state.notes[0].text = '最新の未保存メモ';
  store.changed();
  fail = true;
  assert.throws(() => store.flush(), /保存できません/);
  assert.deepEqual(fs.readFileSync(file), previous);
  assert.equal(store.dirty, true);
  assert.equal(
    fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')).length,
    1,
  );
  fail = false;
  store.flush();
  assert.equal(
    new NoteStore(file).load().state.notes[0].text,
    '最新の未保存メモ',
  );
});

test('background save failures are reported and the latest content remains in memory', async (t) => {
  const { file } = fixture(t);
  const errors = [];
  const filesystem = {
    ...fs,
    openSync: () => {
      throw new Error('disk full');
    },
  };
  const store = new NoteStore(file, {
    filesystem,
    debounceMilliseconds: 5,
    onError: (error) => errors.push(error),
  });
  store.load();
  store.state.notes.push(createNote());
  store.state.notes[0].text = '残す';
  store.changed();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /保存できません/);
  assert.equal(store.state.notes[0].text, '残す');
  assert.equal(fs.existsSync(file), false);
  assert.equal(store.dirty, true);
});
