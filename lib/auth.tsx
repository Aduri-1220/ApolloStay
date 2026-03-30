import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { clearStoredSession, loadStoredSession, saveStoredSession, type AuthSession } from "@/lib/auth-storage";
import { getSessionUser, loginWithPassword, logoutCurrentSession, registerWithPassword } from "@/lib/api";

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signUp: (input: { email: string; password: string; name?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const stored = await loadStoredSession();
    if (!stored) {
      setSession(null);
      setLoading(false);
      return;
    }

    try {
      const user = await getSessionUser(stored);
      const next = { ...stored, user };
      setSession(next);
      await saveStoredSession(next);
    } catch {
      await clearStoredSession();
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const signIn = async (input: { email: string; password: string }) => {
    const next = await loginWithPassword(input);
    await saveStoredSession(next);
    setSession(next);
  };

  const signUp = async (input: { email: string; password: string; name?: string }) => {
    const next = await registerWithPassword(input);
    await saveStoredSession(next);
    setSession(next);
  };

  const signOut = async () => {
    try {
      await logoutCurrentSession(session);
    } finally {
      await clearStoredSession();
      setSession(null);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
