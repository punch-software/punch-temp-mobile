import { useAui } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardController } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme/palette";
import { ScalePressable } from "@/components/ui/ScalePressable";

const SERIF = Platform.select({ ios: "Georgia", default: "serif" });

const SUGGESTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; prompt: string }[] = [
  {
    icon: "code-slash-outline",
    label: "Write a debounce hook",
    prompt: "Can you write a React hook that debounces a value?",
  },
  {
    icon: "airplane-outline",
    label: "Plan a 3-day trip",
    prompt: "Help me plan a 3-day trip somewhere coastal.",
  },
  {
    icon: "mail-outline",
    label: "Draft a tricky email",
    prompt: "Draft an email telling my team a deadline slipped by three days.",
  },
  {
    icon: "bulb-outline",
    label: "Brainstorm names",
    prompt: "Brainstorm names for a weekend side project.",
  },
];

/**
 * The empty-thread state: serif greeting centered like the Claude app, with
 * tappable starter chips that send immediately, like ChatGPT's.
 */
export const EmptyThread = () => {
  const aui = useAui();
  const palette = usePalette();

  const sendPrompt = (prompt: string) => {
    haptics.send();
    aui.thread().append(prompt);
  };

  return (
    <View className="flex-1">
      {/* No list to swipe here, so a background tap dismisses the keyboard. */}
      <Pressable
        className="flex-1 items-center justify-center px-8"
        onPress={() => {
          KeyboardController.dismiss();
        }}
        accessible={false}
      >
        <Animated.View entering={FadeIn.duration(400)} className="items-center">
          <View className="mb-5 h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-accent">
            <Ionicons name="flash" size={26} color={palette.onAccent} />
          </View>
          <Text
            className="text-center text-[28px] leading-[36px] text-foreground"
            style={{ fontFamily: SERIF }}
          >
            What can I help with?
          </Text>
        </Animated.View>
      </Pressable>

      <Animated.View entering={FadeInDown.delay(120).springify().damping(26).stiffness(240)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          className="mb-3"
        >
          {SUGGESTIONS.map((s) => (
            <ScalePressable
              key={s.label}
              scaleTo={0.95}
              onPress={() => sendPrompt(s.prompt)}
              className="flex-row items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5"
            >
              <Ionicons name={s.icon} size={15} color={palette.accent} />
              <Text className="text-[14px] font-medium text-foreground">{s.label}</Text>
            </ScalePressable>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
};
