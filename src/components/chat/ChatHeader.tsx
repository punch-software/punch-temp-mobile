import { useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/lib/haptics";
import { PUNCH_MODELS, modelStore, useSelectedModel } from "@/state/modelStore";
import { usePalette } from "@/theme/palette";
import { PopoverMenu, type MenuAnchor } from "@/components/ui/PopoverMenu";

const ModelChip = () => {
  const model = useSelectedModel();
  const palette = usePalette();
  const chipRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  const open = () => {
    haptics.tick();
    chipRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  return (
    <>
      <Pressable
        ref={chipRef}
        onPress={open}
        className="flex-row items-center gap-1 rounded-full px-3 py-1.5 active:bg-surface-high"
      >
        <Text className="text-[16.5px] font-semibold text-foreground">{model.name}</Text>
        <Ionicons name="chevron-down" size={14} color={palette.muted} style={{ marginTop: 2 }} />
      </Pressable>
      <PopoverMenu
        visible={anchor !== null}
        anchor={anchor}
        onClose={() => setAnchor(null)}
        align="center"
        width={270}
        items={PUNCH_MODELS.map((m) => ({
          icon: m.id === "punch-4.6" ? "sparkles-outline" : m.id.includes("mini") ? "flash-outline" : "time-outline",
          label: m.name,
          detail: m.tagline,
          checked: m.id === model.id,
          onPress: () => modelStore.select(m.id),
        }))}
      />
    </>
  );
};

export const ChatHeader = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isEmpty = useAuiState((s) => s.thread.isEmpty);

  return (
    <View
      className="z-10 flex-row items-center justify-between border-b border-line/70 bg-background px-2 pb-1.5"
      style={{ paddingTop: insets.top + 2 }}
    >
      <Pressable
        onPress={() => {
          haptics.tick();
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        hitSlop={8}
        className="h-[38px] w-[38px] items-center justify-center rounded-full active:bg-surface-high"
      >
        <Ionicons name="chevron-back" size={23} color={palette.foreground} />
      </Pressable>

      <ModelChip />

      <Pressable
        disabled={isEmpty && !isRunning}
        onPress={() => {
          haptics.tick();
          router.push("/chat/new");
        }}
        hitSlop={8}
        className="h-[38px] w-[38px] items-center justify-center rounded-full active:bg-surface-high"
        style={{ opacity: isEmpty && !isRunning ? 0.35 : 1 }}
      >
        <Ionicons name="create-outline" size={21} color={palette.foreground} />
      </Pressable>
    </View>
  );
};
