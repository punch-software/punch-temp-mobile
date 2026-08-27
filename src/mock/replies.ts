import type { ChatRequest } from "./protocol";

/**
 * The mock model's brain: routes an incoming request to a canned-but-varied
 * markdown response. Rich enough to exercise every part of the renderer —
 * headings, lists, code, tables, quotes — the way real model output does.
 */

const pick = <T,>(arr: readonly T[], seed: number): T => arr[seed % arr.length]!;

const CODE_REPLY = `Here's a clean way to do it with a custom hook:

\`\`\`tsx
import { useEffect, useRef, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current ?? undefined);
  }, [value, delay]);

  return debounced;
}
\`\`\`

A few things worth noting:

- The cleanup function cancels the pending timeout, so only the **last** value within the window wins.
- Keep \`delay\` stable between renders — passing a new value each render restarts the timer.
- For search inputs, 250–350 ms feels responsive without hammering the network.

If you need the *leading* edge instead (fire immediately, then ignore), that's a throttle — happy to show that variant too.`;

const TABLE_REPLY = `Here's how the three approaches compare:

| Approach | Latency | Complexity | Best for |
|---|---|---|---|
| Polling | High | Low | Simple dashboards |
| SSE | Low | Medium | One-way streams (chat!) |
| WebSockets | Lowest | High | Bidirectional apps |

**My recommendation:** start with SSE. It rides on plain HTTP, reconnects are trivial with \`Last-Event-ID\`, and every proxy in the world understands it.

> Rule of thumb: reach for WebSockets only when the *client* needs to push frequently — typing indicators, cursors, multiplayer state.

Want me to sketch the server handler for the SSE version?`;

const PLAN_REPLY = `Love it — here's a plan that keeps things realistic:

### Day 1 — Arrival & the old town
- Drop bags, then walk the riverfront before sunset
- Dinner somewhere small; book **ahead** for anything with a view

### Day 2 — The big sights
1. Start early at the castle (gates open 9:00 — beat the crowds)
2. Lunch at the market hall — grab whatever's seasonal
3. Museum quarter in the afternoon, one museum *max*

### Day 3 — Slow morning, day trip
- Coffee + pastry, no agenda until noon
- Afternoon train to the coast (~40 min each way)

A packing note: layers over bulk. Evenings get chilly near the water even in summer.

Want me to tighten this around food, art, or hiking?`;

const EXPLAIN_REPLY = `Great question — the short version first, then the detail.

**The short version:** it's a trade-off between *latency* and *throughput*. Optimizing one usually taxes the other.

### What's actually happening

When a system batches work, each item waits a little so the group can travel together. That waiting is latency you chose to spend. In exchange, per-item overhead gets amortized and total throughput climbs.

- **Small batches** → snappy responses, more overhead per item
- **Big batches** → efficient pipelines, laggier feel
- **Adaptive batching** → measure the queue, resize dynamically

### A concrete example

A logging pipeline that flushes every 50 ms feels instant and survives crashes well, but pays a syscall per flush. Move to flushing every 2 s and CPU drops noticeably — until someone needs logs *now* during an incident.

> Most "performance" debates are actually disagreements about which of these two you should feel first.

The practical move: pick a latency budget you can defend, then batch as hard as that budget allows.`;

const EMAIL_REPLY = `Here's a draft you can adapt:

---

**Subject:** Quick update on the timeline

Hi Sam,

Wanted to flag this early rather than late: the integration work is running about **three days behind** the original estimate. The API changes on the partner side landed later than promised, and we lost time to their sandbox being down on Tuesday.

The good news — the risky part (auth + webhooks) is done and tested. What remains is mechanical.

**New dates:**
- Code complete: Thursday the 12th
- QA pass: Monday the 16th
- Ship: Wednesday the 18th

Happy to walk through the details on a call if useful.

Best,
Bradley

---

Want it more formal, shorter, or with a sharper ask at the end?`;

const BRAINSTORM_REPLY = `Fun one. A few directions, from safe to spicy:

**Descriptive & clean**
- Relay
- Cadence
- Northlight

**Evocative**
- Ember — warm, quick, a little dangerous
- Driftline — where things wash up and get found
- Quarry — you dig, it yields

**Weird in a good way**
- Ostrich Mode
- Tuesday Engine
- Soup & Circuits

My favorite of the bunch is **Ember** — short, ownable, and the domain story usually works out with a modifier (getember, emberhq).

Want ten more in any of these lanes?`;

