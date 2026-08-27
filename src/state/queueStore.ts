import { useSyncExternalStore } from "react";

import { generateId } from "@/lib/id";

/**
 * Message queue: what the user sends while a run (or sub-agent) is still
 * working. Items display as chips above the composer and flush to the
 * thread sequentially as each run completes.
 */
export type QueuedMessage = { id: string; text: string };

type Listener = () => void;

let items: QueuedMessage[] = [];
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export const queueStore = {
  get items() {
    return items;
  },
  add(text: string) {
    items = [...items, { id: generateId("q"), text }];
    emit();
  },
  remove(id: string) {
    items = items.filter((i) => i.id !== id);
    emit();
  },
  shift(): QueuedMessage | undefined {
    const [first, ...rest] = items;
    if (first) {
      items = rest;
      emit();
    }
    return first;
  },
  /** Put a shifted item back at the front (flush raced with a new run). */
  requeue(item: QueuedMessage) {
    items = [item, ...items];
    emit();
  },
  clear() {
    if (items.length === 0) return;
    items = [];
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useMessageQueue = (): QueuedMessage[] =>
  useSyncExternalStore(queueStore.subscribe, () => items, () => items);
