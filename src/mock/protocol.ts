import { z } from "zod";

/**
 * The "wire" protocol for the mock backend. Everything the app persists or
 * streams goes through these schemas, exactly as it would with a real API —
 * so swapping the mock for a live server later is a transport change only.
 */

export const WireAttachmentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  contentType: z.string().optional(),
});

export const ChatRequestSchema = z.object({
  threadId: z.string().nullable(),
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      text: z.string(),
      attachments: z.array(WireAttachmentSchema).optional(),
    }),
  ),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({
    type: z.literal("tool-start"),
    id: z.string(),
    name: z.string(),
    argsText: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("tool-result"),
    id: z.string(),
    result: z.unknown(),
  }),
  z.object({
    type: z.literal("agent-start"),
    id: z.string(),
    name: z.string(),
    task: z.string(),
  }),
  z.object({
    type: z.literal("agent-step"),
    id: z.string(),
    label: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal("agent-done"),
    id: z.string(),
    summary: z.string(),
  }),
  z.object({ type: z.literal("done") }),
  z.object({
    type: z.literal("error"),
    code: z.enum(["offline", "server", "aborted"]),
    message: z.string(),
  }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;

/** The shape rendered by AgentCard, streamed as a `data` message part. */
export const AgentDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  task: z.string(),
  status: z.enum(["running", "done"]),
  steps: z.array(
    z.object({
      label: z.string(),
      detail: z.string().optional(),
      done: z.boolean(),
    }),
  ),
  summary: z.string().optional(),
});
export type AgentData = z.infer<typeof AgentDataSchema>;

export const ThreadMetaSchema = z.object({
  remoteId: z.string(),
  title: z.string().optional(),
  status: z.enum(["regular", "archived"]),
  updatedAt: z.string(),
  snippet: z.string().optional(),
});
export type ThreadMeta = z.infer<typeof ThreadMetaSchema>;

export const ThreadIndexSchema = z.object({
  version: z.literal(1),
  threads: z.array(ThreadMetaSchema),
});
export type ThreadIndex = z.infer<typeof ThreadIndexSchema>;

/** Persisted message repositories are stored as opaque JSON, validated loosely. */
export const StoredRepositorySchema = z.object({
  headId: z.string().nullish(),
  messages: z.array(
    z.object({
      parentId: z.string().nullable(),
      message: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type StoredRepository = z.infer<typeof StoredRepositorySchema>;
