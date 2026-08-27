import { forwardRef } from "react";
import { Pressable, type PressableProps, type View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Pressable with the subtle scale-down feedback frontier apps use on
 * buttons and cards. Runs entirely on the UI thread.
 */
export const ScalePressable = forwardRef<View, PressableProps & { scaleTo?: number }>(
  ({ scaleTo = 0.96, onPressIn, onPressOut, style, ...props }, ref) => {
    const pressed = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: 1 + pressed.value * (scaleTo - 1) },
      ],
    }));

    return (
      <AnimatedPressable
        ref={ref}
        {...props}
        style={[style as object, animatedStyle]}
        onPressIn={(e) => {
          pressed.value = withSpring(1, { damping: 60, stiffness: 800 });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressed.value = withSpring(0, { damping: 60, stiffness: 500 });
          onPressOut?.(e);
        }}
      />
    );
  },
);
ScalePressable.displayName = "ScalePressable";
