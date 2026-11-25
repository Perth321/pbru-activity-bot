import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  initialized: false,
  lastCheckedAt: null,
  notifiedIds: [],
};

/**
 * Loads notification tracking state from disk.
 */
export async function loadState(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      initialized: Boolean(parsed.initialized),
      lastCheckedAt: parsed.lastCheckedAt || null,
      notifiedIds: Array.isArray(parsed.notifiedIds) ? parsed.notifiedIds : [],
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { ...DEFAULT_STATE };
    }
    throw err;
  }
}

/**
 * Saves notification tracking state safely, keeping a bounded history of IDs.
 */
export async function saveState(filePath, state) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const trimmed = {
    initialized: Boolean(state.initialized),
    lastCheckedAt: state.lastCheckedAt || new Date().toISOString(),
    notifiedIds: state.notifiedIds.slice(-500),
  };
  await fs.writeFile(filePath, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
}
