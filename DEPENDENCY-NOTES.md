# Dependency notes

The pinned dependency list from the project brief is respected. Everything
below documents the additions that were **required** to make that list work,
and one version pin inside the assistant-ui family. No pinned dependency was
removed or upgraded.

## Required additions (platform companions, not framework choices)

| Package | Why it had to be added |
|---|---|
| `expo-constants`, `expo-linking`, `expo-status-bar` | Hard requirements of `expo-router` v6 (router imports them at runtime). These are Expo SDK companions, versioned by SDK 54. |
| `react-dom@19.1.0` (exact) | `expo-router` declares an optional peer on `react-dom`; npm insists on resolving it, and the latest (19.2.x) conflicts with the pinned `react@19.1.0`. Pinned exactly to match React, same as Expo's own SDK 54 template. Not shipped in the native bundle. |
| `assistant-cloud@^0.1.27` | Optional peer of `@assistant-ui/core`, but core's ESM output imports it **unconditionally**, so Metro cannot bundle without it. It is the assistant-ui vendor's own package (depends only on `assistant-stream`, already in the tree). Unused at runtime — we run a local/mock runtime. |
| `assistant-stream@^0.3.39` | Already in the tree (dependency of the RN package). Declared directly because `RemoteThreadListAdapter.generateTitle` **must** return an `AssistantStream` — the runtime auto-calls it after a new thread's first run and consumes the stream for the title. `createAssistantStream` is the only sanctioned way to construct one. |
| `babel-preset-expo` (devDependency) | Required top-level whenever a project has a custom `babel.config.js` (needed for NativeWind's JSX transform + the worklets plugin). Build-time only. |

## Version pin via `overrides`

```json
"overrides": { "@assistant-ui/store": "0.2.13" }
```

`@assistant-ui/react-native@0.1.6` depends on `@assistant-ui/store@^0.2.3`.
npm resolves that to `0.2.22` today, but `0.2.14+` requires
`@assistant-ui/tap@^0.6…^0.9`, while `@assistant-ui/core@0.1.17` (also pulled
by the RN package) requires `tap@^0.5`. The families genuinely conflict at
"latest". `0.2.13` is the newest store release still on `tap ^0.5.x` and is
the version contemporary with the 0.1.6 RN release. Without this pin,
`npm install` fails ERESOLVE on any subsequent install.

## Notes on the pinned list itself

- `@assistant-ui/react-native@0.1.6` is early but genuinely usable: this app
  runs its full runtime (local runtime + remote thread list + history
  adapters + edit/branching). UI primitives are intentionally *not* used for
  the message list — the package's `ThreadMessages` renders a non-inverted
  `FlatList`, which cannot deliver frontier-grade streaming scroll behavior.
  We build our own inverted list on the exported `MessageByIndexProvider` +
  `useAuiState` state layer instead (public API, no forking).
- **Upstream gap found:** `RemoteThreadListAdapter.unstable_Provider` is
  documented as the way to inject a per-thread `history` adapter, but core
  0.1.17's hook manager mounts the runtime hook *outside* that provider
  ("Rendered outside the user's Provider…"), so context-injected adapters
  never reach `useLocalRuntime` — including in the vendor's own cloud
  adapter. Workaround in `ChatRuntimeProvider`: construct the history
  adapter inside `runtimeHook` (which still sits under
  `ThreadListItemRuntimeProvider`, so `useAui()` resolves the thread scope)
  and pass it via `useLocalRuntime` options.
- The runtime **auto-generates titles**: after a new thread's first run ends,
  the hook manager calls `threadListItem.generateTitle()` → your adapter. Do
  not leave `generateTitle` unimplemented (unhandled rejection) and do not
  build a parallel titling flow.
- `tailwindcss ~3.4` + `nativewind ^4.1` + `react-native-css-interop ^0.2`
  work as pinned with the CSS-variable theming pattern.
- No markdown renderer exists in the list, and frontier parity requires
  markdown; a small streaming-tolerant renderer was written in-repo
  (`src/markdown/`) rather than adding a dependency.
