import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import {
  approveAdminCustomFood,
  deleteMedicalRecord,
  getAdminCatalogAudit,
  getAdminCatalogCompositionPreview,
  getAdminCustomFoodMatches,
  getAdminCustomFoodReviewQueue,
  getPlannerCandidates,
  getMedicalRecords,
  getProfile,
  importMedicalRecord,
  mergeAdminCustomFood,
  promotePlannerCandidate,
  rejectAdminCustomFood,
  rejectPlannerCandidate,
  updateAdminCatalogEntry
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWearableData } from "@/lib/useWearableData";
import {
  AdminCustomFoodReviewItem,
  AdminCustomFoodReviewMatches,
  AdminCustomFoodReviewQueue,
  CatalogAuditItem,
  CatalogAuditResponse,
  CatalogCompositionPreview,
  MedicalRecord,
  PlannerCandidate,
  Profile
} from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [adminQueue, setAdminQueue] = useState<AdminCustomFoodReviewQueue | null>(null);
  const [plannerCandidates, setPlannerCandidates] = useState<PlannerCandidate[] | null>(null);
  const [catalogAudit, setCatalogAudit] = useState<CatalogAuditResponse | null>(null);
  const [catalogPreviews, setCatalogPreviews] = useState<Record<string, CatalogCompositionPreview>>({});
  const [catalogDraftNotes, setCatalogDraftNotes] = useState<Record<string, string>>({});
  const [catalogDraftSourceRefsJson, setCatalogDraftSourceRefsJson] = useState<Record<string, string>>({});
  const [catalogDraftRecipeJson, setCatalogDraftRecipeJson] = useState<Record<string, string>>({});
  const [catalogDraftChangeSummary, setCatalogDraftChangeSummary] = useState<Record<string, string>>({});
  const [catalogDraftYieldSource, setCatalogDraftYieldSource] = useState<Record<string, string>>({});
  const [catalogDraftServingsCount, setCatalogDraftServingsCount] = useState<Record<string, string>>({});
  const [adminMatches, setAdminMatches] = useState<Record<string, AdminCustomFoodReviewMatches>>({});
  const [adminActionFoodId, setAdminActionFoodId] = useState<string | null>(null);
  const [plannerActionCandidateId, setPlannerActionCandidateId] = useState<string | null>(null);
  const [catalogPreviewLoadingId, setCatalogPreviewLoadingId] = useState<string | null>(null);
  const [catalogSavingId, setCatalogSavingId] = useState<string | null>(null);
  const [reviewNotesDrafts, setReviewNotesDrafts] = useState<Record<string, string>>({});
  const [plannerReviewNotesDrafts, setPlannerReviewNotesDrafts] = useState<Record<string, string>>({});
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminFilterMode, setAdminFilterMode] = useState<"all" | "high_usage" | "with_matches">("all");
  const [adminSortMode, setAdminSortMode] = useState<"newest_used" | "highest_usage" | "no_match_first">(
    "newest_used"
  );
  const [plannerSearchQuery, setPlannerSearchQuery] = useState("");
  const [plannerFilterMode, setPlannerFilterMode] = useState<"all" | "review" | "high_signal" | "promoted">("review");
  const [plannerSortMode, setPlannerSortMode] = useState<"quality" | "accepted" | "recent_interest">("quality");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [catalogBackfillOnly, setCatalogBackfillOnly] = useState(false);
  const [catalogFilterMode, setCatalogFilterMode] = useState<"all" | "needs_attention" | "yield_review">("all");
  const [catalogSortMode, setCatalogSortMode] = useState<"attention_first" | "name">("attention_first");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const {
    snapshot,
    status: wearableStatus,
    loading: wearableLoading,
    error: wearableError,
    platformHealthAvailable,
    platformHealthReason,
    connectPlatformHealth,
    refreshPlatformHealth,
    refreshExternalWearable,
    disconnectExternalWearable,
    openWearableOAuth,
    reloadWearableStatus
  } = useWearableData(session?.user.id);

  const statusCounts = records.reduce(
    (accumulator, record) => {
      const key = record.status || "low_confidence";
      accumulator[key] += 1;
      return accumulator;
    },
    { parsed: 0, needs_review: 0, low_confidence: 0 }
  );

  const formatNutritionFlag = (flag: string) => {
    const labels: Record<string, string> = {
      prioritize_lower_glycemic_load: "Lower glycemic load",
      prefer_heart_healthy_fats: "Heart-healthy fats",
      monitor_kidney_friendly_meals: "Kidney-friendly meals",
      prefer_lower_sodium_meals: "Lower sodium meals",
      support_iron_intake: "Support iron intake",
      monitor_thyroid_related_nutrition: "Thyroid-related nutrition"
    };

    return labels[flag] || flag.replace(/_/g, " ");
  };

  const getStatusLabel = (record: MedicalRecord) => {
    if (record.status === "parsed") {
      return "Parsed";
    }
    if (record.status === "needs_review") {
      return "Needs review";
    }
    return "Low confidence";
  };

  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteMedicalRecord(recordId);
      setRecords((current) => current.filter((record) => record.id !== recordId));
      setUploadMessage("Medical record deleted.");
      setError(null);
      loadPageData();
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const loadPageData = useCallback(() => {
    Promise.all([
      getProfile(),
      getMedicalRecords(),
      getAdminCustomFoodReviewQueue().catch((requestError: Error) =>
        /Admin access required/.test(requestError.message) ? null : Promise.reject(requestError)
      ),
      getPlannerCandidates().catch((requestError: Error) =>
        /Admin access required/.test(requestError.message) ? null : Promise.reject(requestError)
      ),
      getAdminCatalogAudit({ limit: 20, onlyNeedingBackfill: catalogBackfillOnly }).catch((requestError: Error) =>
        /Admin access required/.test(requestError.message) ? null : Promise.reject(requestError)
      )
    ])
      .then(([profileResponse, recordsResponse, adminQueueResponse, plannerCandidatesResponse, catalogAuditResponse]) => {
        setProfile(profileResponse);
        setRecords(recordsResponse);
        setAdminQueue(adminQueueResponse);
        setPlannerCandidates(plannerCandidatesResponse);
        setCatalogAudit(catalogAuditResponse);
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [catalogBackfillOnly]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useFocusEffect(
    useCallback(() => {
      loadPageData();
      reloadWearableStatus();
    }, [loadPageData, reloadWearableStatus])
  );

  const handlePickMedicalRecord = async () => {
    if (!profile) {
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ["application/pdf", "image/*", "text/plain"]
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setUploading(true);
    setUploadMessage(null);

    try {
      const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const record = await importMedicalRecord({
        userId: profile.id,
        filename: asset.name || "medical-record",
        mimeType: asset.mimeType || "application/octet-stream",
        contentBase64
      });

      setRecords((current) => [record, ...current]);
      loadPageData();
      setUploadMessage(
        (record.extracted.confidence ?? 0) >= 0.3
          ? "Medical record parsed and saved to your profile."
          : "Record saved, but extraction confidence was low. Try a clearer PDF, images of individual pages, or a stronger fallback parser."
      );
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      setError(null);
      await signOut();
      router.replace("/login");
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSigningOut(false);
    }
  };

  const handleLoadAdminMatches = async (foodId: string) => {
    try {
      const response = await getAdminCustomFoodMatches(foodId);
      setAdminMatches((current) => ({
        ...current,
        [foodId]: response
      }));
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleAdminApprove = async (food: AdminCustomFoodReviewItem) => {
    try {
      setAdminActionFoodId(food.id);
      await approveAdminCustomFood(food.id, {
        reviewNotes: reviewNotesDrafts[food.id]?.trim() || "Approved from in-app admin review."
      });
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setAdminActionFoodId(null);
    }
  };

  const handleAdminReject = async (food: AdminCustomFoodReviewItem) => {
    try {
      setAdminActionFoodId(food.id);
      await rejectAdminCustomFood(food.id, {
        reviewNotes: reviewNotesDrafts[food.id]?.trim() || "Rejected from in-app admin review."
      });
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setAdminActionFoodId(null);
    }
  };

  const handleAdminMerge = async (food: AdminCustomFoodReviewItem, targetFoodId: string) => {
    try {
      setAdminActionFoodId(food.id);
      await mergeAdminCustomFood(food.id, {
        targetFoodId,
        reviewNotes: reviewNotesDrafts[food.id]?.trim() || `Merged from in-app admin review into ${targetFoodId}.`
      });
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setAdminActionFoodId(null);
    }
  };

  const handlePlannerPromote = async (candidate: PlannerCandidate) => {
    try {
      setPlannerActionCandidateId(candidate.id);
      await promotePlannerCandidate(
        candidate.id,
        plannerReviewNotesDrafts[candidate.id]?.trim() || "Promoted from in-app planner candidate review."
      );
      await loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setPlannerActionCandidateId(null);
    }
  };

  const handlePlannerReject = async (candidate: PlannerCandidate) => {
    try {
      setPlannerActionCandidateId(candidate.id);
      await rejectPlannerCandidate(
        candidate.id,
        plannerReviewNotesDrafts[candidate.id]?.trim() || "Rejected from in-app planner candidate review."
      );
      await loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setPlannerActionCandidateId(null);
    }
  };

  const handleLoadCatalogPreview = async (catalogId: string) => {
    try {
      setCatalogPreviewLoadingId(catalogId);
      const response = await getAdminCatalogCompositionPreview(catalogId);
      setCatalogPreviews((current) => ({
        ...current,
        [catalogId]: response
      }));
      const metadata = (response.baseFood.metadata || {}) as Record<string, unknown>;
      const review = (metadata.review || {}) as { sourceRefs?: unknown[] };
      setCatalogDraftSourceRefsJson((current) => ({
        ...current,
        [catalogId]: JSON.stringify(review.sourceRefs || [], null, 2)
      }));
      setCatalogDraftRecipeJson((current) => ({
        ...current,
        [catalogId]: JSON.stringify((metadata.recipeComposition as Record<string, unknown>) || {}, null, 2)
      }));
      setCatalogDraftYieldSource((current) => ({
        ...current,
        [catalogId]:
          String(
            (metadata.recipeComposition as { yieldSource?: string } | undefined)?.yieldSource ||
              response.composition?.yieldSource ||
              "estimated"
          ) || "estimated"
      }));
      setCatalogDraftServingsCount((current) => ({
        ...current,
        [catalogId]:
          String(
            (metadata.recipeComposition as { servingsCount?: number } | undefined)?.servingsCount ||
              response.composition?.servingsCount ||
              ""
          ) || ""
      }));
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setCatalogPreviewLoadingId(null);
    }
  };

  const handleSaveCatalogEntry = async (item: CatalogAuditItem, approve = false) => {
    try {
      setCatalogSavingId(item.id);
      const recipeCompositionDraft = catalogDraftRecipeJson[item.id]?.trim()
        ? JSON.parse(catalogDraftRecipeJson[item.id])
        : {};
      const servingsCountValue = catalogDraftServingsCount[item.id]?.trim();
      const recipeComposition = {
        ...recipeCompositionDraft,
        yieldSource: catalogDraftYieldSource[item.id]?.trim() || recipeCompositionDraft.yieldSource || "estimated",
        ...(servingsCountValue
          ? { servingsCount: Number(servingsCountValue) }
          : { servingsCount: undefined })
      };
      const sourceRefs = catalogDraftSourceRefsJson[item.id]?.trim()
        ? JSON.parse(catalogDraftSourceRefsJson[item.id])
        : undefined;
      await updateAdminCatalogEntry(item.id, {
        sourceNote: catalogDraftNotes[item.id]?.trim() || item.sourceNote,
        sourceRefs,
        recipeComposition,
        workflowStatus: approve ? "approved" : item.workflowStatus,
        changeSummary: catalogDraftChangeSummary[item.id]?.trim() || "Catalog entry updated from admin editor.",
        approve
      });
      await Promise.all([loadPageData(), handleLoadCatalogPreview(item.id)]);
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setCatalogSavingId(null);
    }
  };

  const handleRefreshCatalogAudit = async (offset = 0, append = false) => {
    try {
      const response = await getAdminCatalogAudit({
        search: catalogSearchQuery.trim(),
        offset,
        limit: 20,
        onlyNeedingBackfill: catalogBackfillOnly
      });
      setCatalogAudit((current) =>
        append && current
          ? {
              ...response,
              items: [...current.items, ...response.items]
            }
          : response
      );
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const filteredAdminFoods = useMemo(() => {
    const foods = adminQueue?.foods || [];
    const needle = adminSearchQuery.trim().toLowerCase();

    return foods
      .filter((food) => {
        const matchesSearch =
          !needle ||
          food.description.toLowerCase().includes(needle) ||
          String(food.normalizedName || "").toLowerCase().includes(needle);

        if (!matchesSearch) {
          return false;
        }

        if (adminFilterMode === "high_usage") {
          return Number(food.usageCount || 0) >= Math.max(5, adminQueue?.threshold || 5);
        }

        if (adminFilterMode === "with_matches") {
          return Boolean(adminMatches[food.id]);
        }

        return true;
      })
      .sort((left, right) => {
        if (adminSortMode === "highest_usage") {
          return Number(right.usageCount || 0) - Number(left.usageCount || 0);
        }

        if (adminSortMode === "no_match_first") {
          const leftHasVerifiedMatch = (adminMatches[left.id]?.verifiedMatches.length || 0) > 0 ? 1 : 0;
          const rightHasVerifiedMatch = (adminMatches[right.id]?.verifiedMatches.length || 0) > 0 ? 1 : 0;

          if (leftHasVerifiedMatch !== rightHasVerifiedMatch) {
            return leftHasVerifiedMatch - rightHasVerifiedMatch;
          }

          return Number(right.usageCount || 0) - Number(left.usageCount || 0);
        }

        return new Date(right.lastUsedAt || 0).getTime() - new Date(left.lastUsedAt || 0).getTime();
      });
  }, [adminFilterMode, adminMatches, adminQueue, adminSearchQuery, adminSortMode]);

  const filteredCatalogItems = useMemo(() => {
    const items = catalogAudit?.items || [];

    return items
      .filter((item) => {
        if (catalogFilterMode === "needs_attention") {
          const preview = catalogPreviews[item.id];
          return (
            item.missingExactSourceRefs ||
            /warning|incomplete|invalid/.test(item.recipeCompositionStatus || "") ||
            Boolean(preview?.composition?.validation.warnings.length) ||
            Boolean(preview?.composition?.validation.errors.length)
          );
        }

        if (catalogFilterMode === "yield_review") {
          const preview = catalogPreviews[item.id];
          return (
            /soup|dal|curry|grain/.test(preview?.composition?.recipeType || "") ||
            /soup|rasam|dal|dhal|sambar|sambhar|curry|stew|rice|khichdi|biryani|pulao|upma/i.test(item.description)
          );
        }

        return true;
      })
      .sort((left, right) => {
        if (catalogSortMode === "name") {
          return left.description.localeCompare(right.description);
        }

        const leftPreview = catalogPreviews[left.id];
        const rightPreview = catalogPreviews[right.id];
        const leftAttention =
          Number(left.missingExactSourceRefs) +
          (/invalid/.test(left.recipeCompositionStatus || "") ? 4 : 0) +
          (/incomplete/.test(left.recipeCompositionStatus || "") ? 3 : 0) +
          (/warning/.test(left.recipeCompositionStatus || "") ? 2 : 0) +
          (leftPreview?.composition?.nutritionConfidence === "low" ? 2 : 0) +
          (leftPreview?.composition?.validation.warnings.length || 0) +
          (leftPreview?.composition?.validation.errors.length || 0);
        const rightAttention =
          Number(right.missingExactSourceRefs) +
          (/invalid/.test(right.recipeCompositionStatus || "") ? 4 : 0) +
          (/incomplete/.test(right.recipeCompositionStatus || "") ? 3 : 0) +
          (/warning/.test(right.recipeCompositionStatus || "") ? 2 : 0) +
          (rightPreview?.composition?.nutritionConfidence === "low" ? 2 : 0) +
          (rightPreview?.composition?.validation.warnings.length || 0) +
          (rightPreview?.composition?.validation.errors.length || 0);

        if (leftAttention !== rightAttention) {
          return rightAttention - leftAttention;
        }

        if (left.missingExactSourceRefs !== right.missingExactSourceRefs) {
          return Number(left.missingExactSourceRefs) - Number(right.missingExactSourceRefs);
        }
        if (left.recipeIngredientCount !== right.recipeIngredientCount) {
          return right.recipeIngredientCount - left.recipeIngredientCount;
        }
        return left.description.localeCompare(right.description);
      });
  }, [catalogAudit, catalogFilterMode, catalogPreviews, catalogSortMode]);

  const filteredPlannerCandidates = useMemo(() => {
    const candidates = plannerCandidates || [];
    const needle = plannerSearchQuery.trim().toLowerCase();

    return candidates
      .filter((candidate) => {
        const matchesSearch =
          !needle ||
          candidate.title.toLowerCase().includes(needle) ||
          candidate.description.toLowerCase().includes(needle) ||
          candidate.mealType.toLowerCase().includes(needle) ||
          candidate.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
          candidate.cuisineTags.some((tag) => tag.toLowerCase().includes(needle));

        if (!matchesSearch) {
          return false;
        }

        if (plannerFilterMode === "review") {
          return candidate.status === "review";
        }

        if (plannerFilterMode === "high_signal") {
          return candidate.qualityScore >= 6 || candidate.acceptedCount + candidate.loggedCount >= 3;
        }

        if (plannerFilterMode === "promoted") {
          return candidate.status === "promoted";
        }

        return true;
      })
      .sort((left, right) => {
        if (plannerSortMode === "accepted") {
          if (right.acceptedCount !== left.acceptedCount) {
            return right.acceptedCount - left.acceptedCount;
          }
          return right.loggedCount - left.loggedCount;
        }

        if (plannerSortMode === "recent_interest") {
          const leftSignals = left.acceptedCount + left.passedCount + left.loggedCount;
          const rightSignals = right.acceptedCount + right.passedCount + right.loggedCount;
          if (rightSignals !== leftSignals) {
            return rightSignals - leftSignals;
          }
          return right.uniqueUserCount - left.uniqueUserCount;
        }

        if (right.qualityScore !== left.qualityScore) {
          return right.qualityScore - left.qualityScore;
        }
        if (right.acceptedCount !== left.acceptedCount) {
          return right.acceptedCount - left.acceptedCount;
        }
        return right.loggedCount - left.loggedCount;
      });
  }, [plannerCandidates, plannerFilterMode, plannerSearchQuery, plannerSortMode]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <LoadingCard label="Loading profile..." /> : null}
        {error ? <ErrorCard message={error} /> : null}

        {profile ? (
          <>
            <View style={styles.headerCard}>
              <View style={styles.headerTopRow}>
                <View style={styles.headerIdentity}>
                  <Text style={styles.name}>{profile.name || session?.user.name || "ApolloStay user"}</Text>
                  <Text style={styles.email}>{profile.email}</Text>
                </View>
                <Pressable onPress={() => router.push("/onboarding?mode=edit")} style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit profile</Text>
                </Pressable>
              </View>
              <Text style={styles.goal}>
                Goal: {profile.healthGoals.length > 0 ? profile.healthGoals.join(", ") : "Not set"}
              </Text>
              <View style={styles.userIdBadge}>
                <Text style={styles.userIdLabel}>User ID</Text>
                <Text style={styles.userIdValue}>{session?.user.publicId || profile.publicId || session?.user.id || profile.id}</Text>
              </View>
              <Text style={styles.plan}>
                {profile.onboardingCompleted ? "Saved to your ApolloStay profile" : "Complete your onboarding to personalise your plan"}
              </Text>
              <Pressable onPress={handleSignOut} style={styles.logoutButton}>
                <Text style={styles.logoutText}>{signingOut ? "Logging out..." : "Log out"}</Text>
              </Pressable>
            </View>

            <View style={styles.metricRow}>
              <MetricCard label="Age" value={profile.age ? `${profile.age}` : "Unavailable"} />
              <MetricCard label="Height" value={`${profile.heightCm} cm`} />
              <MetricCard label="Weight" value={`${profile.weightKg} kg`} />
              <MetricCard label="Target weight" value={`${profile.targetWeightKg} kg`} />
              <MetricCard label="BMI" value={profile.bmi ? `${profile.bmi}` : "Unavailable"} />
              <MetricCard label="Calories" value={`${profile.dailyCalorieTarget} kcal`} />
            </View>

            <View style={styles.settings}>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Health profile</Text>
                <Text style={styles.settingsItemText}>Gender: {profile.gender}</Text>
                <Text style={styles.settingsItemText}>Activity level: {profile.activityLevel}</Text>
                <Text style={styles.settingsItemText}>
                  Dietary preferences: {profile.dietaryPreferences.join(", ") || "None specified"}
                </Text>
                <Text style={styles.settingsItemText}>
                  Allergies: {profile.allergies.join(", ") || "None specified"}
                </Text>
                <Text style={styles.settingsItemText}>
                  Medical conditions: {profile.medicalConditions.join(", ") || "None specified"}
                </Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Latest clinical metrics from reports</Text>
                <Text style={styles.settingsItemText}>
                  These values come from the most recent successfully parsed medical records and help inform meal suggestions and health insights.
                </Text>
                <View style={styles.metricRow}>
                  <MetricCard
                    label="Blood pressure"
                    value={profile.clinicalMetrics?.bloodPressure?.value || "No report value"}
                    detail={profile.clinicalMetrics?.bloodPressure?.observedAt || "Upload a report"}
                  />
                  <MetricCard
                    label="Blood glucose"
                    value={profile.clinicalMetrics?.bloodGlucose?.value || "No report value"}
                    detail={profile.clinicalMetrics?.bloodGlucose?.observedAt || "Upload a report"}
                  />
                  <MetricCard
                    label="Heart rate"
                    value={profile.clinicalMetrics?.heartRate?.value || "No report value"}
                    detail={profile.clinicalMetrics?.heartRate?.observedAt || "Upload a report"}
                  />
                  <MetricCard
                    label="Hemoglobin"
                    value={profile.clinicalMetrics?.hemoglobin?.value || "No report value"}
                    detail={profile.clinicalMetrics?.hemoglobin?.observedAt || "Upload a report"}
                  />
                </View>
                <Text style={styles.settingsItemText}>
                  Report-derived conditions: {profile.clinicalMetrics?.reportDerivedConditions?.join(", ") || "None detected yet"}
                </Text>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Wearable sync</Text>
                <Text style={styles.settingsItemText}>
                  Bring in steps, sleep, and recovery data from your phone health store or supported wearable providers.
                </Text>
                <View style={styles.metricRow}>
                  <MetricCard label="Connected" value={`${wearableStatus.connectedDevices.length}`} detail={wearableStatus.connectedDevices.join(", ") || "No devices"} />
                  <MetricCard label="Steps" value={snapshot.steps === null ? "--" : `${snapshot.steps}`} detail={snapshot.lastSyncedAt || "No sync yet"} />
                  <MetricCard label="Sleep" value={snapshot.sleepHours === null ? "--" : `${snapshot.sleepHours} h`} detail={snapshot.source || "No source"} />
                </View>
                {wearableError ? <ErrorCard message={wearableError} /> : null}
                <View style={styles.recordActions}>
                  <PrimaryButton
                    label={wearableLoading ? "Refreshing..." : "Refresh phone health"}
                    onPress={() => {
                      if (platformHealthAvailable) {
                        refreshPlatformHealth(true);
                      } else {
                        connectPlatformHealth();
                      }
                    }}
                  />
                  <Pressable
                    onPress={() => openWearableOAuth("polar")}
                    style={styles.reviewButton}
                  >
                    <Text style={styles.reviewButtonText}>Connect Polar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openWearableOAuth("whoop")}
                    style={styles.reviewButton}
                  >
                    <Text style={styles.reviewButtonText}>Connect Whoop</Text>
                  </Pressable>
                </View>
                <Text style={styles.settingsItemText}>
                  {platformHealthAvailable
                    ? "Phone health sync is available on this device."
                    : platformHealthReason}
                </Text>
                {wearableStatus.connectedDevices.length > 0 ? (
                  <View style={styles.recordActions}>
                    {wearableStatus.connectedDevices.map((device) => (
                      <Pressable
                        key={device}
                        onPress={() => refreshExternalWearable(device)}
                        style={styles.reviewButton}
                      >
                        <Text style={styles.reviewButtonText}>Refresh {device}</Text>
                      </Pressable>
                    ))}
                    {wearableStatus.connectedDevices.map((device) => (
                      <Pressable
                        key={`${device}-disconnect`}
                        onPress={() => disconnectExternalWearable(device)}
                        style={styles.deleteRecordButton}
                      >
                        <Text style={styles.deleteRecordButtonText}>Disconnect {device}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Medical records</Text>
                <Text style={styles.settingsItemText}>
                  Upload lab reports, prescriptions, or discharge summaries. Parsed values will be saved under your user
                  ID and used for future meal recommendations.
                </Text>
                {uploading ? <LoadingCard label="Uploading and parsing your document..." /> : null}
                <PrimaryButton label="Upload medical record" onPress={handlePickMedicalRecord} />
                {uploadMessage ? <Text style={styles.successText}>{uploadMessage}</Text> : null}
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Account actions</Text>
                <Text style={styles.settingsItemText}>
                  You are signed in as {session?.user.email || profile.email}. Use this button to sign out of the app.
                </Text>
                <Pressable onPress={handleSignOut} style={styles.logoutButtonLarge}>
                  <Text style={styles.logoutButtonLargeText}>{signingOut ? "Logging out..." : "Log out"}</Text>
                </Pressable>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsTitle}>Parsed record history</Text>
                <View style={styles.metricRow}>
                  <MetricCard label="Parsed" value={`${statusCounts.parsed}`} />
                  <MetricCard label="Needs review" value={`${statusCounts.needs_review}`} />
                  <MetricCard label="Low confidence" value={`${statusCounts.low_confidence}`} />
                </View>
                {records.length === 0 ? (
                  <EmptyCard
                    title="No medical records yet"
                    detail="Once you upload a report, the extracted diagnoses, medications, vitals, and lab values will appear here."
                  />
                ) : (
                  records.map((record, recordIndex) => (
                    <View key={`${record.id}-${record.uploadedAt}-${recordIndex}`} style={styles.recordCard}>
                      <Text style={styles.recordTitle}>{record.filename}</Text>
                      <Text style={styles.settingsItemText}>Uploaded: {new Date(record.uploadedAt).toLocaleString()}</Text>
                      <Text style={styles.settingsItemText}>
                        Record date: {record.extracted.recordDate || "Unavailable in document"}
                      </Text>
                      <Text style={styles.parserBadge}>
                        {getStatusLabel(record)} · {(record.extracted.provider || "local").toUpperCase()} · {Math.round((record.extracted.confidence ?? 0) * 100)}%
                      </Text>
                      <Text style={styles.settingsItemText}>
                        Open this record to see diagnoses, medications, vitals, and lab readings.
                      </Text>
                      <View style={styles.recordActions}>
                        <Pressable
                          onPress={() => router.push(`/medical-record/${record.id}`)}
                          style={styles.reviewButton}
                        >
                          <Text style={styles.reviewButtonText}>Open record</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteRecord(record.id)}
                          style={styles.deleteRecordButton}
                        >
                          <Text style={styles.deleteRecordButtonText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {adminQueue ? (
                <View style={styles.settingsCard}>
                  <Text style={styles.settingsTitle}>Admin custom food review</Text>
                  <Text style={styles.settingsItemText}>
                    {adminQueue.pendingCount} food(s) are waiting for review. Foods enter this queue after repeated real usage so you can approve, reject, or merge them.
                  </Text>
                  <View style={styles.metricRow}>
                    <MetricCard label="Pending" value={`${adminQueue.pendingCount}`} />
                    <MetricCard label="Threshold" value={`${adminQueue.threshold} logs`} />
                  </View>
                  <TextInput
                    value={adminSearchQuery}
                    onChangeText={setAdminSearchQuery}
                    placeholder="Search review queue"
                    placeholderTextColor={palette.textSubtle}
                    style={styles.reviewSearchInput}
                  />
                  <View style={styles.recordActions}>
                    {[
                      ["all", "All"],
                      ["high_usage", "High usage"],
                      ["with_matches", "Loaded matches"]
                    ].map(([mode, label]) => {
                      const selected = adminFilterMode === mode;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => setAdminFilterMode(mode as "all" | "high_usage" | "with_matches")}
                          style={[styles.filterChip, selected && styles.filterChipActive]}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.adminSortRow}>
                    <Text style={styles.adminSortLabel}>Sort by</Text>
                    <View style={styles.recordActions}>
                      {[
                        ["newest_used", "Newest used"],
                        ["highest_usage", "Highest usage"],
                        ["no_match_first", "No match first"]
                      ].map(([mode, label]) => {
                        const selected = adminSortMode === mode;
                        return (
                          <Pressable
                            key={mode}
                            onPress={() =>
                              setAdminSortMode(mode as "newest_used" | "highest_usage" | "no_match_first")
                            }
                            style={[styles.filterChip, selected && styles.filterChipActive]}
                          >
                            <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {adminQueue.foods.length === 0 ? (
                    <EmptyCard title="No foods waiting" detail="Once custom foods cross the review threshold, they will appear here." />
                  ) : filteredAdminFoods.length === 0 ? (
                    <EmptyCard title="No foods match" detail="Try a different search, filter, or sort combination." />
                  ) : (
                    filteredAdminFoods.map((food) => {
                      const matches = adminMatches[food.id];
                      const busy = adminActionFoodId === food.id;
                      return (
                        <View key={food.id} style={styles.adminReviewCard}>
                          <View style={styles.adminReviewHeader}>
                            <View style={styles.adminReviewCopy}>
                              <Text style={styles.recordTitle}>{food.description}</Text>
                              <Text style={styles.settingsItemText}>Normalized: {food.normalizedName || "n/a"}</Text>
                              <Text style={styles.settingsItemText}>
                                Used {food.usageCount} times · Last used {food.lastUsedAt ? new Date(food.lastUsedAt).toLocaleString() : "Never"}
                              </Text>
                            </View>
                            <View style={styles.adminReviewBadge}>
                              <Text style={styles.adminReviewBadgeText}>{food.promotionStatus}</Text>
                            </View>
                          </View>
                          <View style={styles.metricRow}>
                            <MetricCard label="Calories" value={`${food.nutrientsPer100g.calories ?? "--"}`} detail="per 100g" />
                            <MetricCard label="Protein" value={`${food.nutrientsPer100g.protein ?? "--"} g`} />
                            <MetricCard label="Carbs" value={`${food.nutrientsPer100g.carbs ?? "--"} g`} />
                            <MetricCard label="Fat" value={`${food.nutrientsPer100g.fat ?? "--"} g`} />
                          </View>
                          {food.reviewNotes ? <Text style={styles.settingsItemText}>Notes: {food.reviewNotes}</Text> : null}
                          <TextInput
                            value={reviewNotesDrafts[food.id] ?? food.reviewNotes ?? ""}
                            onChangeText={(value) =>
                              setReviewNotesDrafts((current) => ({
                                ...current,
                                [food.id]: value
                              }))
                            }
                            placeholder="Add admin review note"
                            placeholderTextColor={palette.textSubtle}
                            multiline
                            style={styles.reviewNotesInput}
                          />
                          <View style={styles.recordActions}>
                            <Pressable onPress={() => handleLoadAdminMatches(food.id)} style={styles.reviewButton}>
                              <Text style={styles.reviewButtonText}>{matches ? "Refresh matches" : "Find matches"}</Text>
                            </Pressable>
                            <Pressable onPress={() => handleAdminApprove(food)} style={styles.reviewButton} disabled={busy}>
                              <Text style={styles.reviewButtonText}>{busy ? "Working..." : "Approve"}</Text>
                            </Pressable>
                            <Pressable onPress={() => handleAdminReject(food)} style={styles.deleteRecordButton} disabled={busy}>
                              <Text style={styles.deleteRecordButtonText}>Reject</Text>
                            </Pressable>
                          </View>
                          {matches ? (
                            <View style={styles.adminMatchesWrap}>
                              <Text style={styles.adminMatchesTitle}>Verified source matches</Text>
                              {matches.verifiedMatches.length > 0 ? (
                                matches.verifiedMatches.slice(0, 4).map((match) => (
                                  <View key={match.fdcId} style={styles.adminMatchRow}>
                                    <View style={styles.adminMatchCopy}>
                                      <Text style={styles.adminMatchTitle}>{match.description}</Text>
                                      <Text style={styles.adminMatchMeta}>{match.source || "source"} · {match.dataType}</Text>
                                    </View>
                                    <Pressable
                                      onPress={() => handleAdminMerge(food, match.fdcId)}
                                      style={styles.ghostActionButton}
                                      disabled={busy}
                                    >
                                      <Text style={styles.ghostActionButtonText}>Map</Text>
                                    </Pressable>
                                  </View>
                                ))
                              ) : (
                                <Text style={styles.settingsItemText}>No verified source matches found yet.</Text>
                              )}
                              <Text style={styles.adminMatchesTitle}>Duplicate custom foods</Text>
                              {matches.duplicateCandidates.length > 0 ? (
                                matches.duplicateCandidates.slice(0, 4).map((match) => (
                                  <View key={match.id} style={styles.adminMatchRow}>
                                    <View style={styles.adminMatchCopy}>
                                      <Text style={styles.adminMatchTitle}>{match.description}</Text>
                                      <Text style={styles.adminMatchMeta}>
                                        {match.usageCount} logs · {match.promotionStatus}
                                      </Text>
                                    </View>
                                    <Pressable
                                      onPress={() => handleAdminMerge(food, `custom-${match.id}`)}
                                      style={styles.ghostActionButton}
                                      disabled={busy}
                                    >
                                      <Text style={styles.ghostActionButtonText}>Merge</Text>
                                    </Pressable>
                                  </View>
                                ))
                              ) : (
                                <Text style={styles.settingsItemText}>No duplicate custom foods detected.</Text>
                              )}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {plannerCandidates ? (
                <View style={styles.settingsCard}>
                  <Text style={styles.settingsTitle}>Admin planner candidate review</Text>
                  <Text style={styles.settingsItemText}>
                    Promote strong meal candidates discovered from trusted datasets plus real user planner feedback. Only reviewed promotions become part of the polished planner library.
                  </Text>
                  <View style={styles.metricRow}>
                    <MetricCard label="Candidates" value={`${plannerCandidates.length}`} />
                    <MetricCard
                      label="Needs review"
                      value={`${plannerCandidates.filter((candidate) => candidate.status === "review").length}`}
                    />
                    <MetricCard
                      label="Promoted"
                      value={`${plannerCandidates.filter((candidate) => candidate.status === "promoted").length}`}
                    />
                  </View>
                  <TextInput
                    value={plannerSearchQuery}
                    onChangeText={setPlannerSearchQuery}
                    placeholder="Search planner candidates"
                    placeholderTextColor={palette.textSubtle}
                    style={styles.reviewSearchInput}
                  />
                  <View style={styles.recordActions}>
                    {[
                      ["review", "Needs review"],
                      ["high_signal", "High signal"],
                      ["promoted", "Promoted"],
                      ["all", "All"]
                    ].map(([mode, label]) => {
                      const selected = plannerFilterMode === mode;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() =>
                            setPlannerFilterMode(mode as "all" | "review" | "high_signal" | "promoted")
                          }
                          style={[styles.filterChip, selected && styles.filterChipActive]}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.adminSortRow}>
                    <Text style={styles.adminSortLabel}>Sort by</Text>
                    <View style={styles.recordActions}>
                      {[
                        ["quality", "Quality"],
                        ["accepted", "Accepted"],
                        ["recent_interest", "Recent interest"]
                      ].map(([mode, label]) => {
                        const selected = plannerSortMode === mode;
                        return (
                          <Pressable
                            key={mode}
                            onPress={() =>
                              setPlannerSortMode(mode as "quality" | "accepted" | "recent_interest")
                            }
                            style={[styles.filterChip, selected && styles.filterChipActive]}
                          >
                            <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {filteredPlannerCandidates.length === 0 ? (
                    <EmptyCard
                      title="No planner candidates match"
                      detail="Try a different search, filter, or sort combination."
                    />
                  ) : (
                    filteredPlannerCandidates.map((candidate) => {
                      const busy = plannerActionCandidateId === candidate.id;
                      return (
                        <View key={candidate.id} style={styles.adminReviewCard}>
                          <View style={styles.adminReviewHeader}>
                            <View style={styles.adminReviewCopy}>
                              <Text style={styles.recordTitle}>{candidate.title}</Text>
                              <Text style={styles.settingsItemText}>
                                {candidate.mealType} · {candidate.source} · {candidate.nutritionConfidence} confidence
                              </Text>
                              <Text style={styles.settingsItemText}>{candidate.description}</Text>
                            </View>
                            <View style={styles.adminReviewBadge}>
                              <Text style={styles.adminReviewBadgeText}>{candidate.status}</Text>
                            </View>
                          </View>
                          <View style={styles.metricRow}>
                            <MetricCard label="Calories" value={`${candidate.calories || "--"} kcal`} />
                            <MetricCard label="Protein" value={`${candidate.protein || "--"} g`} />
                            <MetricCard label="Accepted" value={`${candidate.acceptedCount}`} />
                            <MetricCard label="Logged" value={`${candidate.loggedCount}`} />
                            <MetricCard label="Passed" value={`${candidate.passedCount}`} />
                            <MetricCard label="Quality" value={`${candidate.qualityScore}`} />
                          </View>
                          <Text style={styles.settingsItemText}>
                            Serving: {candidate.servingSuggestion || "Not specified"} · Users: {candidate.uniqueUserCount}
                          </Text>
                          <View style={styles.catalogTagWrap}>
                            {[...candidate.tags, ...candidate.cuisineTags].slice(0, 8).map((tag) => (
                              <View key={`${candidate.id}-${tag}`} style={styles.catalogTagChip}>
                                <Text style={styles.catalogTagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                          <TextInput
                            value={plannerReviewNotesDrafts[candidate.id] ?? ""}
                            onChangeText={(value) =>
                              setPlannerReviewNotesDrafts((current) => ({
                                ...current,
                                [candidate.id]: value
                              }))
                            }
                            placeholder="Add planner review note"
                            placeholderTextColor={palette.textSubtle}
                            multiline
                            style={styles.reviewNotesInput}
                          />
                          <View style={styles.recordActions}>
                            <Pressable
                              onPress={() => handlePlannerPromote(candidate)}
                              style={styles.reviewButton}
                              disabled={busy}
                            >
                              <Text style={styles.reviewButtonText}>{busy ? "Working..." : "Promote"}</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handlePlannerReject(candidate)}
                              style={styles.deleteRecordButton}
                              disabled={busy}
                            >
                              <Text style={styles.deleteRecordButtonText}>Reject</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {catalogAudit ? (
                <View style={styles.settingsCard}>
                  <Text style={styles.settingsTitle}>Admin catalog audit</Text>
                  <Text style={styles.settingsItemText}>
                    Review which catalog meals already have recipe composition, which still need exact source backfill, and preview composed nutrition before trusting wider rollout.
                  </Text>
                  <View style={styles.metricRow}>
                    <MetricCard label="Catalog items" value={`${catalogAudit.totalCount}`} />
                    <MetricCard label="Need backfill" value={`${catalogAudit.missingExactSourceRefsCount}`} />
                  </View>
                  <TextInput
                    value={catalogSearchQuery}
                    onChangeText={setCatalogSearchQuery}
                    placeholder="Search catalog audit"
                    placeholderTextColor={palette.textSubtle}
                    style={styles.reviewSearchInput}
                  />
                  <View style={styles.recordActions}>
                    <Pressable onPress={() => setCatalogBackfillOnly((current) => !current)} style={[styles.filterChip, catalogBackfillOnly && styles.filterChipActive]}>
                      <Text style={[styles.filterChipText, catalogBackfillOnly && styles.filterChipTextActive]}>
                        {catalogBackfillOnly ? "Backfill only" : "All catalog"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCatalogFilterMode("all")}
                      style={[styles.filterChip, catalogFilterMode === "all" && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, catalogFilterMode === "all" && styles.filterChipTextActive]}>
                        All
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCatalogFilterMode("needs_attention")}
                      style={[styles.filterChip, catalogFilterMode === "needs_attention" && styles.filterChipActive]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          catalogFilterMode === "needs_attention" && styles.filterChipTextActive
                        ]}
                      >
                        Needs attention
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCatalogFilterMode("yield_review")}
                      style={[styles.filterChip, catalogFilterMode === "yield_review" && styles.filterChipActive]}
                    >
                      <Text
                        style={[styles.filterChipText, catalogFilterMode === "yield_review" && styles.filterChipTextActive]}
                      >
                        Yield review
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.recordActions}>
                    <Pressable
                      onPress={() => setCatalogSortMode("attention_first")}
                      style={[styles.filterChip, catalogSortMode === "attention_first" && styles.filterChipActive]}
                    >
                      <Text
                        style={[styles.filterChipText, catalogSortMode === "attention_first" && styles.filterChipTextActive]}
                      >
                        Attention first
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setCatalogSortMode("name")}
                      style={[styles.filterChip, catalogSortMode === "name" && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, catalogSortMode === "name" && styles.filterChipTextActive]}>
                        Name
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => handleRefreshCatalogAudit(0, false)} style={styles.reviewButton}>
                      <Text style={styles.reviewButtonText}>Refresh audit</Text>
                    </Pressable>
                  </View>
                  {filteredCatalogItems.length === 0 ? (
                    <EmptyCard title="No catalog items match" detail="Try a different search query." />
                  ) : (
                    filteredCatalogItems.map((item: CatalogAuditItem) => {
                      const preview = catalogPreviews[item.id];
                      const busy = catalogPreviewLoadingId === item.id;
                      return (
                        <View key={item.id} style={styles.adminReviewCard}>
                          <View style={styles.adminReviewHeader}>
                            <View style={styles.adminReviewCopy}>
                              <Text style={styles.recordTitle}>{item.description}</Text>
                              <Text style={styles.settingsItemText}>
                                {item.mealType || "Meal"} · {item.cuisine.join(", ") || "Unspecified cuisine"}
                              </Text>
                              <Text style={styles.settingsItemText}>
                                Composition: {item.recipeCompositionStatus} · Ingredients: {item.recipeIngredientCount}
                              </Text>
                            </View>
                            <View style={styles.adminReviewBadge}>
                              <Text style={styles.adminReviewBadgeText}>
                                {item.missingExactSourceRefs ? "needs backfill" : "source-backed"}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.settingsItemText}>
                            Trust: {item.nutritionTrustLevel || "n/a"} · Method: {item.nutritionMethod || "n/a"}
                          </Text>
                          <TextInput
                            value={catalogDraftNotes[item.id] ?? item.sourceNote}
                            onChangeText={(value) =>
                              setCatalogDraftNotes((current) => ({
                                ...current,
                                [item.id]: value
                              }))
                            }
                            placeholder="Catalog source note"
                            placeholderTextColor={palette.textSubtle}
                            multiline
                            style={styles.reviewNotesInput}
                          />
                          <View style={styles.catalogTagWrap}>
                            {item.tags.slice(0, 6).map((tag) => (
                              <View key={`${item.id}-${tag}`} style={styles.catalogTagChip}>
                                <Text style={styles.catalogTagText}>{tag}</Text>
                              </View>
                            ))}
                          </View>
                          <Pressable
                            onPress={() => handleLoadCatalogPreview(item.id)}
                            style={styles.reviewButton}
                            disabled={busy}
                          >
                            <Text style={styles.reviewButtonText}>
                              {busy ? "Loading preview..." : preview ? "Refresh composition preview" : "Load composition preview"}
                            </Text>
                          </Pressable>
                          <View style={styles.adminSortRow}>
                            <Text style={styles.adminSortLabel}>Yield source</Text>
                            <View style={styles.recordActions}>
                              {["user_reported", "estimated", "inferred_from_servings", "defaulted"].map((option) => {
                                const selected = (catalogDraftYieldSource[item.id] || "estimated") === option;
                                return (
                                  <Pressable
                                    key={`${item.id}-${option}`}
                                    onPress={() =>
                                      setCatalogDraftYieldSource((current) => ({
                                        ...current,
                                        [item.id]: option
                                      }))
                                    }
                                    style={[styles.filterChip, selected ? styles.filterChipActive : null]}
                                  >
                                    <Text style={[styles.filterChipText, selected ? styles.filterChipTextActive : null]}>
                                      {option.replace(/_/g, " ")}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                          <TextInput
                            value={catalogDraftServingsCount[item.id] ?? ""}
                            onChangeText={(value) =>
                              setCatalogDraftServingsCount((current) => ({
                                ...current,
                                [item.id]: value
                              }))
                            }
                            placeholder="Servings count"
                            placeholderTextColor={palette.textSubtle}
                            keyboardType="decimal-pad"
                            style={styles.reviewSearchInput}
                          />
                          <TextInput
                            value={catalogDraftRecipeJson[item.id] ?? ""}
                            onChangeText={(value) =>
                              setCatalogDraftRecipeJson((current) => ({
                                ...current,
                                [item.id]: value
                              }))
                            }
                            placeholder="Recipe composition JSON"
                            placeholderTextColor={palette.textSubtle}
                            multiline
                            style={styles.catalogJsonInput}
                          />
                          <TextInput
                            value={catalogDraftSourceRefsJson[item.id] ?? ""}
                            onChangeText={(value) =>
                              setCatalogDraftSourceRefsJson((current) => ({
                                ...current,
                                [item.id]: value
                              }))
                            }
                            placeholder="Source refs JSON"
                            placeholderTextColor={palette.textSubtle}
                            multiline
                            style={styles.catalogSourceJsonInput}
                          />
                          <TextInput
                            value={catalogDraftChangeSummary[item.id] ?? ""}
                            onChangeText={(value) =>
                              setCatalogDraftChangeSummary((current) => ({
                                ...current,
                                [item.id]: value
                              }))
                            }
                            placeholder="Change summary for version history"
                            placeholderTextColor={palette.textSubtle}
                            style={styles.reviewSearchInput}
                          />
                          <View style={styles.recordActions}>
                            <Pressable
                              onPress={() => handleSaveCatalogEntry(item, false)}
                              style={styles.reviewButton}
                              disabled={catalogSavingId === item.id}
                            >
                              <Text style={styles.reviewButtonText}>
                                {catalogSavingId === item.id ? "Saving..." : "Save draft"}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleSaveCatalogEntry(item, true)}
                              style={styles.ghostActionButton}
                              disabled={catalogSavingId === item.id}
                            >
                              <Text style={styles.ghostActionButtonText}>Approve version</Text>
                            </Pressable>
                          </View>
                          {preview?.composition ? (
                            <View style={styles.adminMatchesWrap}>
                              <Text style={styles.adminMatchesTitle}>Composition preview</Text>
                              <View style={styles.metricRow}>
                                <MetricCard
                                  label="Recipe total"
                                  value={`${preview.composition.recipeTotals.calories ?? "--"} kcal`}
                                  detail={`${preview.composition.recipeTotals.weight_g ?? "--"} g cooked yield`}
                                />
                                <MetricCard
                                  label="Per 100g"
                                  value={`${preview.composition.composedPer100g?.calories ?? "--"} kcal`}
                                  detail={`${preview.composition.composedPer100g?.protein ?? "--"} g protein`}
                                />
                                <MetricCard
                                  label="Per serving"
                                  value={`${preview.composition.composedPerServing?.calories ?? "--"} kcal`}
                                  detail={`${preview.composition.servingWeightGrams || "--"} g serving`}
                                />
                              </View>
                              <Text style={styles.adminMatchMeta}>
                                {preview.composition.recipeType} · yield {preview.composition.yieldSource} · confidence{" "}
                                {preview.composition.nutritionConfidence} ·{" "}
                                {preview.composition.servingsCount ? `${preview.composition.servingsCount} servings` : "servings unknown"}
                              </Text>
                              {preview.composition.validation.errors.length > 0 ? (
                                <Text style={styles.catalogErrorText}>
                                  Errors: {preview.composition.validation.errors.join(" | ")}
                                </Text>
                              ) : null}
                              {preview.composition.validation.warnings.length > 0 ? (
                                <Text style={styles.catalogWarningText}>
                                  Warnings: {preview.composition.validation.warnings.join(" | ")}
                                </Text>
                              ) : null}
                              {preview.composition.ingredientBreakdown.map((ingredient) => (
                                <View key={`${item.id}-${ingredient.label}`} style={styles.adminMatchRow}>
                                  <View style={styles.adminMatchCopy}>
                                    <Text style={styles.adminMatchTitle}>{ingredient.label}</Text>
                                    <Text style={styles.adminMatchMeta}>
                                      {ingredient.inputWeightGrams ?? ingredient.grams} g input ·{" "}
                                      {ingredient.sourceDescription || "Unresolved source"}
                                      {ingredient.basis ? ` · ${ingredient.basis}` : ""}
                                    </Text>
                                  </View>
                                  <View style={styles.catalogIngredientBadge}>
                                    <Text style={styles.catalogIngredientBadgeText}>
                                      {ingredient.resolved ? "resolved" : "unresolved"}
                                    </Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                  {catalogAudit.items.length < catalogAudit.totalCount ? (
                    <Pressable
                      onPress={() => handleRefreshCatalogAudit(catalogAudit.items.length, true)}
                      style={styles.ghostActionButton}
                    >
                      <Text style={styles.ghostActionButtonText}>Load more catalog items</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 3
  },
  headerCard: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  headerIdentity: {
    flex: 1,
    gap: spacing.xs
  },
  name: {
    color: palette.textPrimary,
    fontSize: typography.h1,
    fontWeight: "800"
  },
  email: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  goal: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  userIdBadge: {
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  userIdLabel: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  userIdValue: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  plan: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  editButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  editButtonText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  logoutButton: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  logoutText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  logoutButtonLarge: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,122,122,0.18)",
    backgroundColor: "rgba(255,122,122,0.08)",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  logoutButtonLargeText: {
    color: "#FFB0B0",
    fontSize: typography.body,
    fontWeight: "800"
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  settings: {
    gap: spacing.md
  },
  settingsCard: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  settingsTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700"
  },
  settingsItemText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  successText: {
    color: palette.accent,
    fontSize: typography.body
  },
  recordCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: spacing.md,
    gap: spacing.sm
  },
  recordTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  parserBadge: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  reviewButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(29,78,216,0.18)",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  reviewButtonText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  recordActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  deleteRecordButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(185,28,28,0.18)",
    backgroundColor: "rgba(185,28,28,0.08)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  deleteRecordButtonText: {
    color: palette.error,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  ghostActionButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 88
  },
  ghostActionButtonText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  adminReviewCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.sm
  },
  adminReviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  adminReviewCopy: {
    flex: 1,
    gap: spacing.xs
  },
  adminReviewBadge: {
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: spacing.sm,
    paddingVertical: 8
  },
  adminReviewBadgeText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  reviewNotesInput: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22,
    minHeight: 88,
    textAlignVertical: "top"
  },
  reviewSearchInput: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.textPrimary,
    fontSize: typography.body
  },
  adminSortRow: {
    gap: spacing.sm
  },
  adminSortLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  catalogTagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  catalogTagChip: {
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  catalogTagText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  catalogJsonInput: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.textPrimary,
    fontSize: typography.caption,
    lineHeight: 20,
    minHeight: 180,
    textAlignVertical: "top"
  },
  catalogSourceJsonInput: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.textPrimary,
    fontSize: typography.caption,
    lineHeight: 20,
    minHeight: 110,
    textAlignVertical: "top"
  },
  catalogWarningText: {
    color: "#92400E",
    fontSize: typography.caption,
    lineHeight: 18
  },
  catalogErrorText: {
    color: "#B91C1C",
    fontSize: typography.caption,
    lineHeight: 18
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  filterChipActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  filterChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: palette.primary
  },
  adminMatchesWrap: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: spacing.sm
  },
  adminMatchesTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  adminMatchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md
  },
  adminMatchCopy: {
    flex: 1,
    gap: 2
  },
  adminMatchTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  adminMatchMeta: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  catalogIngredientBadge: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  catalogIngredientBadgeText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  }
});
