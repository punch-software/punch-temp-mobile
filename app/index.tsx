import { useAui, useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/lib/haptics";
import { relativeTime, timeGreeting } from "@/lib/time";
import { mockServer } from "@/mock/server";
import { usePalette } from "@/theme/palette";
import { PopoverMenu, type MenuAnchor } from "@/components/ui/PopoverMenu";
import { ScalePressable } from "@/components/ui/ScalePressable";
import { showToast } from "@/components/ui/Toast";

const SERIF = Platform.select({ ios: "Georgia", default: "serif" });

type Row = {
  id: string;
  remoteId: string | undefined;
  title: string;
  snippet: string | undefined;
  updatedAt: string | undefined;
};

const ThreadRow = ({ row }: { row: Row }) => {
  const router = useRouter();
  const aui = useAui();
  const queryClient = useQueryClient();
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  const open = () => {
    haptics.tick();
    router.push(`/chat/${row.remoteId ?? row.id}`);
  };

  const onLongPress = (e: GestureResponderEvent) => {
    haptics.press();
    const { pageX, pageY } = e.nativeEvent;
    setMenuAnchor({ x: pageX, y: pageY, width: 1, height: 1 });
  };

  const item = () => aui.threads().item({ id: row.id });

  const rename = () => {
    if (Platform.OS === "ios") {
      Alert.prompt("Rename chat", undefined, (title) => {
        if (title?.trim()) {
          item().rename(title.trim());
          queryClient.invalidateQueries({ queryKey: ["threads"] });
        }
      }, "plain-text", row.title);
    } else {
      showToast("Rename is iOS-only in this demo");
    }
  };

  const remove = () => {
    Alert.alert("Delete chat?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          haptics.success();
          item().delete();
          queryClient.invalidateQueries({ queryKey: ["threads"] });
        },
      },
    ]);
  };

  return (
    <>
      <ScalePressable
        scaleTo={0.98}
        onPress={open}
        onLongPress={onLongPress}
        delayLongPress={320}
        className="mx-4 mb-2 rounded-2xl border border-line bg-surface px-4 py-3.5"
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text numberOfLines={1} className="flex-1 text-[16px] font-semibold text-foreground">
            {row.title}
          </Text>
          {row.updatedAt ? (
            <Text className="text-[12.5px] text-faint">{relativeTime(row.updatedAt)}</Text>
          ) : null}
        </View>
        {row.snippet ? (
          <Text numberOfLines={1} className="mt-1 text-[14px] leading-[19px] text-muted">
            {row.snippet}
          </Text>
        ) : null}
      </ScalePressable>

      <PopoverMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        width={220}
        items={[
          { icon: "pencil-outline", label: "Rename", onPress: rename },
          {
            icon: "archive-outline",
            label: "Archive",
            onPress: () => {
              item().archive();
              showToast("Archived", "archive-outline");
            },
          },
          { icon: "trash-outline", label: "Delete", destructive: true, onPress: remove },
        ]}
      />
    </>
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const queryClient = useQueryClient();

  const threadItems = useAuiState((s) => s.threads.threadItems);
  const threadsLoading = useAuiState((s) => s.threads.isLoading);
  const [search, setSearch] = useState("");

  const metaQuery = useQuery({
    queryKey: ["threads"],
    queryFn: () => mockServer.listThreads(),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    }, [queryClient]),
  );

  const rows = useMemo<Row[]>(() => {
    const metas = new Map((metaQuery.data ?? []).map((m) => [m.remoteId, m]));
    return threadItems
      .filter((t) => t.status === "regular")
      .map((t) => {
        const meta = t.remoteId ? metas.get(t.remoteId) : undefined;
        return {
          id: t.id,
          remoteId: t.remoteId,
          title: t.title ?? meta?.title ?? "New chat",
          snippet: meta?.snippet,
          updatedAt: meta?.updatedAt,
        };
      })
      .filter(
        (r) =>
          !search.trim() ||
          r.title.toLowerCase().includes(search.trim().toLowerCase()) ||
          (r.snippet ?? "").toLowerCase().includes(search.trim().toLowerCase()),
      );
  }, [threadItems, metaQuery.data, search]);

  const header = (
    <View className="px-4 pb-3">
      <View className="mb-6 mt-2 flex-row items-center gap-2.5">
        <View className="h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-accent">
          <Ionicons name="flash" size={16} color={palette.onAccent} />
        </View>
        <Text className="text-[21px] font-bold tracking-tight text-foreground">Punch</Text>
      </View>

      <Text className="mb-5 text-[30px] leading-[38px] text-foreground" style={{ fontFamily: SERIF }}>
        {timeGreeting()}.
      </Text>

      <ScalePressable
        scaleTo={0.98}
        onPress={() => {
          haptics.tick();
          router.push("/chat/new");
        }}
        className="mb-6 flex-row items-center gap-3 rounded-[26px] border border-line bg-surface px-4 py-[15px]"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 3 },
          elevation: 3,
        }}
      >
        <Text className="flex-1 text-[16.5px] text-faint">Ask anything</Text>
        <View className="h-[32px] w-[32px] items-center justify-center rounded-full bg-accent">
          <Ionicons name="arrow-up" size={17} color={palette.onAccent} />
        </View>
      </ScalePressable>

      {(rows.length > 0 || !!search) && (
        <View className="mb-1 flex-row items-center gap-2 rounded-full border border-line bg-surface-high px-3.5 py-[9px]">
          <Ionicons name="search" size={15} color={palette.faint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search chats"
            placeholderTextColor={palette.faint}
            className="flex-1 p-0 text-[15px] text-foreground"
          />
          {search ? (
            <Ionicons name="close-circle" size={16} color={palette.faint} onPress={() => setSearch("")} />
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 6 }}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <ThreadRow row={item} />}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          threadsLoading ? (
            <View className="items-center py-14">
              <ActivityIndicator color={palette.muted} />
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} className="items-center px-10 py-12">
              <Ionicons name="chatbubbles-outline" size={30} color={palette.faint} />
              <Text className="mt-3 text-center text-[15px] leading-[21px] text-muted">
                {search ? "No chats match your search." : "Your conversations will appear here."}
              </Text>
            </Animated.View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
