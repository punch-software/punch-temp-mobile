import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Directory, File as FsFile, Paths } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { generateId } from "@/lib/id";
import { MOCK_TRANSCRIPTIONS } from "@/mock/replies";
import { usePalette } from "@/theme/palette";
import { showToast } from "@/components/ui/Toast";

const BAR_COUNT = 30;

const RecordingDot = () => {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + pulse.value * 0.55 }));
  return <Animated.View className="h-[9px] w-[9px] rounded-full bg-danger" style={style} />;
};

const Waveform = ({ levels }: { levels: number[] }) => {
  const palette = usePalette();
  return (
    <View className="h-[34px] flex-1 flex-row items-center justify-end gap-[2.5px] overflow-hidden">
      {levels.map((level, i) => (
        <View
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            height: 4 + level * 26,
            backgroundColor: i >= levels.length - 3 ? palette.accent : palette.faint,
          }}
        />
      ))}
    </View>
  );
};

const formatDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

type Props = {
  onCancel: () => void;
  /** Called with the mock transcription once "processing" completes. */
  onTranscribed: (text: string) => void;
};

/**
 * Dictation UI that swaps into the composer while recording: live metering
 * waveform, timer, cancel/accept. Accepting runs a mocked transcription.
 */
export const VoiceRecorder = ({ onCancel, onTranscribed }: Props) => {
  const palette = usePalette();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 70);
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [phase, setPhase] = useState<"starting" | "recording" | "transcribing">("starting");
  const startedRef = useRef(false);

  // Start recording on mount.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          showToast("Microphone access needed", "mic-off-outline");
          onCancel();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (disposed) return;
        recorder.record();
        startedRef.current = true;
        haptics.recordStart();
        setPhase("recording");
      } catch {
        showToast("Couldn't start recording", "alert-circle-outline");
        onCancel();
      }
    })();
    return () => {
      disposed = true;
      if (startedRef.current) {
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed the waveform from metering (dBFS → 0..1).
  useEffect(() => {
    if (phase !== "recording") return;
    const db = recorderState.metering ?? -60;
    const level = Math.min(1, Math.max(0, (db + 50) / 46));
    setLevels((prev) => [...prev.slice(1), level]);
  }, [recorderState.metering, recorderState.durationMillis, phase]);

  const stopAndKeepFile = async (): Promise<void> => {
    try {
      await recorder.stop();
      startedRef.current = false;
      // Persist the note like an outbox item would (mock parity).
      if (recorder.uri) {
        const dir = new Directory(Paths.document, "punch", "voice");
        if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
        new FsFile(recorder.uri).copy(new FsFile(dir, `${generateId("note")}.m4a`));
      }
    } catch {
      // keep going; transcription is mocked anyway
    }
  };

  const onAccept = async () => {
    if (phase !== "recording") return;
    haptics.tick();
    setPhase("transcribing");
    await stopAndKeepFile();
    setTimeout(() => {
      const text =
        MOCK_TRANSCRIPTIONS[Math.floor(Math.random() * MOCK_TRANSCRIPTIONS.length)]!;
      onTranscribed(text);
    }, 700);
  };

  const onCancelPress = async () => {
    haptics.tick();
    if (startedRef.current) {
      try {
        await recorder.stop();
        startedRef.current = false;
      } catch {
        // ignore
      }
    }
    onCancel();
  };

  return (
    <Animated.View entering={FadeIn.duration(160)} className="flex-row items-center gap-3 px-2.5 py-2">
      <Pressable
        onPress={onCancelPress}
        hitSlop={6}
        className="h-[36px] w-[36px] items-center justify-center rounded-full bg-surface-high active:opacity-70"
      >
        <Ionicons name="close" size={19} color={palette.muted} />
      </Pressable>

      {phase === "transcribing" ? (
        <View className="h-[34px] flex-1 flex-row items-center gap-2">
          <TranscribingShimmer />
        </View>
      ) : (
        <>
          <RecordingDot />
          <Text className="w-[42px] text-[14px] font-medium tabular-nums text-muted">
            {formatDuration(recorderState.durationMillis ?? 0)}
          </Text>
          <Waveform levels={levels} />
        </>
      )}

      <Pressable
        onPress={onAccept}
        hitSlop={6}
        disabled={phase !== "recording"}
        className="h-[36px] w-[36px] items-center justify-center rounded-full bg-accent active:opacity-85"
        style={{ opacity: phase === "recording" ? 1 : 0.5 }}
      >
        <Ionicons name="checkmark" size={20} color={palette.onAccent} />
      </Pressable>
    </Animated.View>
  );
};

const TranscribingShimmer = () => {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 900 }), -1);
  }, [shimmer]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * Math.abs(Math.sin(shimmer.value * Math.PI)) }));
  return (
    <Animated.Text style={style} className="text-[15px] text-muted">
      Transcribing…
    </Animated.Text>
  );
};
