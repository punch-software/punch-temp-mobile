import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";

/**
 * Tiny connectivity store over NetInfo. The mock server consults this to
 * simulate real offline failures, and the UI uses it for the offline banner
 * and the reconnect auto-retry behavior.
 */
type Listener = () => void;

let realOnline = true;
let simulatedOffline = false;
let isOnline = true;
let simulationTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const recompute = () => {
  const next = realOnline && !simulatedOffline;
  if (next !== isOnline) {
    isOnline = next;
    listeners.forEach((l) => l());
  }
};

NetInfo.addEventListener((state) => {
  // `isInternetReachable` can be null while probing; treat null as online.
  realOnline = state.isConnected !== false && state.isInternetReachable !== false;
  recompute();
});

export const netStore = {
  get isOnline() {
    return isOnline;
  },
  /**
   * Demo/lab tool: pretend the device lost service for `ms`, then restore.
   * Everything downstream (banner, failed sends, held queue, auto-retry)
   * reacts exactly as it would to a real drop.
   */
  simulateOffline(ms = 15_000) {
    if (simulationTimer) clearTimeout(simulationTimer);
    simulatedOffline = true;
    recompute();
    simulationTimer = setTimeout(() => {
      simulationTimer = null;
      simulatedOffline = false;
      recompute();
    }, ms);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useIsOnline = (): boolean =>
  useSyncExternalStore(netStore.subscribe, () => isOnline, () => true);
