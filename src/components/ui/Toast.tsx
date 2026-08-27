import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ToastPayload = {
  id: number;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Listener = (toast: ToastPayload) => void;
let listener: Listener | null = null;
let counter = 0;

export const showToast = (message: string, icon?: ToastPayload["icon"]) => {
  listener?.({ id: ++counter, message, icon });
};

/** Mount once near the root. Small, top-anchored, self-dismissing. */
export const ToastHost = () => {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 items-center"
      style={{ top: insets.top + 6 }}
    >
      <Animated.View
        key={toast.id}
        entering={FadeInDown.springify().damping(18).stiffness(240)}
        exiting={FadeOutUp.duration(160)}
        className="flex-row items-center gap-2 rounded-full bg-foreground px-4 py-2.5 shadow-lg"
      >
        {toast.icon ? <Ionicons name={toast.icon} size={15} color="#FAF9F5" /> : null}
        <Text className="text-[14px] font-medium text-background">{toast.message}</Text>
      </Animated.View>
    </View>
  );
};
