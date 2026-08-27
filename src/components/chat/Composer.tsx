import { useAui, useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { File as FsFile } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, useColorScheme, View } from "react-native";
import { KeyboardController, useKeyboardState } from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/lib/haptics";
import { generateId } from "@/lib/id";
import { attachmentsDir, mockServer } from "@/mock/server";
import { netStore } from "@/state/netStore";
import { prefsStore, useUiPrefs } from "@/state/prefsStore";
import { queueStore, useMessageQueue } from "@/state/queueStore";
import { usePalette } from "@/theme/palette";
import { PopoverMenu, type MenuAnchor } from "@/components/ui/PopoverMenu";
import { ScalePressable } from "@/components/ui/ScalePressable";
import { showToast } from "@/components/ui/Toast";
import { VoiceRecorder } from "./VoiceRecorder";

// ---------------------------------------------------------------------------
// Attachment previews inside the composer card
// ---------------------------------------------------------------------------

type ComposerAttachment = {
  id: string;
  type: string;
  name: string;
  content?: readonly { type: string; image?: string }[];
};

const AttachmentsPreview = ({ attachments }: { attachments: readonly ComposerAttachment[] }) => {
  const aui = useAui();
  const palette = usePalette();

  return (
    <Animated.View layout={LinearTransition.springify().damping(28).stiffness(320)}>
      <View className="flex-row flex-wrap gap-2 px-3 pt-3">
        {attachments.map((a) => {
          const imageUri = a.content?.find((p) => p.type === "image")?.image;
          return (
            <View key={a.id}>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  contentFit="cover"
                  transition={150}
                  style={{ width: 64, height: 64, borderRadius: 14 }}
                />
              ) : (
                <View className="h-[64px] w-[132px] flex-row items-center gap-2 rounded-[14px] border border-line bg-surface-high px-2.5">
                  <View className="h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent">
                    <Ionicons name="document-text" size={15} color={palette.onAccent} />
                  </View>
                  <View className="flex-1">
                    <Text
                      numberOfLines={2}
                      className="text-[11.5px] font-medium leading-[14px] text-foreground"
                    >
                      {a.name}
                    </Text>
                  </View>
                </View>
              )}
              <Pressable
                onPress={() => {
                  haptics.tick();
                  aui.composer().attachment({ id: a.id }).remove();
                }}
                hitSlop={8}
                className="absolute -right-1.5 -top-1.5 h-[20px] w-[20px] items-center justify-center rounded-full bg-foreground"
              >
                <Ionicons name="close" size={12} color={palette.background} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Queue chips: messages waiting while a run / sub-agent works
// ---------------------------------------------------------------------------

const QueueChips = () => {
  const queue = useMessageQueue();
  const palette = usePalette();
  if (queue.length === 0) return null;

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(28).stiffness(320)}
      className="mb-2 gap-1.5 px-1"
    >
      {queue.map((item, i) => (
        <Animated.View
          key={item.id}
          entering={FadeInDown.springify().damping(26).stiffness(320).withInitialValues({
            transform: [{ translateY: 10 }],
          })}
          exiting={FadeOut.duration(140)}
          className="flex-row items-center gap-2 self-end rounded-full border border-line bg-surface py-[7px] pl-3.5 pr-2"
        >
          <Ionicons name="time-outline" size={13} color={palette.faint} />
          <Text numberOfLines={1} className="max-w-[220px] text-[13.5px] text-muted">
            {item.text}
          </Text>
          <Text className="text-[11px] font-medium text-faint">#{i + 1}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptics.tick();
              queueStore.remove(item.id);
            }}
            className="h-[20px] w-[20px] items-center justify-center rounded-full bg-surface-high"
          >
            <Ionicons name="close" size={11} color={palette.muted} />
          </Pressable>
        </Animated.View>
      ))}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Morphing action button (mic ⇄ send ⇄ stop) for the text composer
// ---------------------------------------------------------------------------

const RoundButton = ({
  visible,
  accent,
  icon,
  onPress,
  onLongPress,
  testID,
}: {
  visible: boolean;
  accent?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}) => {
  const palette = usePalette();
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 130 }),
    transform: [{ scale: withSpring(visible ? 1 : 0.5, { damping: 26, stiffness: 420 }) }],
    pointerEvents: visible ? ("auto" as const) : ("none" as const),
  }));

  return (
    <Animated.View className="absolute inset-0" style={style}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={340}
        className={`h-[36px] w-[36px] items-center justify-center rounded-full ${accent ? "bg-accent" : "bg-foreground"} active:opacity-85`}
      >
        <Ionicons name={icon} size={18} color={accent ? palette.onAccent : palette.background} />
      </Pressable>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

type Props = {
  /** Keyboard shared values from react-native-keyboard-controller. */
  keyboardHeight: SharedValue<number>;
  keyboardProgress: SharedValue<number>;
  /** Reported measured height (content block), consumed by the list spacer. */
  composerHeight: SharedValue<number>;
  onSend?: () => void;
};

export const Composer = ({ keyboardHeight, keyboardProgress, composerHeight, onSend }: Props) => {
  const aui = useAui();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const colorScheme = useColorScheme();
  const prefs = useUiPrefs();

  const text = useAuiState((s) => s.composer.text);
  const attachments = useAuiState((s) => s.composer.attachments) as readonly ComposerAttachment[];
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const threadKey = useAuiState((s) => s.threadListItem.remoteId ?? s.threadListItem.id);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);

  const inputRef = useRef<TextInput>(null);
  const plusRef = useRef<View>(null);
  const keyboardBtnRef = useRef<View>(null);
  const micSlotRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [sideMenuAnchor, setSideMenuAnchor] = useState<MenuAnchor | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [textSession, setTextSession] = useState(prefs.inputSurface === "text");

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  // The resting voice-first surface: a big centered mic. Any content, an
  // active typing session, or dictation swaps in the text composer card.
  const showVoiceBar =
    prefs.inputSurface === "voice" && !textSession && !voiceActive && !hasContent;

  // Leaving the keyboard with an empty composer returns to the voice surface.
  useEffect(() => {
    if (!keyboardVisible && !hasContent && prefs.inputSurface === "voice") {
      setTextSession(false);
    }
  }, [keyboardVisible, hasContent, prefs.inputSurface]);

  // ---- Message queue flush -------------------------------------------------
  // Flushes one item per completed run. Held entirely while offline: the
  // queue is the "don't lose it" buffer, so items only leave it when a send
  // can actually start (netTick re-triggers the effect on reconnect).
  const [netTick, setNetTick] = useState(0);
  useEffect(() => netStore.subscribe(() => setNetTick((t) => t + 1)), []);

  useEffect(() => {
    if (isRunning || !netStore.isOnline) return;
    if (queueStore.items.length === 0) return;
    const t = setTimeout(() => {
      // Re-check live state: a reconnect auto-retry may have started a run
      // between scheduling and firing.
      if (!netStore.isOnline) return;
      const item = queueStore.shift();
      if (!item) return;
      if (aui.thread().getState().isRunning) {
        queueStore.requeue(item);
        return;
      }
      aui.thread().append(item.text);
      onSend?.();
    }, 420);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, netTick]);

  // ---- Draft persistence (outbox-adjacent) --------------------------------
  const draftLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (draftLoadedFor.current === threadKey) return;
    draftLoadedFor.current = threadKey;
    const drafts = mockServer.loadDrafts();
    const draft = drafts[threadKey];
    if (draft && !aui.composer().getState().text) {
      aui.composer().setText(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  useEffect(() => {
    const t = setTimeout(() => mockServer.saveDraft(threadKey, text), 400);
    return () => clearTimeout(t);
  }, [text, threadKey]);

  // ---- Keyboard-driven translate ------------------------------------------
  const translateStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: keyboardHeight.value + keyboardProgress.value * insets.bottom },
    ],
  }));

  // ---- Actions -------------------------------------------------------------
  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!hasContent) return;
    if (isRunning) {
      // Queue while the current run (or sub-agent) finishes.
      if (trimmed) {
        haptics.tick();
        queueStore.add(trimmed);
        aui.composer().setText("");
        mockServer.saveDraft(threadKey, "");
      }
      return;
    }
    haptics.send();
    aui.composer().send();
    mockServer.saveDraft(threadKey, "");
    onSend?.();
  }, [aui, hasContent, isRunning, onSend, text, threadKey]);

  const stop = useCallback(() => {
    haptics.tick();
    aui.thread().cancelRun();
  }, [aui]);

  const openAttachMenu = (anchorRef: React.RefObject<View | null>) => {
    haptics.tick();
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
    });
  };

  /** Input-preferences menu, reachable from both surfaces. */
  const openInputPrefsMenu = (anchorRef: React.RefObject<View | null>) => {
    haptics.press();
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setSideMenuAnchor({ x, y, width, height });
    });
  };

  /** Explicit path back from a keyboard session to the voice surface. */
  const collapseToVoice = useCallback(() => {
    haptics.tick();
    KeyboardController.dismiss();
    setTextSession(false);
  }, []);

  const copyIntoAttachments = (uri: string, name: string): string => {
    try {
      const dest = new FsFile(attachmentsDir, `${generateId("att")}-${name.replace(/[^\w.\-]/g, "_")}`);
      new FsFile(uri).copy(dest);
      return dest.uri;
    } catch {
      return uri;
    }
  };

  const addImageAssets = async (assets: ImagePicker.ImagePickerAsset[]) => {
    for (const asset of assets) {
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
      const uri = copyIntoAttachments(asset.uri, name);
      await aui.composer().addAttachment({
        type: "image",
        name,
        contentType: asset.mimeType ?? "image/jpeg",
        content: [{ type: "image", image: uri }],
      });
    }
  };

  const pickPhotos = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 4,
        quality: 0.85,
      });
      if (!res.canceled) await addImageAssets(res.assets);
    } catch {
      showToast("Couldn't open photos", "alert-circle-outline");
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showToast("Camera access needed", "camera-outline");
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!res.canceled) await addImageAssets(res.assets);
    } catch {
      showToast("Camera unavailable", "camera-outline");
    }
  };

  const pickFiles = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      for (const file of res.assets) {
        const uri = copyIntoAttachments(file.uri, file.name);
        await aui.composer().addAttachment({
          type: "document",
          name: file.name,
          contentType: file.mimeType ?? "application/octet-stream",
          content: [
            { type: "file", data: uri, mimeType: file.mimeType ?? "application/octet-stream", filename: file.name },
          ],
        });
      }
    } catch {
      showToast("Couldn't open files", "alert-circle-outline");
    }
  };

  const onTranscribed = (t: string) => {
    setVoiceActive(false);
    const existing = aui.composer().getState().text;
    aui.composer().setText(existing ? `${existing} ${t}` : t);
    haptics.success();
  };

  // ---- Sub-views -----------------------------------------------------------

  const smallCircle =
    "h-[44px] w-[44px] items-center justify-center rounded-full border border-line bg-surface";

  const keyboardButton = (
    <ScalePressable
      ref={keyboardBtnRef}
      scaleTo={0.92}
      onPress={() => {
        haptics.tick();
        setTextSession(true);
        setTimeout(() => inputRef.current?.focus(), 80);
      }}
      onLongPress={() => openInputPrefsMenu(keyboardBtnRef)}
      delayLongPress={340}
      className={smallCircle}
    >
      <Ionicons name="keypad-outline" size={19} color={palette.muted} />
    </ScalePressable>
  );

  const attachButton = (
    <ScalePressable
      ref={plusRef}
      scaleTo={0.92}
      onPress={() => openAttachMenu(plusRef)}
      className={smallCircle}
    >
      <Ionicons name="add" size={23} color={palette.muted} />
    </ScalePressable>
  );

  const voiceBar = (
    <Animated.View
      key="voice-bar"
      entering={FadeInDown.duration(200).withInitialValues({ transform: [{ translateY: 12 }] })}
      exiting={FadeOut.duration(120)}
      className="flex-row items-center justify-between px-7"
      style={{ paddingBottom: Math.max(insets.bottom, 10) + 2, paddingTop: 6 }}
    >
      {prefs.keyboardSide === "left" ? keyboardButton : attachButton}

      <ScalePressable
        scaleTo={0.93}
        onPress={() => {
          if (isRunning) {
            stop();
            return;
          }
          haptics.tick();
          setVoiceActive(true);
        }}
        className={`h-[64px] w-[64px] items-center justify-center rounded-full ${isRunning ? "bg-foreground" : "bg-accent"}`}
        style={{
          shadowColor: palette.accent,
          shadowOpacity: isRunning ? 0 : 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Ionicons
          name={isRunning ? "stop" : "mic"}
          size={isRunning ? 24 : 28}
          color={isRunning ? palette.background : palette.onAccent}
        />
      </ScalePressable>

      {prefs.keyboardSide === "left" ? attachButton : keyboardButton}
    </Animated.View>
  );

  const textComposer = (
    <Animated.View
      key="text-composer"
      entering={FadeInDown.duration(180).withInitialValues({ transform: [{ translateY: 10 }] })}
      exiting={FadeOut.duration(120)}
      className="px-2.5"
      style={{ paddingBottom: insets.bottom + 4 }}
    >
      <Animated.View
        layout={LinearTransition.springify().damping(30).stiffness(380)}
        className="rounded-[28px] border border-line bg-surface"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        {voiceActive ? (
          <VoiceRecorder onCancel={() => setVoiceActive(false)} onTranscribed={onTranscribed} />
        ) : (
          <>
            {attachments.length > 0 && <AttachmentsPreview attachments={attachments} />}
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(t) => aui.composer().setText(t)}
              placeholder={isRunning ? "Queue a message" : "Message Punch"}
              placeholderTextColor={palette.faint}
              multiline
              className="max-h-[132px] px-4 pb-1 pt-[12px] text-[17px] leading-[22px] text-foreground"
              scrollEnabled
              keyboardAppearance={colorScheme === "dark" ? "dark" : "light"}
            />
            <View className="flex-row items-center justify-between px-2 pb-2 pt-1">
              <Pressable
                ref={plusRef}
                onPress={() => openAttachMenu(plusRef)}
                hitSlop={6}
                className="h-[36px] w-[36px] items-center justify-center rounded-full border border-line bg-surface active:bg-surface-high"
              >
                <Ionicons name="add" size={21} color={palette.foreground} />
              </Pressable>

              <View className="flex-row items-center gap-0.5">
                {prefs.inputSurface === "voice" && !hasContent ? (
                  <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
                    <Pressable
                      onPress={collapseToVoice}
                      hitSlop={8}
                      className="h-[36px] w-[36px] items-center justify-center rounded-full active:bg-surface-high"
                      testID="composer-collapse"
                    >
                      <Ionicons name="chevron-down" size={20} color={palette.muted} />
                    </Pressable>
                  </Animated.View>
                ) : null}
                <View ref={micSlotRef} className="h-[36px] w-[36px]">
                  <RoundButton
                    visible={!isRunning && !hasContent}
                    icon="mic-outline"
                    onPress={() => {
                      haptics.tick();
                      setVoiceActive(true);
                    }}
                    onLongPress={() => openInputPrefsMenu(micSlotRef)}
                  />
                  <RoundButton
                    visible={hasContent}
                    accent
                    icon={isRunning ? "arrow-up-circle-outline" : "arrow-up"}
                    onPress={send}
                    testID="composer-send"
                  />
                  <RoundButton
                    visible={isRunning && !hasContent}
                    icon="stop"
                    onPress={stop}
                    testID="composer-stop"
                  />
                </View>
              </View>
            </View>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );

  const voiceOverlayBar = (
    <Animated.View
      key="voice-overlay"
      entering={FadeInDown.duration(180).withInitialValues({ transform: [{ translateY: 10 }] })}
      exiting={FadeOut.duration(120)}
      className="px-2.5"
      style={{ paddingBottom: insets.bottom + 4 }}
    >
      <View
        className="rounded-[28px] border border-line bg-surface"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <VoiceRecorder onCancel={() => setVoiceActive(false)} onTranscribed={onTranscribed} />
      </View>
    </Animated.View>
  );

  return (
    <Animated.View
      className="absolute inset-x-0 bottom-0"
      style={translateStyle}
      onLayout={(e) => {
        composerHeight.value = withSpring(e.nativeEvent.layout.height, {
          damping: 30,
          stiffness: 380,
        });
      }}
    >
      <View className="px-2.5">
        <QueueChips />
      </View>
      {voiceActive ? voiceOverlayBar : showVoiceBar ? voiceBar : textComposer}

      <PopoverMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        placement="above"
        width={240}
        items={[
          { icon: "images-outline", label: "Photo Library", onPress: pickPhotos },
          { icon: "camera-outline", label: "Camera", onPress: takePhoto },
          { icon: "folder-outline", label: "Files", onPress: pickFiles },
        ]}
      />
      <PopoverMenu
        visible={sideMenuAnchor !== null}
        anchor={sideMenuAnchor}
        onClose={() => setSideMenuAnchor(null)}
        placement="above"
        align="right"
        width={235}
        items={[
          {
            icon: "mic-outline",
            label: "Default to voice",
            checked: prefs.inputSurface === "voice",
            onPress: () => {
              prefsStore.set({ inputSurface: "voice" });
              collapseToVoice();
            },
          },
          {
            icon: "text-outline",
            label: "Default to keyboard",
            checked: prefs.inputSurface === "text",
            onPress: () => prefsStore.set({ inputSurface: "text" }),
          },
          {
            icon: "chevron-back-circle-outline",
            label: "Keyboard toggle on left",
            checked: prefs.keyboardSide === "left",
            onPress: () => prefsStore.set({ keyboardSide: "left" }),
          },
          {
            icon: "chevron-forward-circle-outline",
            label: "Keyboard toggle on right",
            checked: prefs.keyboardSide === "right",
            onPress: () => prefsStore.set({ keyboardSide: "right" }),
          },
        ]}
      />
    </Animated.View>
  );
};