const SHORT_REPLIES = [
  `Yes — that works. The only caveat: make sure the token is refreshed *before* the retry, not after, or the second attempt fails the same way.`,
  `Roughly 240 km — about a 2.5 hour drive without traffic, or 70 minutes by high-speed rail. The train wins basically always.`,
  `"Ubiquitous" is the word you want. "Omnipresent" carries a slightly grander, almost theological register.`,
  `That error means the linker found *two* copies of the same symbol. Nine times out of ten it's a dependency pinned at two versions — run a dedupe and it clears.`,
];

const GREETING_REPLIES = [
  `Hey! Good to see you. What are we working on today?`,
  `Hi there — I'm ready when you are. Code, writing, planning, or something else entirely?`,
  `Hello! What's on your mind?`,
];

const LONG_REPLY = `This deserves a proper answer, so let me build it up in layers.

## The core idea

Every interface is a conversation about *state*. The user holds a mental model; the system holds the truth; the UI's job is to keep those two in agreement without demanding attention.

The moment they diverge — a spinner that lies, a list that jumps, a keyboard that covers the thing you're typing into — the user feels it as friction, even if they can't name it.

## Why smoothness matters more than speed

Speed is a number; smoothness is a *feeling* built from many small honesties:

1. **Continuity** — things move between states instead of teleporting
2. **Stability** — content never shifts under your finger
3. **Immediacy** — the first pixel of feedback lands within one frame
4. **Interruptibility** — every animation yields to the user's next intent

A 300 ms transition that respects all four feels faster than a 100 ms one that violates one.

### The streaming case

Streamed text is the purest test. The naive version repaints in bursts and the page breathes like a fax machine. The refined version:

- buffers network chunks and reveals at a steady cadence
- accelerates *smoothly* when the buffer grows deep
- pins the scroll only while the reader is at the bottom
- never reflows completed paragraphs

\`\`\`ts
// The heart of it: adaptive reveal
const charsPerTick = clamp(backlog / 10, 1, 48);
\`\`\`

## Where teams go wrong

> They measure time-to-complete and ship the version that wins the benchmark, then wonder why it feels worse.

The metrics that predict *perceived* quality are frame-time variance, input-to-feedback latency, and layout shift — none of which show up in a load-time chart.

Happy to go deeper on any layer — the scroll mechanics and the keyboard choreography are each a rabbit hole of their own.`;

const ATTACHMENT_IMAGE_REPLY = `Nice — I can see the image you attached. A few observations:

- The composition is strong; the subject sits right on a third line
- Light is coming from the upper left, so shadows stay soft
- There's a slight color cast toward warm — easy to neutralize if you want

What would you like to do with it — edit ideas, a caption, or just my honest opinion?`;

const ATTACHMENT_FILE_REPLY = `Got your file — I've skimmed the contents.

The structure looks sound overall. Three things stood out:

1. **Section 2 buries the lede** — the strongest claim is in the middle of a paragraph
2. A few numbers appear without sources; the skeptical reader stalls there
3. The ending asks for nothing — add one concrete call to action

Want me to rewrite any section, or produce a tightened one-page version?`;

const VOICE_REPLY = `Heard you loud and clear. Transcription came through clean — here's my take:

That approach works, but flip the order: do the cheap validation *first*, then the expensive call. You'll cut the failure path from seconds to milliseconds, and the error messages get better for free.

Anything else on your mind?`;

const FALLBACK_REPLIES = [
  EXPLAIN_REPLY,
  PLAN_REPLY,
  TABLE_REPLY,
  LONG_REPLY,
  CODE_REPLY,
];

// ---------------------------------------------------------------------------
// Tool-calling demos
// ---------------------------------------------------------------------------

const WEATHER_REPLY: MockReply = {
  text: "Checked the weather in Lisbon.",
  extraThinkMs: 300,
  segments: [
    { text: "Let me check the current conditions for you.\n\n" },
    {
      tool: {
        name: "get_weather",
        args: { location: "Lisbon, Portugal", units: "metric" },
        latencyMs: 1700,
        result: {
          temperature: "24°C",
          condition: "Sunny",
          wind: "14 km/h NW",
          humidity: "52%",
          updated: "3 min ago",
        },
      },
    },
    {
      text: `Here's Lisbon right now:

- **24°C and sunny** — barely a cloud out there
- Wind at 14 km/h from the northwest
- Humidity sitting at a comfortable 52%

Genuinely great evening for the riverfront. Want the weekend forecast too?`,
    },
  ],
};

