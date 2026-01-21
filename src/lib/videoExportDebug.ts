export type VideoExportLogLevel = "log" | "warn" | "error";

export interface VideoExportLogEntry {
  ts: number;
  level: VideoExportLogLevel;
  message: string;
}

const GLOBAL_KEY = "__audiomax_video_export_logs__";

function getStore(): VideoExportLogEntry[] {
  const g = globalThis as any;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = [] as VideoExportLogEntry[];
  return g[GLOBAL_KEY] as VideoExportLogEntry[];
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;

  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable]";
    }
  }
}

export function appendVideoExportLog(level: VideoExportLogLevel, args: unknown[]) {
  const store = getStore();
  const message = args.map(safeStringify).join(" ");

  store.push({ ts: Date.now(), level, message });

  // Keep bounded to avoid memory bloat.
  const max = 300;
  if (store.length > max) store.splice(0, store.length - max);
}

export function getVideoExportLogs() {
  return [...getStore()];
}

export function clearVideoExportLogs() {
  getStore().splice(0, getStore().length);
}

export function formatVideoExportLogs(entries: VideoExportLogEntry[]) {
  return entries
    .map((e) => `${new Date(e.ts).toISOString()} [${e.level}] ${e.message}`)
    .join("\n");
}
