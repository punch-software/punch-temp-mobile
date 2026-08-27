import { Directory, File as FsFile, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

/**
 * UI preferences: which input surface the composer rests on (voice-first
 * mic vs. text field) and which side the keyboard toggle sits on.
 * Persisted to disk so the choice survives restarts.
 */
export type UiPrefs = {
  inputSurface: "voice" | "text";
  keyboardSide: "left" | "right";
};

const DEFAULTS: UiPrefs = { inputSurface: "voice", keyboardSide: "right" };

const prefsFile = () => new FsFile(new Directory(Paths.document, "punch"), "prefs.json");

const loadPrefs = (): UiPrefs => {
  try {
    const file = prefsFile();
    if (!file.exists) return DEFAULTS;
    const raw = JSON.parse(file.textSync()) as Partial<UiPrefs>;
    return {
      inputSurface: raw.inputSurface === "text" ? "text" : "voice",
      keyboardSide: raw.keyboardSide === "left" ? "left" : "right",
    };
  } catch {
    return DEFAULTS;
  }
};

type Listener = () => void;
let prefs: UiPrefs = loadPrefs();
const listeners = new Set<Listener>();

const persist = () => {
  try {
    const dir = new Directory(Paths.document, "punch");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    prefsFile().write(JSON.stringify(prefs));
  } catch {
    // non-fatal
  }
};

export const prefsStore = {
  get prefs() {
    return prefs;
  },
  set(patch: Partial<UiPrefs>) {
    prefs = { ...prefs, ...patch };
    listeners.forEach((l) => l());
    persist();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useUiPrefs = (): UiPrefs =>
  useSyncExternalStore(prefsStore.subscribe, () => prefs, () => prefs);
