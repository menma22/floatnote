class NoteScheduler {
  constructor({
    onDue,
    now = Date.now,
    pollMilliseconds = 1000,
    setTimer = setInterval,
    clearTimer = clearInterval,
  }) {
    this.onDue = onDue;
    this.now = now;
    this.pollMilliseconds = pollMilliseconds;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.entries = new Map();
    this.timer = null;
  }

  open(id, intervalMinutes, now = this.now()) {
    this.entries.set(id, {
      intervalMilliseconds: intervalMinutes * 60000,
      nextAt: now + intervalMinutes * 60000,
    });
  }

  close(id) {
    this.entries.delete(id);
  }

  setInterval(id, intervalMinutes, now = this.now()) {
    if (this.entries.has(id)) this.open(id, intervalMinutes, now);
  }

  tick(now = this.now()) {
    const due = [];
    for (const [id, entry] of this.entries) {
      if (now >= entry.nextAt) {
        // Schedule from now so waking from sleep cannot replay missed reminders.
        entry.nextAt = now + entry.intervalMilliseconds;
        due.push(id);
      }
    }
    for (const id of due) if (this.entries.has(id)) this.onDue(id);
    return due;
  }

  start() {
    if (this.timer !== null) return;
    this.timer = this.setTimer(() => this.tick(), this.pollMilliseconds);
    this.timer?.unref?.();
  }

  stop() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}

module.exports = { NoteScheduler };
