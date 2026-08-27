import * as Haptics from "expo-haptics";

/**
 * Semantic haptics vocabulary for the app. Frontier chat apps use haptics
 * sparingly but consistently: a light tick when a message leaves, a soft
 * pulse when the reply starts, selection ticks for menus.
 *
 * Every call is fire-and-forget; failures (simulators, devices without
 * a Taptic engine) are swallowed.
 */
const safe = (fn: () => Promise<unknown>) => {
  fn().catch(() => {});
};

export const haptics = {
  /** Message sent, primary action confirmed. */
  send: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Assistant starts replying. */
  streamStart: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** Long-press menus, pickers opening. */
  press: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Row/option highlight, toggles, scroll-to-bottom. */
  tick: () => safe(() => Haptics.selectionAsync()),
  /** Copy confirmations and other small successes. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Errors (send failed, recording failed). */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Voice recording started. */
  recordStart: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
};
