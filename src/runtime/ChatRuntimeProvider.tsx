import {
  AssistantRuntimeProvider,
  useAui,
  useAuiState,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
} from "@assistant-ui/react-native";
import { createAssistantStream } from "assistant-stream";
import { useGlobalSearchParams } from "expo-router";
import { useEffect, useMemo, type PropsWithChildren } from "react";

import { haptics } from "@/lib/haptics";
import { generateId } from "@/lib/id";
import { isAbortError, isOfflineError, mockServer } from "@/mock/server";
import type { ChatRequest } from "@/mock/protocol";
import { modelStore } from "@/state/modelStore";
import { netStore } from "@/state/netStore";
import { createSmoother } from "./smoothStream";

// ---------------------------------------------------------------------------
// Chat model adapter: mock transport + client-side smoothing
// ---------------------------------------------------------------------------

const messageText = (message: ThreadMessage): string =>
  message.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");

const toWireRequest = (messages: readonly ThreadMessage[]): ChatRequest => ({
  threadId: null,
  model: modelStore.selected.id,
  messages: messages.map((m) => ({
    role: m.role,
    text: messageText(m),
    attachments:
      m.role === "user"
        ? m.attachments.map((a) => ({
            id: a.id,
            type: a.type,
            name: a.name,
            contentType: a.contentType ?? undefined,
          }))
        : undefined,
  })),
});

type AgentPartState = {
  kind: "agent";
  id: string;
  name: string;
  task: string;
  status: "running" | "done";
  steps: { label: string; detail?: string; done: boolean }[];
  summary?: string;
};

type StreamedPart =
  | { kind: "text"; smoother: ReturnType<typeof createSmoother>; visible: string }
  | {
      kind: "tool";
      toolCallId: string;
      toolName: string;
      argsText: string;
      args: Record<string, unknown>;
      result?: unknown;
    }
  | AgentPartState;

type ThreadAssistantContent = NonNullable<ChatModelRunResult["content"]>;

