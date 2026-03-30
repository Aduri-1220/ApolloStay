import { Redirect } from "expo-router";
import { LoadingCard } from "@/components/AsyncState";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <LoadingCard label="Restoring your session..." />
      </Screen>
    );
  }

  return <Redirect href={session ? "/onboarding" : "/login"} />;
}
