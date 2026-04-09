import { Platform } from "react-native";
import Constants from "expo-constants";
import { AuthSession, SessionUser } from "@/lib/auth-storage";
import { loadStoredSession } from "@/lib/auth-storage";
import {
  CatalogAuditResponse,
  CatalogCompositionPreview,
  AdminCustomFoodReviewMatches,
  AdminCustomFoodReviewQueue,
  DashboardResponse,
  FoodDetail,
  FoodSearchResult,
  HydrationLog,
  MealRecommendationResponse,
  PlannerCandidate,
  PlannerCatalogMeal,
  PlannerFeedbackAction,
  MealPlan,
  MealLog,
  ManualReadingsInput,
  MealScanEstimate,
  MedicalRecord,
  NearbyRestaurantResponse,
  Profile,
  WearableConnectionStatus,
  WearableSnapshot,
  VoiceMealParseResponse,
  WeeklyInsights,
  WorkoutExercise,
  WorkoutLog,
  WorkoutStats
} from "@/lib/types";

const hostedBetaBaseUrl = "https://apollostay-api.onrender.com";

const defaultDevBaseUrl = Platform.select({
  android: "http://10.0.2.2:4000",
  default: "http://127.0.0.1:4000"
});

function extractHost(candidate?: string | null) {
  if (!candidate) {
    return null;
  }

  const trimmed = String(candidate).trim();
  if (!trimmed) {
    return null;
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const [host] = withoutProtocol.split(":");
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return null;
  }
  return host;
}

function resolveExpoHost() {
  const constantsAny = Constants as typeof Constants & {
    expoGoConfig?: { debuggerHost?: string | null };
    manifest2?: { extra?: { expoClient?: { hostUri?: string | null } } };
  };

  const candidates = [
    constantsAny.expoConfig?.hostUri,
    constantsAny.expoGoConfig?.debuggerHost,
    constantsAny.manifest2?.extra?.expoClient?.hostUri
  ];

  for (const candidate of candidates) {
    const host = extractHost(candidate);
    if (host) {
      return host;
    }
  }

  return null;
}

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // Beta/release builds should never fall back to emulator localhost URLs.
  if (!__DEV__) {
    return hostedBetaBaseUrl;
  }

  const expoHost = resolveExpoHost();
  if (expoHost) {
    return `http://${expoHost}:4000`;
  }

  return defaultDevBaseUrl || "http://127.0.0.1:4000";
}

export const apiBaseUrl = resolveApiBaseUrl();
// Render free-tier cold starts can take close to a minute.
const requestTimeoutMs = 65000;

function getSessionHeaders(session?: AuthSession | null) {
  if (!session) {
    return {} as Record<string, string>;
  }

  return {
    "x-user-id": session.user.id,
    "x-session-token": session.token
  } as Record<string, string>;
}

function normalizeErrorText(rawText: string, status?: number) {
  if (!rawText) {
    return status ? `Request failed: ${status}` : "Request failed.";
  }

  try {
    const parsed = JSON.parse(rawText) as { error?: string; message?: string };
    const normalizedMessage =
      [parsed.error, parsed.message].find(
        (value) => typeof value === "string" && value.trim().length > 0
      ) || "";
    return normalizedMessage || (status ? `Request failed: ${status}` : "Request failed.");
  } catch {
    return rawText;
  }
}

