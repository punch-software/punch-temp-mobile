# Punch — mobile chat UX lab

An Expo app for iterating on mobile chat UX/UI until it matches the
smoothness of the ChatGPT and Claude apps. **Everything server-side is
mocked** — streaming, threads, titles, auth — so the app runs fully offline
and the entire focus is interaction quality.

## Run it

```bash
npm install
npx expo run:ios        # dev client build (keyboard-controller needs native code; Expo Go won't work)
```

Requires Xcode + CocoaPods (`pod install` runs via prebuild; needs a UTF-8
locale: `export LANG=en_US.UTF-8`).

## What's here

| Area | Behavior |
|---|---|
| Streaming | Mock server emits bursty word chunks; a client-side smoother (`src/runtime/smoothStream.ts`) reveals characters at an adaptive ~33 ms cadence — the ChatGPT typewriter feel, including smooth catch-up. |
| Markdown | In-repo streaming-tolerant renderer (headings, lists, fenced code with copy, tables, quotes). Completed blocks are memoized so token ticks re-render only the growing block. |
| Scroll | Inverted list + `maintainVisibleContentPosition`: pinned at the bottom while streaming, stable when reading history, scroll-to-bottom pill. |
| Keyboard | `react-native-keyboard-controller` shared values drive composer translation and list clearance on the UI thread — including iOS interactive dismissal. |
| Composer | Growing input, morphing mic/send/stop button, attachment previews, per-thread drafts persisted to disk. |
| Attachments | Photo library / camera / files via a springy popover; images render in bubbles with `expo-image`. |
| Voice-first | The composer rests as a big centered mic (ChatGPT-voice style) with attachment + keyboard toggles flanking it. Keyboard sessions end back at the mic surface via the chevron-down next to the mic, swipe-down/background-tap keyboard dismissal (empty composer), or sending. Long-press the keyboard toggle *or* the composer mic for input preferences (default surface, toggle side). Dictation shows a live metering waveform (`expo-audio`), timer, cancel/accept, mocked transcription into the composer. During streaming the center button morphs into stop. |
| Tool calls | `tool-call` message parts stream through the runtime and render as chips — spinner while running, tap to expand request/result payloads (`/tools`, `/weather`). |
| Sub-agents | Agent cards with a live step timeline (streamed as `data` parts), status pill, and handed-back summary (`/agent`). |
| Queueing | Sending while a run/agent is active queues chips above the composer; the queue flushes sequentially as runs complete. Deep-link demo: `?prompt=/agent&then=next message`. |
| Messages | Long-press context menus, copy, select-text sheet, edit-and-resend with branch picker (‹ 2/3 ›), regenerate, feedback, haptics throughout. |
| Threads | Home screen with greeting, search, previews (react-query over the mock server), rename/archive/delete; auto-generated titles after the first exchange. |
| Offline | NetInfo-driven banner; sends fail with a retry card and auto-retry on reconnect; drafts survive restarts. |
| Errors | `/error` simulates a mid-stream failure; `/slow` a lethargic model (test the stop button); `/help` lists all demo commands. |

## Architecture

```
app/                     expo-router screens (home, chat/[id])
src/runtime/             assistant-ui runtime composition
  ChatRuntimeProvider    local runtime + remote thread list + history adapters
  smoothStream           adaptive streaming reveal
src/mock/                the "server": zod protocol, canned replies, FS persistence,
                         latency + offline simulation, SecureStore session
src/components/chat/     message list, composer, voice, header, banners
src/components/markdown/ streaming markdown renderer
src/markdown/            parser (no deps)
```

State flows through `@assistant-ui/react-native`'s runtime (`useAuiState` /
`useAui`); the message list is custom (inverted) but built on the package's
public `MessageByIndexProvider`. See `DEPENDENCY-NOTES.md` for the few
required dependency additions.

## Demo commands

Type `/help`, `/code`, `/table`, `/long`, `/short`, `/slow`, `/error` — or
just talk; the canned brain routes on keywords (code, email, trip, names…).
Deep links work too: `punch://chat/new?prompt=/table`.
