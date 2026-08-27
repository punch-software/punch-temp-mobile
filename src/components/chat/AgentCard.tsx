import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";

import type { AgentData } from "@/mock/protocol";
import { usePalette } from "@/theme/palette";

/**
 * Sub-agent activity card: name + task, a live step timeline while it runs,
 * and the handed-back summary once done. Streams in as a `data` part.
 */
export const AgentCard = memo(
  ({ agent }: { agent: AgentData }) => {
    const palette = usePalette();
    const running = agent.status === "running";

    return (
      <Animated.View
        layout={LinearTransition.springify().damping(30).stiffness(360)}
        entering={FadeIn.duration(220)}
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <View className="flex-row items-center gap-3 px-3.5 pb-2 pt-3">
          <View className="h-[32px] w-[32px] items-center justify-center rounded-[11px] bg-accent-soft">
            <Ionicons name="sparkles" size={16} color={palette.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-foreground">{agent.name}</Text>
            <Text numberOfLines={1} className="mt-[1px] text-[12.5px] text-muted">
              {agent.task}
            </Text>
          </View>
          {running ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-surface-high px-2.5 py-1">
              <ActivityIndicator size="small" color={palette.muted} style={{ transform: [{ scale: 0.7 }] }} />
              <Text className="text-[12px] font-medium text-muted">Working</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1">
              <Ionicons name="checkmark" size={12} color={palette.accent} />
              <Text className="text-[12px] font-semibold text-accent">Done</Text>
            </View>
          )}
        </View>

        {agent.steps.length > 0 && (
          <View className="gap-[7px] px-4 pb-3 pt-1.5">
            {agent.steps.map((step, i) => (
              <Animated.View
                key={`${i}-${step.label}`}
                entering={FadeInDown.duration(220).withInitialValues({ transform: [{ translateY: 6 }] })}
                className="flex-row items-center gap-2.5"
              >
                {step.done ? (
                  <Ionicons name="checkmark-circle" size={16} color={palette.accent} />
                ) : (
                  <ActivityIndicator size="small" color={palette.muted} style={{ transform: [{ scale: 0.75 }] }} />
                )}
                <Text
                  className={`flex-1 text-[13.5px] ${step.done ? "text-muted" : "font-medium text-foreground"}`}
                >
                  {step.label}
                  {step.detail ? <Text className="text-faint">  {step.detail}</Text> : null}
                </Text>
              </Animated.View>
            ))}
          </View>
        )}

        {agent.summary ? (
          <Animated.View entering={FadeIn.duration(240)} className="border-t border-line bg-surface-high/60 px-4 py-2.5">
            <Text className="text-[13.5px] leading-[19px] text-muted">{agent.summary}</Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  },
  (prev, next) => JSON.stringify(prev.agent) === JSON.stringify(next.agent),
);
AgentCard.displayName = "AgentCard";
