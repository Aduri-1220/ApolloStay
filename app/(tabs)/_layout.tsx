import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LoadingCard } from "@/components/AsyncState";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { palette } from "@/lib/theme";

const tabIcon = (name: keyof typeof Ionicons.glyphMap) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );

export default function TabLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <LoadingCard label="Loading your account..." />
      </Screen>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textSubtle,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.border,
          height: 74,
          paddingTop: 8,
          paddingBottom: 10
        },
        sceneStyle: {
          backgroundColor: palette.bg
        }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon("home-outline") }} />
      <Tabs.Screen
        name="nutrition"
        options={{ title: "Nutrition", tabBarIcon: tabIcon("restaurant-outline") }}
      />
      <Tabs.Screen
        name="meal-plans"
        options={{ title: "Plans", tabBarIcon: tabIcon("calendar-outline") }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: "Workouts", tabBarIcon: tabIcon("barbell-outline") }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: "Insights", tabBarIcon: tabIcon("analytics-outline") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: tabIcon("person-outline") }}
      />
    </Tabs>
  );
}
