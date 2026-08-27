import { useAui, useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { Pressable, Text, TextInput, View, type GestureResponderEvent } from "react-native";

import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme/palette";
import { PopoverMenu, type MenuAnchor } from "@/components/ui/PopoverMenu";
import { showToast } from "@/components/ui/Toast";

type AttachmentLike = {
  id: string;
  type: string;
  name: string;
  content?: readonly { type: string; image?: string }[];
};

const imageUriOf = (a: AttachmentLike): string | null => {
  const part = a.content?.find((p) => p.type === "image");
  return part?.image ?? null;
};

const MessageAttachments = ({ attachments }: { attachments: readonly AttachmentLike[] }) => {
  const palette = usePalette();
  const images = attachments.map(imageUriOf).filter((u): u is string => !!u);
  const files = attachments.filter((a) => !imageUriOf(a));

  return (
    <View className="mb-1.5 items-end gap-1.5">
      {images.length > 0 && (
        <View className="max-w-[264px] flex-row flex-wrap justify-end gap-1.5">
          {images.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              contentFit="cover"
              transition={180}
              style={{
                width: images.length === 1 ? 208 : 128,
                height: images.length === 1 ? 208 : 128,
                borderRadius: 16,
              }}
            />
          ))}
        </View>
      )}
      {files.map((f) => (
        <View
          key={f.id}
          className="flex-row items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-2.5"
        >
          <View className="h-[34px] w-[34px] items-center justify-center rounded-xl bg-accent">
            <Ionicons name="document-text" size={17} color={palette.onAccent} />
          </View>
          <Text numberOfLines={1} className="max-w-[180px] text-[14px] font-medium text-foreground">
            {f.name}
          </Text>
        </View>
      ))}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Inline edit composer (ChatGPT-style edit & resend)
// ---------------------------------------------------------------------------

export const UserEditComposer = () => {
  const aui = useAui();
  const text = useAuiState((s) => s.message.composer.text);

  return (
    <View className="px-5 py-2">
      <View className="rounded-[22px] border border-line-strong bg-surface p-3">
        <TextInput
          value={text}
          onChangeText={(t) => aui.message().composer().setText(t)}
          multiline
          autoFocus
          className="max-h-[160px] px-1.5 pt-1 text-[16.5px] leading-[23px] text-foreground"
          scrollEnabled
        />
        <View className="mt-2.5 flex-row justify-end gap-2.5">
          <Pressable
            onPress={() => aui.message().composer().cancel()}
            className="rounded-full border border-line px-4 py-2 active:bg-surface-high"
          >
            <Text className="text-[14px] font-medium text-foreground">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.send();
              aui.message().composer().send();
            }}
            className="rounded-full bg-accent px-4 py-2 active:opacity-85"
          >
            <Text className="text-[14px] font-semibold text-on-accent">Send</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// User message bubble
// ---------------------------------------------------------------------------

export const UserMessage = memo(() => {
  const aui = useAui();
  const text = useAuiState((s) =>
    s.message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n"),
  );
  const attachments = useAuiState((s) =>
    s.message.role === "user"
      ? ((s.message as { attachments: readonly AttachmentLike[] }).attachments ?? [])
      : [],
  );

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  const onLongPress = (e: GestureResponderEvent) => {
    haptics.press();
    const { pageX, pageY } = e.nativeEvent;
    setMenuAnchor({ x: pageX, y: pageY, width: 1, height: 1 });
  };

  return (
    <View className="px-5 py-2">
      <View className="items-end">
        {attachments.length > 0 && <MessageAttachments attachments={attachments} />}
        {text ? (
          <Pressable onLongPress={onLongPress} delayLongPress={320} className="max-w-[82%]">
            <View className="rounded-[20px] bg-bubble px-4 py-2.5">
              <Text className="text-[16.5px] leading-[24px] text-foreground">{text}</Text>
            </View>
          </Pressable>
        ) : null}
      </View>

      <PopoverMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        align="right"
        width={210}
        items={[
          {
            icon: "copy-outline",
            label: "Copy",
            onPress: () => {
              Clipboard.setStringAsync(text).catch(() => {});
              haptics.success();
              showToast("Copied", "checkmark");
            },
          },
          {
            icon: "pencil-outline",
            label: "Edit message",
            onPress: () => aui.message().composer().beginEdit(),
          },
        ]}
      />
    </View>
  );
});
UserMessage.displayName = "UserMessage";