async function performRequest<T>(path: string, headers: Record<string, string>, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      const message = normalizeErrorText(await response.text(), response.status);
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    const message = (error as Error)?.message || "";
    if (message === "Aborted" || /abort/i.test(message)) {
      throw new Error(`Server timeout. ApolloStay could not reach the server at ${apiBaseUrl}. Make sure the server is running and your device can open that address in the browser.`);
    }
    if (/network request failed/i.test(message) || /load failed/i.test(message) || /fetch failed/i.test(message)) {
      throw new Error(`Connection issue. ApolloStay could not reach the server at ${apiBaseUrl}. Check that the server is running and your device can open that address in the browser.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await loadStoredSession();
  return performRequest<T>(path, getSessionHeaders(session), init);
}

async function requestWithSession<T>(path: string, session: AuthSession, init?: RequestInit): Promise<T> {
  return performRequest<T>(path, getSessionHeaders(session), init);
}

export function registerWithPassword(input: { email: string; password: string; name?: string }) {
  return request<AuthSession>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function loginWithPassword(input: { email: string; password: string }) {
  return request<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getSessionUser(session: AuthSession) {
  return requestWithSession<{ user: SessionUser }>("/auth/session", session).then((payload) => payload.user);
}

export function logoutCurrentSession(session: AuthSession | null) {
  if (!session) {
    return Promise.resolve({ ok: true });
  }

  return requestWithSession<{ ok: boolean }>("/auth/logout", session, {
    method: "POST"
  });
}

export function getProfile() {
  return request<Profile>("/profile");
}

export function updateProfile(input: Partial<Profile>) {
  return request<Profile>("/profile", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getDashboard(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<DashboardResponse>(`/dashboard${query}`);
}

export function searchFoods(query: string) {
  return request<FoodSearchResult[]>(`/foods/search?q=${encodeURIComponent(query)}`);
}

export function getFoodDetail(fdcId: string) {
  return request<FoodDetail>(`/foods/${fdcId}`);
}

export function getRecentFoods() {
  return request<FoodSearchResult[]>("/foods/recents");
}

export function getFavoriteFoods() {
  return request<FoodSearchResult[]>("/foods/favorites");
}

export function toggleFavoriteFood(fdcId: string) {
  return request<{ favorite: boolean }>("/foods/favorites", {
    method: "POST",
    body: JSON.stringify({ fdcId })
  });
}

export function lookupBarcode(barcode: string) {
  return request<FoodSearchResult>(`/foods/barcode?barcode=${encodeURIComponent(barcode)}`);
}

export function createCustomFood(input: {
  description: string;
  brand?: string;
  barcode?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  gramsPerServing?: number;
  cupWeightGrams?: number;
  pieceWeightGrams?: number;
}) {
  return request<FoodDetail>("/custom-foods", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function analyzeMealScan(input: {
  filename: string;
  mimeType: string;
  contentBase64: string;
}) {
  return request<MealScanEstimate>("/meal-scans/analyze", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function createMealLog(input: {
  fdcId: string;
  mealType: string;
  quantity: number;
  portionUnit?: string;
  consumedAt?: string;
}) {
  return request<MealLog>("/meal-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMealLog(
  logId: string,
  input: {
    fdcId?: string;
    mealType?: string;
    quantity?: number;
    portionUnit?: string;
    consumedAt?: string;
  }
) {
  return request<MealLog>(`/meal-logs/${encodeURIComponent(logId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function deleteMealLog(logId: string) {
  return request<{ deleted: boolean; log: MealLog }>(`/meal-logs/${encodeURIComponent(logId)}`, {
    method: "DELETE"
  });
}

export function addWaterLog(input: { amountMl: number; loggedAt?: string }) {
  return request<HydrationLog>("/hydration-logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deleteWaterLog(logId: string) {
  return request<{ deleted: boolean; log: HydrationLog }>(`/hydration-logs/${encodeURIComponent(logId)}`, {
    method: "DELETE"
  });
}

export function parseVoiceMealLog(input: {
  filename: string;
  mimeType: string;
  contentBase64: string;
}) {
  return request<VoiceMealParseResponse>("/meal-logs/voice", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function parseVoiceMealText(input: { transcript: string }) {
  return request<VoiceMealParseResponse>("/meal-logs/voice/parse-text", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getMedicalRecords(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return request<MedicalRecord[]>(`/medical-records${query}`);
}

export function getMedicalRecord(recordId: string) {
  return request<MedicalRecord>(`/medical-records/${encodeURIComponent(recordId)}`);
}

export function deleteMedicalRecord(recordId: string) {
  return request<{ deleted: boolean; record: MedicalRecord }>(`/medical-records/${encodeURIComponent(recordId)}`, {
    method: "DELETE"
  });
}

export function importMedicalRecord(input: {
  userId: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
}) {
  return request<MedicalRecord>("/medical-records/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateMedicalRecordValues(
  recordId: string,
  extracted: MedicalRecord["extracted"]
) {
  return request<MedicalRecord>(`/medical-records/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ extracted })
  });
}

export function reparseMedicalRecordText(recordId: string, sourceText: string) {
  return request<MedicalRecord>(`/medical-records/${encodeURIComponent(recordId)}/reparse-text`, {
    method: "POST",
    body: JSON.stringify({ sourceText })
  });
}

export function getMealRecommendations(input: { userId: string; userPrompt: string }) {
  return request<MealRecommendationResponse>("/recommendations/meals", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getWeeklyInsights() {
  return request<WeeklyInsights>("/insights/weekly");
}

export function getMealPlans(days = 14) {
  return request<MealPlan[]>(`/meal-plans?days=${encodeURIComponent(String(days))}`);
}

export function getPlannerCatalogMeals() {
  return request<PlannerCatalogMeal[]>("/planner/catalog-meals");
}

export function submitPlannerFeedback(input: {
  action: PlannerFeedbackAction;
  title: string;
  description?: string;
  mealType: string;
  source?: string;
  sourceMealId?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servingSuggestion?: string;
  tags?: string[];
  cuisineTags?: string[];
  nutritionConfidence?: "high" | "medium" | "low";
  recipe?: {
    ingredients: string[];
    instructions: string[];
  } | null;
}) {
  return request<{ ok: boolean; candidateId: string; reviewStatus: string; qualityScore: number }>("/planner/feedback", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getPlannerCandidates() {
  return request<PlannerCandidate[]>("/admin/planner-candidates");
}

export function promotePlannerCandidate(candidateId: string, reviewNotes = "") {
  return request<PlannerCatalogMeal>(`/admin/planner-candidates/${encodeURIComponent(candidateId)}/promote`, {
    method: "POST",
    body: JSON.stringify({ reviewNotes })
  });
}

export function rejectPlannerCandidate(candidateId: string, reviewNotes = "") {
  return request<PlannerCandidate>(`/admin/planner-candidates/${encodeURIComponent(candidateId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reviewNotes })
  });
}

export function generateMealPlan(input: { planDate: string; userPrompt?: string }) {
  return request<MealPlan>("/meal-plans/generate", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function generateMealPlanFromReadings(input: {
  planDate: string;
  userPrompt?: string;
  readings: ManualReadingsInput;
}) {
  return request<MealPlan>("/meal-plans/generate-from-readings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getNearbyRestaurantRecommendations(input: {
  latitude: number;
  longitude: number;
  planDate: string;
  mealType?: string;
  radiusMeters?: number;
}) {
  return request<NearbyRestaurantResponse>("/restaurants/nearby-recommendations", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getWearableStatus() {
  return request<WearableConnectionStatus>("/wearables/status");
}

export function getWearableDeviceData(device: string) {
  return request<WearableSnapshot>(`/wearables/data/${encodeURIComponent(device)}`);
}

export function disconnectWearableDevice(device: string) {
  return request<{ disconnected: boolean; device: string }>(`/wearables/disconnect/${encodeURIComponent(device)}`, {
    method: "DELETE"
  });
}

export function getAdminCustomFoodReviewQueue() {
  return request<AdminCustomFoodReviewQueue>("/admin/custom-foods/review");
}

export function getAdminCustomFoodMatches(foodId: string) {
  return request<AdminCustomFoodReviewMatches>(`/admin/custom-foods/${encodeURIComponent(foodId)}/matches`);
}

export function approveAdminCustomFood(foodId: string, input?: { reviewNotes?: string }) {
  return request(`/admin/custom-foods/${encodeURIComponent(foodId)}/approve`, {
    method: "POST",
    body: JSON.stringify(input || {})
  });
}

export function rejectAdminCustomFood(foodId: string, input?: { reviewNotes?: string }) {
  return request(`/admin/custom-foods/${encodeURIComponent(foodId)}/reject`, {
    method: "POST",
    body: JSON.stringify(input || {})
  });
}

export function mergeAdminCustomFood(foodId: string, input: { targetFoodId: string; reviewNotes?: string }) {
  return request(`/admin/custom-foods/${encodeURIComponent(foodId)}/merge`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getAdminCatalogAudit(input?: { search?: string; offset?: number; limit?: number; onlyNeedingBackfill?: boolean }) {
  const params = new URLSearchParams();
  if (input?.search) {
    params.set("search", input.search);
  }
  if (typeof input?.offset === "number") {
    params.set("offset", String(input.offset));
  }
  if (typeof input?.limit === "number") {
    params.set("limit", String(input.limit));
  }
  if (input?.onlyNeedingBackfill) {
    params.set("onlyNeedingBackfill", "true");
  }
  const query = params.toString();
  return request<CatalogAuditResponse>(`/admin/catalog/audit${query ? `?${query}` : ""}`);
}

export function getAdminCatalogCompositionPreview(catalogId: string) {
  return request<CatalogCompositionPreview>(`/admin/catalog/${encodeURIComponent(catalogId)}/composition-preview`);
}

export function updateAdminCatalogEntry(
  catalogId: string,
  input: {
    sourceNote?: string;
    sourceRefs?: Array<{ kind: string; label: string; configuredPathEnv?: string }>;
    workflowStatus?: string;
    recipeComposition?: Record<string, unknown>;
    changeSummary?: string;
    approve?: boolean;
  }
) {
  return request<FoodDetail>(`/admin/catalog/${encodeURIComponent(catalogId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function getWorkoutStats() {
  return request<WorkoutStats>("/workouts/stats");
}

export function getWorkoutLogs() {
  return request<WorkoutLog[]>("/workouts/logs");
}

export function getWorkoutCategories() {
  return request<string[]>("/workouts/categories");
}

export function getWorkoutExercises(input?: { query?: string; category?: string }) {
  const params = new URLSearchParams();
  if (input?.query) {
    params.set("query", input.query);
  }
  if (input?.category) {
    params.set("category", input.category);
  }
  const query = params.toString();
  return request<WorkoutExercise[]>(`/workouts/exercises${query ? `?${query}` : ""}`);
}

export function createWorkoutLog(input: {
  exerciseId?: string;
  title?: string;
  category?: string;
  durationMinutes: number;
  caloriesBurned?: number | null;
  difficulty?: string;
  equipment?: string;
  muscleGroups?: string[];
  notes?: string;
  performedAt?: string;
}) {
  return request<WorkoutLog>("/workouts/logs", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
