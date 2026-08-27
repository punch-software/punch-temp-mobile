import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * The pre-first-token indicator: a single breathing dot, ChatGPT-style.
 * Runs on the UI thread; unmounts the moment text arrives.
 */
export const TypingIndicator = () => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.value * 0.65,
    transform: [{ scale: 0.82 + pulse.value * 0.3 }],
  }));

  return (
    <View className="h-[26px] justify-center">
      <Animated.View className="h-[13px] w-[13px] rounded-full bg-foreground" style={style} />
    </View>
  );
};
