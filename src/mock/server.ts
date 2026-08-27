import { Directory, File as FsFile, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

import { generateId } from "@/lib/id";
import { netStore } from "@/state/netStore";
import {
  ChatRequestSchema,
  StoredRepositorySchema,
  ThreadIndexSchema,
  type ChatRequest,
  type StoredRepository,
  type StreamEvent,
  type ThreadIndex,
  type ThreadMeta,
} from "./protocol";
import { deriveTitle, routeReply } from "./replies";

/**
 * The mock backend. Persists to the app's document directory and simulates
 * a real chat API: network latency, streaming token cadence, offline
 * failures, and an auth token in SecureStore. All UI-facing behavior flows
 * through here so the transport can later be swapped for a live server.
 */

const SESSION_KEY = "punch.session.token";

class OfflineError extends Error {
  code = "offline" as const;
  constructor() {
    super("You're offline. This message will fail until connection returns.");
  }
}
class ServerError extends Error {
  code = "server" as const;
  constructor() {
    super("Something went wrong on our end. Please try again.");
  }
}
export const isOfflineError = (e: unknown): boolean =>
  e instanceof Error && (e as { code?: string }).code === "offline";

const abortError = () => {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
};
export const isAbortError = (e: unknown): boolean =>
  e instanceof Error && e.name === "AbortError";

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const jitter = (base: number, spread: number) => base + Math.random() * spread;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const root = new Directory(Paths.document, "punch");
const threadsDir = new Directory(root, "threads");
export const attachmentsDir = new Directory(root, "attachments");

const ensureDirs = () => {
  for (const dir of [root, threadsDir, attachmentsDir]) {
    try {
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    } catch {
      // best effort; reads fall back to empty state
    }
  }
};

const readJson = <T,>(file: FsFile, parse: (raw: unknown) => T, fallback: T): T => {
  try {
    if (!file.exists) return fallback;
    return parse(JSON.parse(file.textSync()));
  } catch {
    return fallback;
  }
};

const writeJson = (file: FsFile, value: unknown) => {
  try {
    file.write(JSON.stringify(value));
  } catch (e) {
    console.warn("[mock-server] write failed", e);
  }
};

const indexFile = () => new FsFile(root, "index.json");
const threadFile = (remoteId: string) => new FsFile(threadsDir, `${remoteId}.json`);
const draftsFile = () => new FsFile(root, "drafts.json");

const loadIndex = (): ThreadIndex =>
  readJson(indexFile(), (raw) => ThreadIndexSchema.parse(raw), { version: 1, threads: [] });

const saveIndex = (index: ThreadIndex) => writeJson(indexFile(), index);

// ---------------------------------------------------------------------------
// Session (mock auth)
// ---------------------------------------------------------------------------

let sessionToken: string | null = null;

export const ensureSession = async (): Promise<string> => {
  if (sessionToken) return sessionToken;
  try {
    let token = await SecureStore.getItemAsync(SESSION_KEY);
    if (!token) {
      token = `punch_${generateId("tok")}`;
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
    sessionToken = token;
  } catch {
    sessionToken = "punch_ephemeral";
  }
  return sessionToken;
};

const requireSession = async () => {
  await ensureSession();
  ensureDirs();
};

// ---------------------------------------------------------------------------
// Thread API
// ---------------------------------------------------------------------------

export const mockServer = {
  async listThreads(): Promise<ThreadMeta[]> {
    await requireSession();
    await sleep(jitter(120, 240));
    const index = loadIndex();
    return [...index.threads].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  async createThread(remoteId: string): Promise<ThreadMeta> {
    await requireSession();
    await sleep(jitter(40, 80));
    const index = loadIndex();
    let meta = index.threads.find((t) => t.remoteId === remoteId);
    if (!meta) {
      meta = { remoteId, status: "regular", updatedAt: new Date().toISOString() };
      index.threads.unshift(meta);
      saveIndex(index);
    }
    return meta;
  },

  async fetchThread(remoteId: string): Promise<ThreadMeta> {
    await requireSession();
    const meta = loadIndex().threads.find((t) => t.remoteId === remoteId);
    if (!meta) throw new Error("Thread not found");
    return meta;
  },

  async updateThread(remoteId: string, patch: Partial<ThreadMeta>): Promise<void> {
    await requireSession();
    await sleep(jitter(30, 60));
    const index = loadIndex();
    const meta = index.threads.find((t) => t.remoteId === remoteId);
    if (!meta) return;
    Object.assign(meta, patch);
    saveIndex(index);
  },

  async deleteThread(remoteId: string): Promise<void> {
    await requireSession();
    await sleep(jitter(60, 120));
    const index = loadIndex();
    index.threads = index.threads.filter((t) => t.remoteId !== remoteId);
    saveIndex(index);
    try {
      const f = threadFile(remoteId);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  },

  async loadRepository(remoteId: string): Promise<StoredRepository> {
    await requireSession();
    return readJson(threadFile(remoteId), (raw) => StoredRepositorySchema.parse(raw), {
      headId: null,
      messages: [],
    });
  },

  async appendToRepository(
    remoteId: string,
    item: { parentId: string | null; message: Record<string, unknown> },
    snippet: string | undefined,
  ): Promise<void> {
    await requireSession();
    const file = threadFile(remoteId);
    const repo = readJson(file, (raw) => StoredRepositorySchema.parse(raw), {
      headId: null,
      messages: [],
    });
    const id = (item.message as { id?: string }).id;
    const existing = repo.messages.findIndex(
      (m) => (m.message as { id?: string }).id === id,
    );
    if (existing >= 0) repo.messages[existing] = item;
    else repo.messages.push(item);
    repo.headId = id ?? null;
    writeJson(file, repo);

    const index = loadIndex();
    const meta = index.threads.find((t) => t.remoteId === remoteId);
    if (meta) {
      meta.updatedAt = new Date().toISOString();
      if (snippet) meta.snippet = snippet.slice(0, 140);
      saveIndex(index);
    }
  },

  /**
   * The streaming chat endpoint. Emits word-ish chunks with realistic
   * cadence: a think delay before the first token, bursty deltas after.
   */
  async *streamChat(
    rawRequest: ChatRequest,
    signal: AbortSignal,
    speed: number,
  ): AsyncGenerator<StreamEvent, void> {
    await requireSession();
    const request = ChatRequestSchema.parse(rawRequest);
    if (!netStore.isOnline) throw new OfflineError();

    const seed = Math.floor(Math.random() * 1024);
    const reply = routeReply(request, seed);

    // Time to first token.
    await sleep(jitter(450, 650) + (reply.extraThinkMs ?? 0), signal);
    if (!netStore.isOnline) throw new OfflineError();

    const pace = (reply.paceMultiplier ?? 1) / Math.max(0.1, speed);
    const segments = reply.segments ?? [{ text: reply.text }];
    let emitted = 0;
    let toolCounter = 0;

    for (const segment of segments) {
      if (signal.aborted) return;

      if ("tool" in segment) {
        const id = `call_${Date.now().toString(36)}_${toolCounter++}`;
        yield {
          type: "tool-start",
          id,
          name: segment.tool.name,
          argsText: JSON.stringify(segment.tool.args, null, 2),
          args: segment.tool.args,
        };
        await sleep(segment.tool.latencyMs / Math.max(0.5, speed), signal);
        if (!netStore.isOnline) throw new OfflineError();
        yield { type: "tool-result", id, result: segment.tool.result };
        // A beat before the model "continues typing".
        await sleep(jitter(260, 240), signal);
        continue;
      }

      if ("agent" in segment) {
        const id = `agent_${Date.now().toString(36)}_${toolCounter++}`;
        yield { type: "agent-start", id, name: segment.agent.name, task: segment.agent.task };
        await sleep(jitter(350, 250), signal);
        for (const step of segment.agent.steps) {
          if (signal.aborted) return;
          yield { type: "agent-step", id, label: step.label, detail: step.detail };
          await sleep(step.ms / Math.max(0.5, speed), signal);
          if (!netStore.isOnline) throw new OfflineError();
        }
        yield { type: "agent-done", id, summary: segment.agent.summary };
        await sleep(jitter(300, 260), signal);
        continue;
      }

      // Word-ish chunks with trailing whitespace attached (no lookbehind — Hermes).
      const words = segment.text.match(/\S+\s*|\s+/g) ?? [segment.text];
      let i = 0;
      while (i < words.length) {
        if (signal.aborted) return;
        // Emit 1-3 words per network chunk, like real token batching.
        const take = 1 + Math.floor(Math.random() * 3);
        const chunk = words.slice(i, i + take).join("");
        i += take;
        emitted += chunk.length;
        yield { type: "delta", text: chunk };

        if (reply.failAfterChars && emitted >= reply.failAfterChars) {
          await sleep(jitter(250, 200), signal);
          throw new ServerError();
        }
        if (!netStore.isOnline) throw new OfflineError();
        await sleep(jitter(24, 70) * pace, signal);
      }
    }
    // Demo hook: /offline drops connectivity after this reply lands.
    if (reply.simulateOfflineMs) netStore.simulateOffline(reply.simulateOfflineMs);
    yield { type: "done" };
  },

  async generateTitle(firstUserText: string): Promise<string> {
    await requireSession();
    await sleep(jitter(350, 300));
    return deriveTitle(firstUserText);
  },

  // ------------------------------------------------------------------
  // Drafts (outbox-adjacent): composer text survives app restarts.
  // ------------------------------------------------------------------

  loadDrafts(): Record<string, string> {
    ensureDirs();
    return readJson(
      draftsFile(),
      (raw) => (typeof raw === "object" && raw ? (raw as Record<string, string>) : {}),
      {},
    );
  },

  saveDraft(threadKey: string, text: string) {
    ensureDirs();
    const drafts = this.loadDrafts();
    if (text) drafts[threadKey] = text;
    else delete drafts[threadKey];
    writeJson(draftsFile(), drafts);
  },
};