const RESEARCH_REPLY: MockReply = {
  text: "Researched list performance best practices.",
  extraThinkMs: 350,
  segments: [
    { text: "Good question — let me look at a couple of sources before I answer.\n\n" },
    {
      tool: {
        name: "web_search",
        args: { query: "react native list performance best practices 2026" },
        latencyMs: 1900,
        result: {
          results: [
            { title: "Optimizing FlatList configuration", source: "reactnative.dev" },
            { title: "A deep dive into list virtualization", source: "shopify.engineering" },
            { title: "New Architecture: list internals", source: "github.com/facebook" },
          ],
          count: 3,
        },
      },
    },
    { text: "The guidance mostly converges. One more check on the primary doc:\n\n" },
    {
      tool: {
        name: "fetch_page",
        args: { url: "https://reactnative.dev/docs/optimizing-flatlist-configuration" },
        latencyMs: 1400,
        result: { status: 200, words: 2140, readingTime: "9 min" },
      },
    },
    {
      text: `Here's the distilled answer:

1. **Memoize rows** and keep \`renderItem\` referentially stable — re-created closures defeat cell recycling
2. **Never resize content invisibly** — use \`maintainVisibleContentPosition\` so streaming or prepends don't jump the scroll
3. Tune \`windowSize\` *down* (5–10) for heavy rows; the default 21 renders far more than users see
4. Move animations to the UI thread — JS-driven layout during scroll is the classic jank source

> The recurring theme across all three sources: the fastest list is the one that re-renders nothing.

Want me to apply any of these to a specific list you're working on?`,
    },
  ],
};

const AGENT_REPLY: MockReply = {
  text: "Ran a research agent over the codebase.",
  extraThinkMs: 250,
  segments: [
    {
      text: "This is a good job for a sub-agent — I'll have it work through the codebase while we keep talking. Feel free to queue up more messages in the meantime.\n\n",
    },
    {
      agent: {
        name: "Research agent",
        task: "Audit list rendering performance across the app",
        steps: [
          { label: "Scanning repository", detail: "src/**/*.tsx — 42 files", ms: 1500 },
          { label: "Reading list components", detail: "14 components matched", ms: 1700 },
          { label: "Profiling re-render paths", detail: "3 hot paths found", ms: 1900 },
          { label: "Writing recommendations", ms: 1400 },
        ],
        summary:
          "Three wins found: memoize message rows, keep keyExtractor stable, and move scroll-linked work onto the UI thread.",
      },
    },
    {
      text: `The agent came back with a clear picture. The three changes worth making, in order of impact:

1. **Memoize the rows** — the message list re-renders every row on each store tick; a \`memo\` comparator on stable ids fixes it
2. **Stabilize \`keyExtractor\`** — a new closure per render defeats cell recycling
3. **Move scroll work off the JS thread** — the scroll-position pill currently round-trips through JS

Want me to queue a second agent to apply these, or dig into any single one first?`,
    },
  ],
};

const isWeatherIntent = (t: string) => /(weather|forecast|temperature|rain|sunny)/.test(t);
const isResearchIntent = (t: string) =>
  /(search|look up|look this up|sources|find out)/.test(t) || t === "/tools";
const isAgentIntent = (t: string) =>
  /(agent|delegate|deep research|research this|audit)/.test(t) || t === "/agent";

const HELP_REPLY = `I'm a **mocked** model — every reply here is canned so the app can be developed offline. Some prompts that show off the UI:

- \`/code\` — syntax-highlighted code blocks
- \`/table\` — markdown tables
- \`/tools\` — multi-step tool calling (search + fetch)
- \`/weather\` — a single tool call with a typed result
- \`/agent\` — a sub-agent with a live step timeline (try queueing messages while it runs)
- \`/long\` — a long structured essay (scroll behavior!)
- \`/short\` — a one-liner
- \`/slow\` — painfully slow tokens (test the stop button)
- \`/error\` — a failed response (retry flow)
- \`/offline\` — drop service for 15s (nothing is lost; watch the auto-retry)

Or just talk to me normally — mention *code*, *email*, *trip*, or *names* to steer the canned brain.`;

export type ToolSegment = {
  tool: {
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    /** How long the "tool" runs before its result lands. */
    latencyMs: number;
  };
};
export type AgentSegment = {
  agent: {
    name: string;
    task: string;
    steps: { label: string; detail?: string; ms: number }[];
    summary: string;
  };
};
export type ReplySegment = { text: string } | ToolSegment | AgentSegment;