const buildContent = (parts: StreamedPart[]): ThreadAssistantContent =>
  parts
    .map((p) => {
      if (p.kind === "text") {
        return p.visible ? ({ type: "text", text: p.visible } as const) : null;
      }
      if (p.kind === "agent") {
        return {
          type: "data",
          name: "agent",
          data: {
            id: p.id,
            name: p.name,
            task: p.task,
            status: p.status,
            steps: p.steps.map((s) => ({ ...s })),
            ...(p.summary !== undefined ? { summary: p.summary } : {}),
          },
        } as const;
      }
      return {
        type: "tool-call",
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        argsText: p.argsText,
        args: p.args as never,
        ...(p.result !== undefined ? { result: p.result } : {}),
      } as const;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

const chatModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    type QueueEvent =
      | { type: "delta"; text: string }
      | { type: "tool-start"; id: string; name: string; argsText: string; args: Record<string, unknown> }
      | { type: "tool-result"; id: string; result: unknown }
      | { type: "agent-start"; id: string; name: string; task: string }
      | { type: "agent-step"; id: string; label: string; detail?: string }
      | { type: "agent-done"; id: string; summary: string };

    const parts: StreamedPart[] = [];
    const queue: QueueEvent[] = [];
    let transportDone = false;
    let transportError: unknown = null;

    // Consume the mock network stream in the background while the reveal
    // loop below paces what the UI sees.
    const consume = (async () => {
      try {
        const stream = mockServer.streamChat(
          toWireRequest(messages),
          abortSignal,
          modelStore.selected.speed,
        );
        for await (const event of stream) {
          if (event.type === "done") break;
          if (event.type === "error") continue;
          queue.push(event);
        }
      } catch (e) {
        if (!isAbortError(e)) {
          transportError = e;
        }
      } finally {
        transportDone = true;
      }
    })();

    const tail = () => parts[parts.length - 1];
    const tailDraining = () => {
      const t = tail();
      return t?.kind === "text" && t.smoother.hasNew;
    };

    const pushDelta = (text: string) => {
      const t = tail();
      if (t?.kind === "text") {
        t.smoother.push(text);
      } else {
        const smoother = createSmoother();
        smoother.push(text);
        parts.push({ kind: "text", smoother, visible: "" });
      }
    };

    /**
     * Apply queued events in order. Deltas always feed the current text
     * segment (the smoother paces reveal); tool results resolve in place;
     * only a *new* tool placement waits for the running text to finish.
     */
    const findAgent = (id: string): AgentPartState | undefined =>
      parts.find((p): p is AgentPartState => p.kind === "agent" && p.id === id);

    const applyResolution = (ev: QueueEvent): boolean => {
      switch (ev.type) {
        case "tool-result": {
          const target = parts.find(
            (p) => p.kind === "tool" && p.toolCallId === ev.id,
          );
          if (target && target.kind === "tool") {
            target.result = ev.result;
            return true;
          }
          return false;
        }
        case "agent-step": {
          const agent = findAgent(ev.id);
          if (!agent) return false;
          agent.steps = agent.steps.map((s) => ({ ...s, done: true }));
          agent.steps.push({ label: ev.label, detail: ev.detail, done: false });
          return true;
        }
        case "agent-done": {
          const agent = findAgent(ev.id);
          if (!agent) return false;
          agent.steps = agent.steps.map((s) => ({ ...s, done: true }));
          agent.status = "done";
          agent.summary = ev.summary;
          return true;
        }
        default:
          return false;
      }
    };

    const placePart = (ev: QueueEvent) => {
      if (ev.type === "tool-start") {
        parts.push({
          kind: "tool",
          toolCallId: ev.id,
          toolName: ev.name,
          argsText: ev.argsText,
          args: ev.args,
        });
      } else if (ev.type === "agent-start") {
        parts.push({
          kind: "agent",
          id: ev.id,
          name: ev.name,
          task: ev.task,
          status: "running",
          steps: [],
        });
      }
    };

    const pump = () => {
      let changed = false;
      while (queue.length > 0) {
        const ev = queue[0]!;
        if (ev.type === "delta") {
          queue.shift();
          pushDelta(ev.text);
          changed = true;
          continue;
        }
        if (ev.type === "tool-result" || ev.type === "agent-step" || ev.type === "agent-done") {
          queue.shift();
          if (applyResolution(ev)) changed = true;
          continue;
        }
        // tool-start / agent-start: wait for the preceding text to reveal.
        if (tailDraining()) break;
        queue.shift();
        placePart(ev);
        changed = true;
      }
      return changed;
    };

    const flushAll = () => {
      // Drain any remaining queued events instantly.
      while (queue.length > 0) {
        const ev = queue.shift()!;
        if (ev.type === "delta") pushDelta(ev.text);
        else if (ev.type === "tool-start" || ev.type === "agent-start") placePart(ev);
        else applyResolution(ev);
      }
      for (const p of parts) {
        if (p.kind === "text") p.visible = p.smoother.flush();
      }
    };

    let startedStreaming = false;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    while (true) {
      if (abortSignal.aborted) {
        flushAll();
        const content = buildContent(parts);
        if (content.length > 0) yield { content };
        break;
      }
      if (transportError) break;

      let changed = pump();
      const t = tail();
      if (t?.kind === "text" && t.smoother.hasNew) {
        t.visible = t.smoother.tick();
        changed = true;
      }

      if (changed) {
        if (!startedStreaming) {
          startedStreaming = true;
          haptics.streamStart();
        }
        yield { content: buildContent(parts) };
      }

      if (transportDone && queue.length === 0 && !tailDraining()) break;
      await sleep(30);
    }

    await consume;

    if (transportError) {
      flushAll();
      const offline = isOfflineError(transportError);
      const result: ChatModelRunResult = {
        content: buildContent(parts),
        status: {
          type: "incomplete",
          reason: "error",
          error: offline
            ? "offline"
            : transportError instanceof Error
              ? transportError.message
              : "Something went wrong.",
        },
      };
      haptics.error();
      yield result;
      return;
    }

    if (!abortSignal.aborted) {
      flushAll();
      const content = buildContent(parts);
      if (content.length > 0) {
        yield { content, status: { type: "complete", reason: "stop" } };
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Per-thread history persistence (injected via the thread list provider)
// ---------------------------------------------------------------------------

type AuiClient = ReturnType<typeof useAui>;

const reviveDates = (message: Record<string, unknown>): Record<string, unknown> => ({
  ...message,
  createdAt: new Date(message.createdAt as string),
});

const snippetOf = (message: Record<string, unknown>): string | undefined => {
  const content = message.content as { type: string; text?: string }[] | undefined;
  const text = content
    ?.filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join(" ")
    .trim();
  const role = message.role as string;
  if (!text) return undefined;
  return role === "user" ? `You: ${text}` : text;
};

class MockHistoryAdapter implements ThreadHistoryAdapter {
  constructor(private aui: AuiClient) {}

  async load() {
    const remoteId = this.aui.threadListItem().getState().remoteId;
    if (!remoteId) return { messages: [] };
    const repo = await mockServer.loadRepository(remoteId);
    return {
      headId: repo.headId ?? undefined,
      messages: repo.messages.map((m) => ({
        parentId: m.parentId,
        message: reviveDates(m.message) as unknown as ThreadMessage,
      })),
    };
  }

  async append(item: { parentId: string | null; message: ThreadMessage }) {
    const { remoteId } = await this.aui.threadListItem().initialize();
    await mockServer.appendToRepository(
      remoteId,
      {
        parentId: item.parentId,
        message: JSON.parse(JSON.stringify(item.message)) as Record<string, unknown>,
      },
      snippetOf(item.message as unknown as Record<string, unknown>),
    );
  }
}

// ---------------------------------------------------------------------------
// Thread list adapter over the mock server
// ---------------------------------------------------------------------------

const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const threads = await mockServer.listThreads();
    return {
      threads: threads.map((t) => ({
        remoteId: t.remoteId,
        externalId: undefined,
        status: t.status,
        title: t.title,
      })),
    };
  },
  async initialize() {
    // Real backends mint their own ids; the mock does too.
    const remoteId = generateId("thr");
    await mockServer.createThread(remoteId);
    return { remoteId, externalId: undefined };
  },
  async rename(remoteId, newTitle) {
    await mockServer.updateThread(remoteId, { title: newTitle });
  },
  async archive(remoteId) {
    await mockServer.updateThread(remoteId, { status: "archived" });
  },
  async unarchive(remoteId) {
    await mockServer.updateThread(remoteId, { status: "regular" });
  },
  async delete(remoteId) {
    await mockServer.deleteThread(remoteId);
  },
  async fetch(threadId) {
    const meta = await mockServer.fetchThread(threadId);
    return {
      remoteId: meta.remoteId,
      externalId: undefined,
      status: meta.status,
      title: meta.title,
    };
  },
  // The runtime auto-calls this after a new thread's first run completes.
  async generateTitle(remoteId, messages) {
    const firstUser = messages.find((m) => m.role === "user");
    const text = firstUser ? messageText(firstUser) : "";
    const title = await mockServer.generateTitle(text || "New chat");
    await mockServer.updateThread(remoteId, { title });
    return createAssistantStream((controller) => {
      controller.appendText(title);
    });
  },
};

// ---------------------------------------------------------------------------
// Cross-cutting effects: auto title, offline auto-retry
// ---------------------------------------------------------------------------

const RuntimeEffects = () => {
  const aui = useAui();

  // When connectivity returns, retry the last offline-failed generation.
  useEffect(() => {
    return netStore.subscribe(() => {
      if (!netStore.isOnline) return;
      const thread = aui.thread();
      const messages = thread.getState().messages;
      const last = messages.at(-1);
      if (
        last &&
        last.role === "assistant" &&
        last.status.type === "incomplete" &&
        last.status.reason === "error" &&
        last.status.error === "offline"
      ) {
        thread.message({ id: last.id }).reload();
      }
    });
  }, [aui]);

  return null;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ChatRuntimeProvider = ({ children }: PropsWithChildren) => {
  const params = useGlobalSearchParams<{ id?: string }>();
  const routeThreadId =
    typeof params.id === "string" && params.id !== "new" ? params.id : undefined;

  const runtime = useRemoteThreadListRuntime({
    // NOTE: adapters are passed here rather than via the thread list
    // adapter's `unstable_Provider` — core 0.1.17 mounts the runtime hook
    // outside that provider, so context-injected adapters never reach it.
    // This hook runs under ThreadListItemRuntimeProvider, so `useAui()`
    // still resolves the per-thread scope the history adapter needs.
    runtimeHook: function RuntimeHook() {
      const aui = useAui();
      const adapters = useMemo(
        () => ({
          history: new MockHistoryAdapter(aui),
          // Feedback lands in message metadata; the mock just accepts it.
          feedback: { submit: () => {} },
        }),
        [aui],
      );
      return useLocalRuntime(chatModelAdapter, { adapters });
    },
    adapter: threadListAdapter,
    threadId: routeThreadId,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RuntimeEffects />
      {children}
    </AssistantRuntimeProvider>
  );
};
