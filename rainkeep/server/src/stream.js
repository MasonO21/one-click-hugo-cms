/*
 * Rainkeep server: the Server-Sent Events hub behind GET /v1/stream. It keeps the open streams in memory (so it
 * is per process: see README "What's next" for running more than one), sends each event only to the players it
 * concerns, and writes a comment line every 25 seconds so proxies don't close an idle stream.
 */
'use strict';

class Hub {
  constructor({ heartbeatMs = 25000, perPlayer = 3 } = {}) {
    this.subs = new Set();
    this.perPlayer = perPlayer;
    this.timer = setInterval(() => this.beat(), heartbeatMs);
    this.timer.unref();
  }

  // Registers an open response for player `pid`; it leaves the set when the connection closes.
  add(pid, req, res) {
    const sub = { pid, res, at: Date.now() };
    // one player can't hold an unbounded number of connections: the oldest stream gives way
    const mine = [...this.subs].filter((s) => s.pid === pid);
    if (mine.length >= this.perPlayer) this.drop(mine[0]);
    this.subs.add(sub);
    const done = () => this.subs.delete(sub);
    req.on('close', done);
    res.on('close', done);
    return sub;
  }

  // Ends a stream and closes its connection: kept alive, it would hold up a shutdown until the idle timeout.
  drop(sub) {
    this.subs.delete(sub);
    const sock = sub.res.socket;
    try {
      sub.res.end(() => { if (sock) sock.destroy(); });
    } catch (e) {
      if (sock) sock.destroy();
    }
  }

  write(sub, chunk) {
    if (sub.res.writableEnded || sub.res.destroyed) { this.subs.delete(sub); return; }
    try { sub.res.write(chunk); } catch (e) { this.subs.delete(sub); }
  }

  static frame(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  // Sends to every open stream whose player is in `ids` (an array or Set).
  to(ids, event, data) {
    const set = ids instanceof Set ? ids : new Set(ids);
    if (!set.size) return;
    const chunk = Hub.frame(event, data);
    for (const s of this.subs) if (set.has(s.pid)) this.write(s, chunk);
  }

  all(event, data) {
    const chunk = Hub.frame(event, data);
    for (const s of this.subs) this.write(s, chunk);
  }

  beat() {
    for (const s of this.subs) this.write(s, ': ping\n\n');
  }

  count() {
    return this.subs.size;
  }

  close() {
    clearInterval(this.timer);
    for (const s of [...this.subs]) this.drop(s);
  }
}

module.exports = { Hub };
