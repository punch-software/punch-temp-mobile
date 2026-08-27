import { Ionicons } from "@expo/vector-icons";
import { Fragment } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme/palette";

export type MenuAnchor = { x: number; y: number; width: number; height: number };

export type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  destructive?: boolean;
  checked?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  anchor: MenuAnchor | null;
  onClose: () => void;
  items: MenuItem[];
  /** Preferred vertical placement relative to the anchor. */
  placement?: "above" | "below";
  /** Horizontal alignment relative to the anchor. */
  align?: "left" | "right" | "center";
  width?: number;
};

/**
 * iOS-style context menu: dimmed backdrop, springy zoom-in card anchored to
 * the pressed element. Used for message actions, the attachment menu, and
 * the model picker.
 */
export const PopoverMenu = ({
  visible,
  anchor,
  onClose,
  items,
  placement = "below",
  align = "left",
  width = 250,
}: Props) => {
  const palette = usePalette();
  const { width: screenW, height: screenH } = useWindowDimensions();

  if (!anchor) return null;

  const margin = 12;
  let left =
    align === "left" ? anchor.x : align === "right" ? anchor.x + anchor.width - width : anchor.x + anchor.width / 2 - width / 2;
  left = Math.min(Math.max(margin, left), screenW - width - margin);

  const estimatedHeight = items.length * 50 + 12;
  let top =
    placement === "below" ? anchor.y + anchor.height + 8 : anchor.y - estimatedHeight - 8;
  top = Math.min(Math.max(margin, top), screenH - estimatedHeight - margin);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} className="flex-1">
        <Pressable className="flex-1 bg-black/25" onPress={onClose} />
        <Animated.View
          entering={ZoomIn.springify().damping(19).stiffness(360).withInitialValues({
            transform: [{ scale: 0.7 }],
          })}
          className="absolute overflow-hidden rounded-2xl bg-surface shadow-2xl"
          style={{
            left,
            top,
            width,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 30,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {i > 0 && <View className="h-px bg-line" />}
              <Pressable
                className="flex-row items-center gap-3 px-4 py-[13px] active:bg-surface-high"
                onPress={() => {
                  haptics.tick();
                  onClose();
                  // Let the menu dismiss before the action runs (matches iOS).
                  setTimeout(item.onPress, 60);
                }}
              >
                <Ionicons
                  name={item.icon}
                  size={19}
                  color={item.destructive ? palette.danger : palette.foreground}
                />
                <View className="flex-1">
                  <Text
                    className={`text-[16px] ${item.destructive ? "text-danger" : "text-foreground"}`}
                  >
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text className="mt-0.5 text-[12.5px] text-muted">{item.detail}</Text>
                  ) : null}
                </View>
                {item.checked ? (
                  <Ionicons name="checkmark" size={18} color={palette.accent} />
                ) : null}
              </Pressable>
            </Fragment>
          ))}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};
