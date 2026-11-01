const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateState } = require('./model.cjs');

class NoteStore {
  constructor(
    filePath,
    { filesystem = fs, debounceMilliseconds = 180, onError = () => {} } = {},
  ) {
    this.filePath = filePath;
    this.fs = filesystem;
    this.debounceMilliseconds = debounceMilliseconds;
    this.onError = onError;
    this.state = { version: 1, notes: [] };
    this.dirty = false;
    this.timer = null;
    this.loadFailed = false;
  }

  load() {
    let raw;
    try {
      raw = this.fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return { firstRun: true, state: this.state };
      this.loadFailed = true;
      throw new Error(
        '保存データを読み込めません。元のファイルを保持して起動を停止します。',
        { cause: error },
      );
    }
    try {
      this.state = validateState(JSON.parse(raw));
      return { firstRun: false, state: this.state };
    } catch (error) {
      this.loadFailed = true;
      throw new Error(
        '保存データが破損しているか未対応の形式です。元のファイルを保持して起動を停止します。',
        { cause: error },
      );
    }
  }

  changed() {
    if (this.loadFailed)
      throw new Error('読み込めなかった保存データは上書きできません。');
    this.dirty = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.flush();
      } catch (error) {
        this.onError(error);
      }
    }, this.debounceMilliseconds);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.loadFailed)
      throw new Error('読み込めなかった保存データは上書きできません。');
    if (!this.dirty) return;
    validateState(this.state);
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    let descriptor;
    try {
      descriptor = this.fs.openSync(temporaryPath, 'wx', 0o600);
      this.fs.writeFileSync(
        descriptor,
        `${JSON.stringify(this.state)}\n`,
        'utf8',
      );
      this.fs.fsyncSync(descriptor);
      this.fs.closeSync(descriptor);
      descriptor = undefined;
      this.fs.renameSync(temporaryPath, this.filePath);
      this.dirty = false;
    } catch (error) {
      // Keep the last complete file and any temporary recovery copy on failure.
      const code =
        typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
          ? ` (${error.code})`
          : '';
      throw new Error(
        `メモを保存できません${code}。書き込み先を確認してください。未保存の内容はこのアプリ内に残っています。`,
        { cause: error },
      );
    } finally {
      if (descriptor !== undefined) this.fs.closeSync(descriptor);
    }
  }
}

module.exports = { NoteStore };
