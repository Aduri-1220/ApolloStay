import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth";

export default function RootLayout() {
  useEffect(() => {
    if (Constants.appOwnership === "expo") {
      return;
    }

    let mounted = true;

    import("expo-notifications")
      .then((Notifications) => {
        if (!mounted) {
          return;
        }

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false
          })
        });
      })
      .catch(() => {
        // Ignore notification setup failures in local/test contexts.
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F8FAFC" },
          animation: "fade"
        }}
      />
    </AuthProvider>
  );
}
