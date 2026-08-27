import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastHost } from "@/components/ui/Toast";
import { ensureSession } from "@/mock/server";
import { ChatRuntimeProvider } from "@/runtime/ChatRuntimeProvider";
import { usePalette } from "@/theme/palette";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1 },
  },
});

const RootStack = () => {
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    />
  );
};

export default function RootLayout() {
  useEffect(() => {
    ensureSession().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <ChatRuntimeProvider>
            <RootStack />
            <ToastHost />
            <StatusBar style="auto" />
          </ChatRuntimeProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
