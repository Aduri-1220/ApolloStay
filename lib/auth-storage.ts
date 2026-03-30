import * as SecureStore from "expo-secure-store";

export type SessionUser = {
  id: string;
  publicId?: string;
  email: string;
  name: string;
  createdAt?: string;
};

export type AuthSession = {
  token: string;
  user: SessionUser;
};

const SESSION_KEY = "apollostay-session";

export async function loadStoredSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export async function saveStoredSession(session: AuthSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
