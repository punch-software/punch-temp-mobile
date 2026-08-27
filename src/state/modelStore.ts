import { useSyncExternalStore } from "react";

export type PunchModel = {
  id: string;
  name: string;
  tagline: string;
  /** Streaming speed multiplier — Mini streams noticeably faster. */
  speed: number;
};

export const PUNCH_MODELS: PunchModel[] = [
  { id: "punch-4.6", name: "Punch 4.6", tagline: "Our smartest model", speed: 1 },
  { id: "punch-4.6-mini", name: "Punch 4.6 Mini", tagline: "Fast answers for everyday tasks", speed: 2.2 },
  { id: "punch-3-classic", name: "Punch 3 Classic", tagline: "The previous generation", speed: 0.8 },
];

type Listener = () => void;

let selected: PunchModel = PUNCH_MODELS[0]!;
const listeners = new Set<Listener>();

export const modelStore = {
  get selected() {
    return selected;
  },
  select(id: string) {
    const next = PUNCH_MODELS.find((m) => m.id === id);
    if (next && next !== selected) {
      selected = next;
      listeners.forEach((l) => l());
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useSelectedModel = (): PunchModel =>
  useSyncExternalStore(modelStore.subscribe, () => selected, () => selected);
