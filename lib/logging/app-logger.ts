import util from "util";

/**
 * Minimal application logger.
 * In production、output should be collected by log aggregation (stdout).
 * Each log entry is a single-line JSON string so that CloudWatch / Datadog etc. can parse easily.
 */

/** Allowed log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  time: string; // ISO
  msg: string;
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, extra?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    time: new Date().toISOString(),
    msg,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug(msg: string, extra?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "production") return; // avoid verbose
    write("debug", msg, extra);
  },
  info(msg: string, extra?: Record<string, unknown>) {
    write("info", msg, extra);
  },
  warn(msg: string, extra?: Record<string, unknown>) {
    write("warn", msg, extra);
  },
  error(msg: string, extra?: Record<string, unknown>) {
    write("error", msg, extra);
  },
  /** convenience for logging objects */
  object(level: LogLevel, obj: unknown) {
    write(level, util.inspect(obj), {});
  },
} as const;