export type MockReply = {
  text: string;
  /**
   * When present, the reply streams these segments in order (text chunks and
   * tool invocations); `text` is then only used for previews/titles.
   */
  segments?: ReplySegment[];
  /** Milliseconds before the first token (in addition to global latency). */
  extraThinkMs?: number;
  /** Multiplier on token cadence — bigger is slower. */
  paceMultiplier?: number;
  /** Simulate a mid-stream server failure after this many characters. */
  failAfterChars?: number;
  /** After this reply finishes, drop connectivity for this long (demo). */
  simulateOfflineMs?: number;
};

export const routeReply = (request: ChatRequest, seed: number): MockReply => {
  const last = request.messages.filter((m) => m.role === "user").at(-1);
  const text = (last?.text ?? "").trim();
  const lower = text.toLowerCase();
  const attachments = last?.attachments ?? [];

  // Demo commands
  if (lower === "/help") return { text: HELP_REPLY };
  if (lower === "/tools") return RESEARCH_REPLY;
  if (lower === "/weather") return WEATHER_REPLY;
  if (lower === "/agent") return AGENT_REPLY;
  if (lower === "/offline")
    return {
      text: `Dropping your connection for **15 seconds**, starting… now.

Send a message during the blackout and watch:

1. The **"You're offline"** pill appears under the header
2. Your message posts instantly and is **saved to disk** — nothing is lost
3. The reply fails softly with a *"I'll retry when you're back"* card
4. Anything you queue holds as a chip instead of failing
5. The moment service returns, everything retries and flushes **automatically**

Go ahead — send something.`,
      simulateOfflineMs: 15_000,
    };
  if (lower === "/code") return { text: CODE_REPLY };
  if (lower === "/table") return { text: TABLE_REPLY };
  if (lower === "/long") return { text: LONG_REPLY, extraThinkMs: 400 };
  if (lower === "/short") return { text: pick(SHORT_REPLIES, seed) };
  if (lower === "/slow")
    return { text: EXPLAIN_REPLY, extraThinkMs: 1200, paceMultiplier: 6 };
  if (lower === "/error")
    return { text: LONG_REPLY, failAfterChars: 220 };

  if (attachments.some((a) => a.type === "image"))
    return { text: ATTACHMENT_IMAGE_REPLY, extraThinkMs: 700 };
  if (attachments.length > 0)
    return { text: ATTACHMENT_FILE_REPLY, extraThinkMs: 900 };

  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/.test(lower) && text.length < 24)
    return { text: pick(GREETING_REPLIES, seed) };

  if (/(voice message)/.test(lower)) return { text: VOICE_REPLY };
  if (isWeatherIntent(lower)) return WEATHER_REPLY;
  if (isAgentIntent(lower)) return AGENT_REPLY;
  if (isResearchIntent(lower)) return RESEARCH_REPLY;
  if (/(code|function|react|hook|typescript|bug|debounc)/.test(lower))
    return { text: CODE_REPLY };
  if (/(email|draft|message to|write to)/.test(lower)) return { text: EMAIL_REPLY };
  if (/(trip|travel|itinerary|visit|weekend|plan)/.test(lower)) return { text: PLAN_REPLY };
  if (/(name|brainstorm|ideas|call it)/.test(lower)) return { text: BRAINSTORM_REPLY };
  if (/(compare|vs|versus|difference|which)/.test(lower)) return { text: TABLE_REPLY };
  if (/\?$/.test(text) && text.length < 80) return { text: pick(SHORT_REPLIES, seed) };

  return { text: pick(FALLBACK_REPLIES, seed) };
};

/** Deterministic-ish title from the first user message, like server-side title models do. */
export const deriveTitle = (firstUserText: string): string => {
  const cleaned = firstUserText.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  if (cleaned.startsWith("/")) {
    const cmd = cleaned.slice(1).split(" ")[0] ?? "demo";
    return `${cmd[0]?.toUpperCase()}${cmd.slice(1)} demo`;
  }
  const words = cleaned.split(" ").slice(0, 6).join(" ");
  const title = words.length < cleaned.length ? `${words}…` : words;
  return title[0] ? title[0].toUpperCase() + title.slice(1) : "New chat";
};

/** Mock voice transcriptions, used by the dictation flow. */
export const MOCK_TRANSCRIPTIONS = [
  "Can you help me plan a three day trip along the coast",
  "Write a short email telling the team the deadline moved to Thursday",
  "What's the difference between debouncing and throttling",
  "Brainstorm some names for a weekend side project",
];
