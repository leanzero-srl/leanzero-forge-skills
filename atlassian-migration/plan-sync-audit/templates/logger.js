"use strict";

/**
 * logger — dual-sink (console + file) logger with ISO-timestamped lines.
 * Zero deps. Use this instead of writing `fs.appendFileSync` everywhere.
 *
 *   const { Logger } = require("../src/logger");
 *   const log = new Logger("logs/sync_1747549872311.log", { level: "info" });
 *
 *   log.info("Starting sync...");
 *   log.warn("Rate limited, retrying");
 *   log.error("PUT failed:", err);
 *   log.debug("internal state:", state);     // only if level <= debug
 *
 * Levels: error < warn < info < debug. Default: info. Override with
 * `DEBUG=1` env var or `new Logger(path, { level: "debug" })`.
 *
 * The log file is opened on first write (lazy) and held open for the
 * process lifetime. Re-opening on every line is too slow for hot loops.
 * Falls back to stderr-only if the file path is invalid.
 */

const fs = require("fs");
const path = require("path");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

class Logger {
  /**
   * @param {string|null} filePath  file to append to; pass null for console-only
   * @param {object} [opts]
   * @param {string} [opts.level="info"]
   * @param {boolean} [opts.consoleOnly=false]
   */
  constructor(filePath, opts = {}) {
    this.filePath = filePath;
    this.consoleOnly = !!opts.consoleOnly || !filePath;
    this.level = LEVELS[opts.level || (process.env.DEBUG ? "debug" : "info")] ?? LEVELS.info;
    this._stream = null;
    this._streamFailed = false;
  }

  _open() {
    if (this._stream || this._streamFailed || this.consoleOnly) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this._stream = fs.createWriteStream(this.filePath, { flags: "a" });
      const header = `\n=== Log opened ${new Date().toISOString()} ===\n`;
      this._stream.write(header);
    } catch (err) {
      this._streamFailed = true;
      process.stderr.write(`[logger] failed to open ${this.filePath}: ${err.message}\n`);
    }
  }

  _write(levelName, args) {
    const ts = new Date().toISOString();
    const text = args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "object") return JSON.stringify(a);
      return String(a);
    }).join(" ");
    const line = `[${ts}] [${levelName}] ${text}`;

    // Console
    if (levelName === "error" || levelName === "warn") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }

    // File
    if (!this.consoleOnly) {
      this._open();
      if (this._stream) {
        try { this._stream.write(line + "\n"); } catch { /* ignore */ }
      }
    }
  }

  error(...args) { if (this.level >= LEVELS.error) this._write("error", args); }
  warn(...args)  { if (this.level >= LEVELS.warn)  this._write("warn",  args); }
  info(...args)  { if (this.level >= LEVELS.info)  this._write("info",  args); }
  debug(...args) { if (this.level >= LEVELS.debug) this._write("debug", args); }

  /** Plain-print, no level or timestamp (banners, separators). */
  raw(text)      { if (!this.consoleOnly) { this._open(); this._stream?.write(text + "\n"); } /* eslint-disable-next-line no-console */ console.log(text); }

  close() {
    if (this._stream) {
      try { this._stream.end(); } catch { /* ignore */ }
      this._stream = null;
    }
  }
}

module.exports = { Logger };
