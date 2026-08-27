import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "@/theme/palette";

/** Full-screen selectable text view, like Claude's "Select Text" action. */
export const SelectTextModal = ({
  visible,
  text,
  onClose,
}: {
  visible: boolean;
  text: string;
  onClose: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background">
        <View
          className="flex-row items-center justify-between border-b border-line px-4 pb-3"
          style={{ paddingTop: Math.max(insets.top, 14) }}
        >
          <Text className="text-[17px] font-semibold text-foreground">Select text</Text>
          <Pressable onPress={onClose} hitSlop={8} className="rounded-full bg-surface-high p-1.5 active:opacity-60">
            <Ionicons name="close" size={18} color={palette.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <Text selectable className="text-[16.5px] leading-[26px] text-foreground">
            {text}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
};
