import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { useIsOnline } from "@/state/netStore";

/**
 * Slides in under the header while offline; flashes "Back online" on
 * reconnect, exactly like the frontier apps handle connectivity.
 */
export const OfflineBanner = () => {
  const isOnline = useIsOnline();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      setShowReconnected(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(t);
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0 z-20 items-center">
      <Animated.View
        key={isOnline ? "online" : "offline"}
        entering={FadeInUp.springify().damping(22).stiffness(280)}
        exiting={FadeOutUp.duration(180)}
        className={`mt-1.5 flex-row items-center gap-1.5 rounded-full px-3.5 py-[7px] shadow-sm ${
          isOnline ? "bg-foreground" : "bg-surface border border-line"
        }`}
      >
        <Ionicons
          name={isOnline ? "checkmark-circle" : "cloud-offline-outline"}
          size={13}
          color={isOnline ? "#8BC34A" : "#A8A59B"}
        />
        <Text className={`text-[12.5px] font-medium ${isOnline ? "text-background" : "text-muted"}`}>
          {isOnline ? "Back online" : "You're offline"}
        </Text>
      </Animated.View>
    </View>
  );
};
