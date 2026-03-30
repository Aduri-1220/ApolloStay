import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import { Screen } from "@/components/Screen";
import { SectionTitle } from "@/components/SectionTitle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { EmptyCard, ErrorCard, LoadingCard } from "@/components/AsyncState";
import { MetricCard } from "@/components/MetricCard";
import { ProgressBar } from "@/components/ProgressBar";
import {
  createCustomFood,
  deleteMealLog,
  createMealLog,
  analyzeMealScan,
  getDashboard,
  getFavoriteFoods,
  getFoodDetail,
  getMealRecommendations,
  parseVoiceMealLog,
  parseVoiceMealText,
  getProfile,
  getRecentFoods,
  lookupBarcode,
  searchFoods,
  toggleFavoriteFood,
  updateMealLog
} from "@/lib/api";
import {
  DashboardResponse,
  FoodDetail,
  FoodSearchResult,
  MealScanEstimate,
  MealLog,
  MealRecommendationResponse,
  Profile,
  VoiceMealParseResponse
} from "@/lib/types";
import { palette, radii, spacing, typography } from "@/lib/theme";

const mealTypes = ["breakfast", "lunch", "dinner", "snack"];
const composerModes = ["search", "scan", "barcode", "voice", "manual"] as const;
type ComposerMode = (typeof composerModes)[number];
const recommendationPromptOptions = [
  "High-protein Indian breakfast for today",
  "Low sodium dinner ideas",
  "PCOS-friendly snack options",
  "Iron-rich vegetarian lunch",
  "Diabetes-friendly breakfast"
];
const composerModeMeta: Record<ComposerMode, { label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  search: { label: "Search", icon: "search", hint: "Find verified foods fast" },
  scan: { label: "Scan plate", icon: "camera", hint: "Estimate a full meal visually" },
  barcode: { label: "Barcode", icon: "barcode", hint: "Packaged food logging" },
  voice: { label: "Voice", icon: "mic", hint: "Say meals naturally" },
  manual: { label: "Manual", icon: "create-outline", hint: "Homemade recipes and custom foods" }
};

function formatValue(value: number | null, suffix: string) {
  return value === null ? "Unavailable" : `${value}${suffix}`;
}

function getSourceLabel(source?: string) {
  if (source === "custom") {
    return "Custom foods";
  }
  if (source === "indian-meals") {
    return "Indian regional meals";
  }
  if (source === "indian-nutrition") {
    return "Indian nutrition";
  }
  return "USDA foundation foods";
}

function getPortionChoices(food: FoodDetail | null) {
  if (!food) {
    return [];
  }

  const choices = new Map<string, { unit: string; label: string }>();
  choices.set(food.basis === "per_serving" ? "serving" : "g", {
    unit: food.basis === "per_serving" ? "serving" : "g",
    label: food.basis === "per_serving" ? "Servings" : "Grams"
  });

  if (food.metadata?.gramsPerServing) {
    choices.set("serving", { unit: "serving", label: "Servings" });
  }

  choices.set("cup", { unit: "cup", label: "Cups" });
  choices.set("glass", { unit: "glass", label: "Glasses" });
  choices.set("katori", { unit: "katori", label: "Katoris" });
  choices.set("piece", { unit: "piece", label: "Pieces" });

  const portionOptions = Array.isArray(food.metadata?.portionOptions)
    ? food.metadata.portionOptions
    : [];
  portionOptions.forEach((option) => {
    const unit = String(option?.unit || "").trim().toLowerCase();
    const label = String(option?.label || option?.unit || "").trim();
    if (unit && label) {
      choices.set(unit, { unit, label });
    }
  });

  const preferredUnit = String(food.metadata?.preferredPortionUnit || "").trim().toLowerCase();
  return Array.from(choices.values()).sort((left, right) => {
    if (left.unit === preferredUnit) {
      return -1;
    }
    if (right.unit === preferredUnit) {
      return 1;
    }
    return 0;
  });
}

function getDefaultPortionUnit(food: FoodDetail) {
  const preferredUnit = String(food.metadata?.preferredPortionUnit || "").trim().toLowerCase();
  if (preferredUnit) {
    return preferredUnit;
  }
  return food.basis === "per_serving" ? "serving" : "g";
}

function getDefaultQuantity(food: FoodDetail, unit: string) {
  if (unit === "piece" || unit === "serving" || unit === "cup" || unit === "glass" || unit === "katori") {
    return "1";
  }

  if (unit === "g") {
    return "100";
  }

  return food.basis === "per_serving" ? "1" : "100";
}

function resolvePortionMultiplier(food: FoodDetail, unit: string) {
  const normalizedUnit = String(unit || "").trim().toLowerCase();
  const portionOptions = Array.isArray(food.metadata?.portionOptions)
    ? food.metadata.portionOptions
    : [];
  const matchedOption = portionOptions.find((option) => String(option?.unit || "").trim().toLowerCase() === normalizedUnit);
  if (matchedOption) {
    return Number(matchedOption.multiplier || 0) || null;
  }

  if (normalizedUnit === "serving") {
    return Number(food.metadata?.gramsPerServing || 100);
  }
  if (normalizedUnit === "cup") {
    return Number(food.metadata?.cupWeightGrams || 240);
  }
  if (normalizedUnit === "glass") {
    return Number(food.metadata?.glassWeightGrams || 250);
  }
  if (normalizedUnit === "katori") {
    return Number(food.metadata?.katoriWeightGrams || food.metadata?.bowlWeightGrams || 150);
  }
  if (normalizedUnit === "piece") {
    return Number(food.metadata?.pieceWeightGrams || 50);
  }

  return null;
}

function calculatePreview(food: FoodDetail | null, quantity: number, portionUnit: string) {
  if (!food || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  let effectiveQuantity = quantity;

  if (food.basis === "per_serving") {
    if (portionUnit === "cup") {
      effectiveQuantity = quantity * Number(food.metadata?.servingsPerCup || 1);
    } else if (portionUnit === "glass") {
      effectiveQuantity = quantity * Number(food.metadata?.servingsPerGlass || 1);
    } else if (portionUnit === "katori") {
      effectiveQuantity = quantity * Number(food.metadata?.servingsPerKatori || 1);
    } else if (portionUnit === "piece") {
      effectiveQuantity = quantity * Number(food.metadata?.servingsPerPiece || 1);
    }
  } else {
    const multiplier = resolvePortionMultiplier(food, portionUnit);
    if (multiplier) {
      effectiveQuantity = quantity * multiplier;
    }
  }

  const multiplier = food.basis === "per_serving" ? effectiveQuantity : effectiveQuantity / 100;

  return {
    calories: food.nutrientsPer100g.calories === null ? null : Number((food.nutrientsPer100g.calories * multiplier).toFixed(2)),
    protein: food.nutrientsPer100g.protein === null ? null : Number((food.nutrientsPer100g.protein * multiplier).toFixed(2)),
    carbs: food.nutrientsPer100g.carbs === null ? null : Number((food.nutrientsPer100g.carbs * multiplier).toFixed(2)),
    fat: food.nutrientsPer100g.fat === null ? null : Number((food.nutrientsPer100g.fat * multiplier).toFixed(2))
  };
}

function getStatusCopy(source?: string) {
  if (source === "custom") {
    return "Custom";
  }
  if (source === "indian-meals" || source === "indian-nutrition") {
    return "Indian";
  }
  return "USDA";
}

function getVoiceItemLabel(item: VoiceMealParseResponse["items"][number]) {
  return `${item.parsed.mealType} • ${item.parsed.quantity} ${item.parsed.portionUnit} • ${item.parsed.foodQuery}`;
}

function getVoiceErrorMessage(error: Error) {
  const baseMessage = error.message || "Voice logging could not start.";
  if (Platform.OS === "ios") {
    return `${baseMessage} If you are testing in iPhone Simulator, microphone capture can be limited. Try a real device, or in Simulator choose I/O > Audio Input before retrying.`;
  }
  return baseMessage;
}

function normalizeScannedBarcode(value: string) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function getWeekdayInitial(dateValue: string) {
  return new Date(dateValue).toLocaleDateString([], { weekday: "narrow" }).toUpperCase();
}

function startOfWeekSunday(dateValue?: string) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWeekCalendar(days: DashboardResponse["weeklySummary"]["days"], currentDate?: string) {
  const start = startOfWeekSunday(currentDate);
  const dayMap = new Map(days.map((day) => [day.date, day]));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const isoDate = toLocalDateKey(date);
    const summary = dayMap.get(isoDate);
    return {
      date: isoDate,
      label: date.toLocaleDateString([], { weekday: "short" }),
      shortLabel: date.toLocaleDateString([], { weekday: "narrow" }).toUpperCase(),
      mealCount: summary?.mealCount || 0,
      calories: summary?.calories || 0
    };
  });
}

export default function NutritionScreen() {
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const mealCameraRef = useRef<CameraView | null>(null);
  const suppressNextSearchRef = useRef(false);
  const params = useLocalSearchParams<{ editLogId?: string; composerMode?: string; openScanner?: string }>();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodDetail | null>(null);
  const [foodLoading, setFoodLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("100");
  const [portionUnit, setPortionUnit] = useState("g");
  const [mealType, setMealType] = useState("breakfast");
  const [searchCollectionTab, setSearchCollectionTab] = useState<"all" | "recent" | "favorites">("all");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<MealLog | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [recentFoods, setRecentFoods] = useState<FoodSearchResult[]>([]);
  const [favoriteFoods, setFavoriteFoods] = useState<FoodSearchResult[]>([]);
  const [barcode, setBarcode] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [customFood, setCustomFood] = useState({
    description: "",
    brand: "",
    barcode: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    gramsPerServing: "",
    cupWeightGrams: "",
    pieceWeightGrams: ""
  });
  const [quickManual, setQuickManual] = useState({
    description: "",
    mealType: "breakfast",
    grams: "100",
    calories: "",
    protein: "",
    carbs: "",
    fat: ""
  });
  const [composerMode, setComposerMode] = useState<ComposerMode>("search");
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  const [recommendationPrompt, setRecommendationPrompt] = useState("Suggest an Indian lunch for today");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationData, setRecommendationData] = useState<MealRecommendationResponse | null>(null);
  const [showRecommendationDebug, setShowRecommendationDebug] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceResult, setVoiceResult] = useState<VoiceMealParseResponse | null>(null);
  const [voiceStatusMessage, setVoiceStatusMessage] = useState<string | null>(null);
  const [voiceTranscriptDraft, setVoiceTranscriptDraft] = useState("");
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scannedFoodPreview, setScannedFoodPreview] = useState<FoodSearchResult | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [mealScanOpen, setMealScanOpen] = useState(false);
  const [mealScanLoading, setMealScanLoading] = useState(false);
  const [mealScanResult, setMealScanResult] = useState<MealScanEstimate | null>(null);
  const [mealScanPortionMultiplier, setMealScanPortionMultiplier] = useState("1");

  const parsedQuantity = Number(quantity);
  const preview = calculatePreview(selectedFood, parsedQuantity, portionUnit);
  const portionChoices = useMemo(() => getPortionChoices(selectedFood), [selectedFood]);
  const hasClinicalContext = Boolean(profile?.clinicalMetrics?.latestRecordDate);
  const activeModeMeta = composerModeMeta[composerMode];
  const weeklyDays = useMemo(
    () => buildWeekCalendar(dashboard?.weeklySummary.days || [], dashboard?.date),
    [dashboard?.date, dashboard?.weeklySummary.days]
  );
  const todayKey = toLocalDateKey(new Date());
  const calorieTarget = dashboard?.profile.dailyCalorieTarget || 0;
  const calorieProgress = calorieTarget > 0 ? Math.min(1, (dashboard?.summary.calories || 0) / calorieTarget) : 0;

  const groupedResults = results.reduce<Record<string, FoodSearchResult[]>>((accumulator, item) => {
    const key = item.source || "usda";
    if (!accumulator[key]) {
      accumulator[key] = [];
    }
    accumulator[key].push(item);
    return accumulator;
  }, {});
  const currentMealBreakdown = dashboard?.mealBreakdown.find((meal) => meal.mealType === mealType) || null;
  const currentMealDiscovery =
    searchCollectionTab === "favorites" ? favoriteFoods : searchCollectionTab === "recent" ? recentFoods : [];

  const loadPageData = useCallback(() => {
    Promise.all([getProfile(), getDashboard(), getRecentFoods(), getFavoriteFoods()])
      .then(([profileResponse, dashboardResponse, recentResponse, favoritesResponse]) => {
        setProfile(profileResponse);
        setDashboard(dashboardResponse);
        setRecentFoods(recentResponse);
        setFavoriteFoods(favoritesResponse);
        setError(null);
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      });
  }, []);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useFocusEffect(
    useCallback(() => {
      loadPageData();
      setSearchOpen(false);
      return () => {
        setSearchOpen(false);
        setScannerOpen(false);
        setScannerLocked(false);
        setMealScanOpen(false);
        setScannedFoodPreview(null);
        setIsRecordingActive(false);
      };
    }, [loadPageData])
  );

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }

    if (deferredQuery.trim().length < 2) {
      setResults([]);
      setSearchOpen(false);
      return;
    }

    setSearchLoading(true);
    setSearchOpen(true);
    searchFoods(deferredQuery)
      .then((response) => {
        startTransition(() => {
          setResults(response);
        });
      })
      .catch((requestError: Error) => {
        setError(requestError.message);
      })
      .finally(() => {
        setSearchLoading(false);
      });
  }, [deferredQuery]);

  useEffect(() => {
    const editLogId = typeof params.editLogId === "string" ? params.editLogId : "";
    if (!editLogId || !dashboard) {
      return;
    }

    const foundLog = dashboard.logs.find((item) => item.id === editLogId);
    if (foundLog) {
      handleEditLog(foundLog).finally(() => {
        router.setParams({ editLogId: undefined });
      });
    }
  }, [dashboard, params.editLogId]);

  useEffect(() => {
    const requestedMode = typeof params.composerMode === "string" ? params.composerMode : "";
    if (!requestedMode) {
      return;
    }

    if (composerModes.includes(requestedMode as ComposerMode)) {
      setComposerMode(requestedMode as ComposerMode);
    }

    router.setParams({ composerMode: undefined });
  }, [params.composerMode, router]);

  useEffect(() => {
    const shouldOpenScanner = params.openScanner === "1";
    if (!shouldOpenScanner) {
      return;
    }

    setComposerMode("barcode");
    handleOpenScanner().finally(() => {
      router.setParams({ openScanner: undefined });
    });
  }, [params.openScanner, router, cameraPermission]);

  const handleSelectFood = async (fdcId: string) => {
    setFoodLoading(true);
    setSearchOpen(false);
    suppressNextSearchRef.current = true;

    try {
      const detail = await getFoodDetail(fdcId);
      setSelectedFood(detail);
      setQuery(detail.description);
      setResults([]);
      setSearchOpen(false);
      const defaultPortionUnit = getDefaultPortionUnit(detail);
      setPortionUnit(defaultPortionUnit);
      setQuantity(getDefaultQuantity(detail, defaultPortionUnit));
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setFoodLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFood) {
      return;
    }

    try {
      const successMessage = editingLog ? "Meal log updated." : "Meal logged and daily targets updated.";

      if (editingLog) {
        await updateMealLog(editingLog.id, {
          fdcId: selectedFood.fdcId,
          mealType,
          quantity: Number(quantity),
          portionUnit
        });
      } else {
        await createMealLog({
          fdcId: selectedFood.fdcId,
          mealType,
          quantity: Number(quantity),
          portionUnit
        });
      }
      resetComposer();
      setSaveMessage(successMessage);
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const resetComposer = () => {
    setEditingLog(null);
    setSelectedFood(null);
    suppressNextSearchRef.current = true;
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setQuantity("100");
    setPortionUnit("g");
    setMealType("breakfast");
    setSaveMessage(null);
  };

  const handleToggleFavorite = async () => {
    if (!selectedFood) {
      return;
    }

    try {
      await toggleFavoriteFood(selectedFood.fdcId);
      loadPageData();
      setSaveMessage("Favorites updated.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleBarcodeLookup = async () => {
    const normalizedBarcode = normalizeScannedBarcode(barcode);
    if (!normalizedBarcode) {
      setError("Enter a valid barcode.");
      return;
    }

    setBarcodeLoading(true);
    try {
      const result = await lookupBarcode(normalizedBarcode);
      await handleSelectFood(result.fdcId);
      setSearchOpen(false);
      setBarcode(normalizedBarcode);
      setSaveMessage(
        result.source === "barcode_openfoodfacts"
          ? "Barcode matched a packaged food and saved it for reuse."
          : "Barcode matched a saved food."
      );
      setScannedFoodPreview(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleOpenScanner = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission?.granted) {
      setError("Camera permission is required to scan barcodes.");
      return;
    }

    setError(null);
    setScannerLocked(false);
    setScannedFoodPreview(null);
    setScannerOpen(true);
  };

  const handleBarcodeScanned = async (event: BarcodeScanningResult) => {
    if (scannerLocked) {
      return;
    }

    const scannedCode = normalizeScannedBarcode(event.data || "");
    if (scannedCode.length < 8) {
      return;
    }

    setScannerLocked(true);
    setBarcode(scannedCode);
    setScannedBarcode(scannedCode);
    Vibration.vibrate(40);

    try {
      setBarcodeLoading(true);
      const result = await lookupBarcode(scannedCode);
      setScannedFoodPreview(result);
      setScannerOpen(false);
      setError(null);
    } catch (requestError) {
      setScannedFoodPreview(null);
      setError(`${(requestError as Error).message} Try scanning in better light, hold the phone steady, or enter the digits manually.`);
    } finally {
      setBarcodeLoading(false);
      setScannerLocked(false);
    }
  };

  const handleConfirmScannedFood = async () => {
    if (!scannedFoodPreview) {
      return;
    }

    try {
      await handleSelectFood(scannedFoodPreview.fdcId);
      setSearchOpen(false);
      setSaveMessage(
        scannedFoodPreview.source === "barcode_openfoodfacts"
          ? "Scanned barcode matched a packaged food and loaded it into the log."
          : "Scanned barcode matched a saved food and loaded it into the log."
      );
      setScannedFoodPreview(null);
      setScannedBarcode("");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleRescan = () => {
    setScannedFoodPreview(null);
    setScannerLocked(false);
    setError(null);
    setScannerOpen(true);
  };

  const handleOpenMealScanner = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission?.granted) {
      setError("Camera permission is required to scan a meal plate.");
      return;
    }

    setError(null);
    setMealScanResult(null);
    setMealScanPortionMultiplier("1");
    setMealScanOpen(true);
  };

  const handleCaptureMealScan = async () => {
    if (!mealCameraRef.current || mealScanLoading) {
      return;
    }

    try {
      setMealScanLoading(true);
      const photo = await mealCameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6
      });
      if (!photo?.base64) {
        throw new Error("Could not capture the meal image.");
      }

      const result = await analyzeMealScan({
        filename: `meal-scan-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        contentBase64: photo.base64
      });
      setMealScanResult(result);
      setMealScanOpen(false);
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setMealScanLoading(false);
    }
  };

  const handleLogMealScan = async () => {
    if (!mealScanResult) {
      return;
    }

    const multiplier = Number(mealScanPortionMultiplier) || 1;
    try {
      const created = await createCustomFood({
        description: mealScanResult.title,
        calories: Number((mealScanResult.totals.calories * multiplier).toFixed(2)),
        protein: Number((mealScanResult.totals.protein * multiplier).toFixed(2)),
        carbs: Number((mealScanResult.totals.carbs * multiplier).toFixed(2)),
        fat: Number((mealScanResult.totals.fat * multiplier).toFixed(2))
      });
      await createMealLog({
        fdcId: created.fdcId,
        mealType,
        quantity: 1,
        portionUnit: "serving"
      });
      setMealScanResult(null);
      setMealScanPortionMultiplier("1");
      setSaveMessage("Scanned plate was estimated and added to your food log.");
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleCreateCustomFood = async () => {
    try {
      const created = await createCustomFood({
        description: customFood.description,
        brand: customFood.brand || undefined,
        barcode: customFood.barcode || undefined,
        calories: Number(customFood.calories),
        protein: Number(customFood.protein),
        carbs: Number(customFood.carbs),
        fat: Number(customFood.fat),
        gramsPerServing: customFood.gramsPerServing ? Number(customFood.gramsPerServing) : undefined,
        cupWeightGrams: customFood.cupWeightGrams ? Number(customFood.cupWeightGrams) : undefined,
        pieceWeightGrams: customFood.pieceWeightGrams ? Number(customFood.pieceWeightGrams) : undefined
      });
      setCustomFood({
        description: "",
        brand: "",
        barcode: "",
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
        gramsPerServing: "",
        cupWeightGrams: "",
        pieceWeightGrams: ""
      });
      setCustomFoodOpen(false);
      await handleSelectFood(created.fdcId);
      loadPageData();
      setSaveMessage("Custom food created and ready to log.");
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleAutofillManualFood = async () => {
    const normalizedName = quickManual.description.trim();
    if (!normalizedName) {
      setError("Enter a food name first, then tap the star to autofill values.");
      return;
    }

    try {
      setFoodLoading(true);
      let match =
        favoriteFoods.find((food) => food.description.toLowerCase() === normalizedName.toLowerCase()) ||
        recentFoods.find((food) => food.description.toLowerCase() === normalizedName.toLowerCase()) ||
        results.find((food) => food.description.toLowerCase() === normalizedName.toLowerCase());

      if (!match) {
        const searchResults = await searchFoods(normalizedName);
        match =
          searchResults.find((food) => food.description.toLowerCase() === normalizedName.toLowerCase()) ||
          searchResults[0];
      }

      if (!match) {
        setError("No matching food was found to autofill. You can still type the macros manually.");
        return;
      }

      const detail = await getFoodDetail(match.fdcId);
      setQuickManual((current) => ({
        ...current,
        description: detail.description,
        calories: detail.nutrientsPer100g.calories === null ? "" : String(detail.nutrientsPer100g.calories),
        protein: detail.nutrientsPer100g.protein === null ? "" : String(detail.nutrientsPer100g.protein),
        carbs: detail.nutrientsPer100g.carbs === null ? "" : String(detail.nutrientsPer100g.carbs),
        fat: detail.nutrientsPer100g.fat === null ? "" : String(detail.nutrientsPer100g.fat)
      }));
      setSaveMessage(`Autofilled nutrition from ${detail.description}. Adjust grams or macros if needed.`);
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setFoodLoading(false);
    }
  };

  const handleQuickManualLog = async () => {
    if (!quickManual.description.trim()) {
      setError("Enter a food name to log it manually.");
      return;
    }

    const grams = Number(quickManual.grams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setError("Enter grams for the manual food log.");
      return;
    }

    try {
      const created = await createCustomFood({
        description: quickManual.description.trim(),
        calories: Number(quickManual.calories || 0),
        protein: Number(quickManual.protein || 0),
        carbs: Number(quickManual.carbs || 0),
        fat: Number(quickManual.fat || 0),
        gramsPerServing: 100
      });

      await createMealLog({
        fdcId: created.fdcId,
        mealType: quickManual.mealType,
        quantity: grams,
        portionUnit: "g"
      });

      setQuickManual({
        description: "",
        mealType: "breakfast",
        grams: "100",
        calories: "",
        protein: "",
        carbs: "",
        fat: ""
      });
      loadPageData();
      setSaveMessage("Manual food logged successfully.");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleRecommendations = async () => {
    if (!profile) {
      return;
    }

    setRecommendationLoading(true);
    try {
      const response = await getMealRecommendations({
        userId: profile.id,
        userPrompt: recommendationPrompt
      });
      setRecommendationData(response);
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setRecommendationLoading(false);
    }
  };

  const handleUseRecommendation = async (foodId: string, title: string) => {
    try {
      setComposerMode("search");
      await handleSelectFood(foodId);
      setQuery(title);
      setSearchOpen(false);
      setSaveMessage(`${title} loaded into the logger.`);
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleStartVoiceLogging = async () => {
    try {
      setVoiceLoading(false);
      setVoiceResult(null);
      setVoiceStatusMessage("Checking microphone access...");
      setError(null);

      const existingPermission = await getRecordingPermissionsAsync();
      const permission =
        existingPermission.granted || !existingPermission.canAskAgain
          ? existingPermission
          : await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        setVoiceStatusMessage(null);
        setError(
          permission.canAskAgain
            ? "Microphone permission is required for voice food logging."
            : "Microphone access is blocked for this app. Open your device settings and enable microphone permission for ApolloStay."
        );
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      const status = recorder.getStatus();
      if (!status.canRecord && !status.isRecording) {
        throw new Error("The microphone could not enter recording mode.");
      }
      setIsRecordingActive(true);
      setVoiceStatusMessage("Listening... say a meal like 'Lunch 2 cups chana masala'.");
      setSaveMessage(null);
    } catch (requestError) {
      setIsRecordingActive(false);
      setVoiceStatusMessage(null);
      setError(getVoiceErrorMessage(requestError as Error));
    }
  };

  const applyVoiceItem = async (item: VoiceMealParseResponse["items"][number], transcript?: string) => {
    setMealType(item.parsed.mealType);
    setPortionUnit(item.parsed.portionUnit);
    setQuantity(String(item.parsed.quantity));
    setQuery(item.parsed.foodQuery);
    setResults(item.matches);
    setSearchOpen(item.matches.length > 0);
    setSaveMessage(transcript ? `Voice log ready: "${transcript}"` : "Voice item loaded into the form.");

    const bestMatch = item.matches[0];
    if (bestMatch) {
      await handleSelectFood(bestMatch.fdcId);
    }
  };

  const applyVoiceResult = async (result: VoiceMealParseResponse) => {
    setVoiceResult(result);
    setVoiceTranscriptDraft(result.transcript);
    await applyVoiceItem(
      result.items[0] || {
        transcript: result.transcript,
        parsed: result.parsed,
        matches: result.matches
      },
      result.transcript
    );
  };

  const handleStopVoiceLogging = async () => {
    try {
      if (!isRecordingActive && !recorderState.isRecording) {
        throw new Error("No active recording was found. Try starting the microphone again.");
      }
      setVoiceLoading(true);
      setVoiceStatusMessage("Finishing recording...");
      await recorder.stop();
      setIsRecordingActive(false);
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true
      });
      const recordingUri = recorder.uri || recorderState.url;

      if (!recordingUri) {
        throw new Error("Recording finished, but no audio file was created.");
      }

      const contentBase64 = await FileSystem.readAsStringAsync(recordingUri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const response = await parseVoiceMealLog({
        filename: "voice-food-log.m4a",
        mimeType: "audio/mp4",
        contentBase64
      });

      await applyVoiceResult(response);
      setVoiceStatusMessage(`Transcript ready: ${response.transcript}`);
      setError(null);
    } catch (requestError) {
      setIsRecordingActive(false);
      setVoiceStatusMessage(null);
      setError(getVoiceErrorMessage(requestError as Error));
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleParseVoiceText = async () => {
    if (!voiceTranscriptDraft.trim()) {
      setError("Enter or edit the spoken meal text before parsing.");
      return;
    }

    try {
      setVoiceLoading(true);
      setVoiceStatusMessage("Parsing transcript text...");
      const response = await parseVoiceMealText({ transcript: voiceTranscriptDraft });
      await applyVoiceResult(response);
      setVoiceStatusMessage(`Parsed from text: ${response.transcript}`);
      setError(null);
    } catch (requestError) {
      setVoiceStatusMessage(null);
      setError((requestError as Error).message);
    } finally {
      setVoiceLoading(false);
    }
  };

  const handleEditLog = async (log: MealLog) => {
    try {
      const detail = await getFoodDetail(log.food.fdcId);
      setSelectedFood(detail);
      setEditingLog(log);
      setQuery(detail.description);
      setMealType(log.mealType);
      setPortionUnit(log.quantityUnit || getDefaultPortionUnit(detail));
      setQuantity(String(log.quantity));
      setSaveMessage("Editing existing meal log.");
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteMealLog(logId);
      if (editingLog?.id === logId) {
        resetComposer();
      }
      setSaveMessage("Meal log deleted.");
      loadPageData();
      setError(null);
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["#F8FBFF", "#EDF5FF", "#F8FAFC"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroShell}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroDateLabel}>
                {new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
              </Text>
              <Text style={styles.title}>Nutrition</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="flash" size={14} color={palette.primary} />
              <Text style={styles.heroBadgeText}>{dashboard ? `${dashboard.summary.mealCount} meals` : "Ready"}</Text>
            </View>
          </View>
          {dashboard ? (
            <View style={styles.heroSummaryCard}>
              <View style={styles.heroSummaryTopRow}>
                <View>
                  <Text style={styles.heroSummaryLabel}>Today’s calories</Text>
                  <Text style={styles.heroSummaryValue}>
                    {dashboard.summary.calories} <Text style={styles.heroSummaryUnit}>cal / {dashboard.profile.dailyCalorieTarget}</Text>
                  </Text>
                </View>
                <Text style={styles.heroSummaryRemaining}>{dashboard.summary.remainingCalories} left</Text>
              </View>
              <View style={styles.heroProgressTrack}>
                <View style={[styles.heroProgressFill, { width: `${Math.max(8, calorieProgress * 100)}%` }]} />
              </View>
              <View style={styles.heroMacroRowCompact}>
                <View style={styles.heroMacroItem}>
                  <Text style={styles.heroMacroLabel}>Carbs</Text>
                  <Text style={styles.heroMacroValue}>{dashboard.summary.carbs} g</Text>
                </View>
                <View style={styles.heroMacroItem}>
                  <Text style={styles.heroMacroLabel}>Fat</Text>
                  <Text style={styles.heroMacroValue}>{dashboard.summary.fat} g</Text>
                </View>
                <View style={styles.heroMacroItem}>
                  <Text style={styles.heroMacroLabel}>Protein</Text>
                  <Text style={styles.heroMacroValue}>{dashboard.summary.protein} g</Text>
                </View>
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {error ? <ErrorCard message={error} /> : null}
        {foodLoading ? <LoadingCard label="Loading food details..." /> : null}

        {(favoriteFoods.length > 0 || recentFoods.length > 0 || dashboard) ? (
          <View style={styles.quickAccessCard}>
            <View style={styles.quickHeaderRow}>
              <View>
                <Text style={styles.quickTitle}>Jump back in</Text>
                <Text style={styles.helperText}>Tap a saved or recent food to log faster.</Text>
              </View>
              {dashboard ? (
                <View style={styles.inlinePill}>
                  <Text style={styles.inlinePillText}>{dashboard.weeklySummary.streaks.currentLoggingStreak} day streak</Text>
                </View>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickAccessRail}>
              {favoriteFoods.slice(0, 4).map((food) => (
                <Pressable key={`favorite-${food.fdcId}`} onPress={() => handleSelectFood(food.fdcId)} style={styles.quickAccessPill}>
                  <Text style={styles.quickAccessLabel}>Saved</Text>
                  <Text numberOfLines={2} style={styles.quickAccessText}>{food.description}</Text>
                </Pressable>
              ))}
              {recentFoods.slice(0, 6).map((food) => (
                <Pressable key={`recent-${food.fdcId}`} onPress={() => handleSelectFood(food.fdcId)} style={styles.quickAccessPill}>
                  <Text style={styles.quickAccessLabel}>Recent</Text>
                  <Text numberOfLines={2} style={styles.quickAccessText}>{food.description}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.mealComposerHero}>
            <View style={styles.mealComposerCopy}>
              <Text style={styles.mealOptionTitle}>Add a meal</Text>
              <Text style={styles.mealOptionSubtitle}>
                Choose the fastest lane for this moment, then log it into your day.
              </Text>
            </View>
            <View style={styles.modeFeaturePill}>
              <Ionicons name={activeModeMeta.icon} size={16} color={palette.primary} />
              <Text style={styles.modeFeaturePillText}>{activeModeMeta.hint}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeRail}
            decelerationRate="fast"
            snapToAlignment="start"
          >
            {composerModes.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setComposerMode(mode)}
                style={[styles.modeCard, styles.modeRailCard, composerMode === mode && styles.modeCardActive]}
              >
                <View style={[styles.modeCardIcon, composerMode === mode && styles.modeCardIconActive]}>
                  <Ionicons name={composerModeMeta[mode].icon} size={20} color={composerMode === mode ? "#FFFFFF" : palette.primary} />
                </View>
                <Text style={[styles.modeCardTitle, composerMode === mode && styles.modeCardTitleActive]}>
                  {composerModeMeta[mode].label}
                </Text>
                <Text style={[styles.modeCardHint, composerMode === mode && styles.modeCardHintActive]}>
                  {composerModeMeta[mode].hint}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {composerMode === "scan" ? (
            <>
              <Text style={styles.sectionLead}>Scan a plated meal to estimate likely foods and macros. Results are estimates, not medical-grade measurements.</Text>
              <View style={styles.inlineRow}>
                <PrimaryButton label={mealScanOpen ? "Camera ready" : "Open meal camera"} onPress={handleOpenMealScanner} />
                {mealScanOpen ? (
                  <Pressable
                    onPress={() => setMealScanOpen(false)}
                    style={styles.inlineAction}
                  >
                    <Text style={styles.inlineActionText}>Close camera</Text>
                  </Pressable>
                ) : null}
              </View>
              {mealScanOpen ? (
                <View style={styles.scannerCard}>
                  <CameraView facing="back" style={styles.scannerView} ref={mealCameraRef} />
                  <View pointerEvents="none" style={styles.scannerOverlay}>
                    <View style={styles.scannerFrame} />
                    <Text style={styles.scannerOverlayText}>Center the plate inside the frame</Text>
                  </View>
                  <Text style={styles.voiceHint}>Best results come from a top-down, well-lit photo of the full plate.</Text>
                  <PrimaryButton label={mealScanLoading ? "Analyzing..." : "Capture and analyze"} onPress={handleCaptureMealScan} disabled={mealScanLoading} />
                </View>
              ) : null}
              {mealScanResult ? (
                <View style={styles.scannedPreviewCard}>
                  <Text style={styles.groupTitle}>Plate estimate</Text>
                  <Text style={styles.resultTitle}>{mealScanResult.title}</Text>
                  <Text style={styles.helperText}>{mealScanResult.summary}</Text>
                  <Text style={styles.helperText}>Confidence: {mealScanResult.confidenceLabel}</Text>
                  <Text style={styles.helperText}>Portion note: {mealScanResult.portionNote}</Text>
                  <View style={styles.macroChips}>
                    {[
                      `C ${Math.round(mealScanResult.totals.calories)} kcal`,
                      `P ${Math.round(mealScanResult.totals.protein)}g`,
                      `Carbs ${Math.round(mealScanResult.totals.carbs)}g`,
                      `F ${Math.round(mealScanResult.totals.fat)}g`
                    ].map((chip) => (
                      <View key={chip} style={styles.macroChip}>
                        <Text style={styles.macroChipText}>{chip}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.groupTitle}>Likely foods</Text>
                  {mealScanResult.items.map((item, index) => (
                    <View key={`${item.name}-${index}`} style={styles.resultRow}>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultTitle}>{item.name}</Text>
                        <Text style={styles.resultMeta}>{item.estimatedPortion} • {item.confidence}</Text>
                      </View>
                      <Text style={styles.favoriteBadge}>{Math.round(item.calories)} kcal</Text>
                    </View>
                  ))}
                  <Text style={styles.groupTitle}>Confirm portion before logging</Text>
                  <View style={styles.inlineRow}>
                    {[
                      { label: "Light", value: "0.75" },
                      { label: "Regular", value: "1" },
                      { label: "Large", value: "1.25" },
                      { label: "Extra", value: "1.5" }
                    ].map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => setMealScanPortionMultiplier(option.value)}
                        style={[styles.unitChip, mealScanPortionMultiplier === option.value && styles.unitChipActive]}
                      >
                        <Text style={[styles.unitChipText, mealScanPortionMultiplier === option.value && styles.unitChipTextActive]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.inlineRow}>
                    <PrimaryButton label="Add to food log" onPress={handleLogMealScan} />
                    <Pressable onPress={handleOpenMealScanner} style={styles.inlineAction}>
                      <Text style={styles.inlineActionText}>Scan again</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
          {composerMode === "voice" ? (
            <>
              <View style={styles.voiceStudio}>
                <View style={styles.voiceHero}>
                  <View style={styles.voiceHeroBadge}>
                    <Ionicons name="mic" size={14} color={palette.primary} />
                    <Text style={styles.voiceHeroBadgeText}>Natural logging</Text>
                  </View>
                  <Text style={styles.quickTitle}>Speak your meal the way you naturally say it</Text>
                  <Text style={styles.helperText}>
                    Try "Breakfast 2 idlis and 1 cup chai" or "Lunch 1 katori dal, 2 rotis, and curd".
                  </Text>
                  <View style={styles.voiceExamplesRow}>
                    <View style={styles.voiceExampleChip}>
                      <Text style={styles.voiceExampleChipText}>2 idlis</Text>
                    </View>
                    <View style={styles.voiceExampleChip}>
                      <Text style={styles.voiceExampleChipText}>1 katori dal</Text>
                    </View>
                    <View style={styles.voiceExampleChip}>
                      <Text style={styles.voiceExampleChipText}>1 glass lassi</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.voiceStatusCard}>
                  <View style={styles.resultInfo}>
                    <Text style={styles.groupTitle}>Live status</Text>
                    {isRecordingActive || recorderState.isRecording ? (
                      <Text style={styles.voiceStatus}>Recording {Math.round((recorderState.durationMillis || 0) / 1000)}s</Text>
                    ) : voiceStatusMessage ? (
                      <Text style={styles.voiceStatus}>{voiceStatusMessage}</Text>
                    ) : voiceResult ? (
                      <Text style={styles.voiceStatus}>Transcript: {voiceResult.transcript}</Text>
                    ) : (
                      <Text style={styles.voiceStatus}>Ready for your next meal entry.</Text>
                    )}
                    {voiceResult?.followUpQuestion ? (
                      <Text style={styles.voiceReviewText}>{voiceResult.followUpQuestion}</Text>
                    ) : null}
                    <Text style={styles.voiceHint}>
                      {Platform.OS === "ios"
                        ? "On iPhone Simulator, microphone input can be unreliable. A real device gives the best results for spoken logging."
                        : "If the microphone does not start, confirm this app has microphone permission in your device settings."}
                    </Text>
                  </View>
                  <PrimaryButton
                    label={isRecordingActive || recorderState.isRecording ? (voiceLoading ? "Parsing..." : "Stop and parse") : "Start microphone"}
                    onPress={isRecordingActive || recorderState.isRecording ? handleStopVoiceLogging : handleStartVoiceLogging}
                    disabled={voiceLoading}
                  />
                </View>
              </View>
              <TextInput
                value={voiceTranscriptDraft}
                onChangeText={setVoiceTranscriptDraft}
                placeholder='Review or type spoken text, for example "Breakfast 2 idlis and 1 cup chai"'
                placeholderTextColor={palette.textSubtle}
                multiline
                style={[styles.input, styles.multilineInput]}
              />
              <View style={styles.inlineRow}>
                <PrimaryButton label={voiceLoading ? "Parsing..." : "Parse spoken text"} onPress={handleParseVoiceText} disabled={voiceLoading} />
              </View>
              {voiceResult?.items && voiceResult.items.length > 1 ? (
                <View style={styles.voiceItemsList}>
                  <Text style={styles.groupTitle}>Parsed meal items</Text>
                  {voiceResult.items.map((item, index) => (
                    <Pressable
                      key={`${item.parsed.foodQuery}-${item.parsed.mealType}-${index}`}
                      onPress={() => applyVoiceItem(item)}
                      style={styles.voiceItemCard}
                    >
                      <View style={styles.voiceItemTopRow}>
                        <Text style={styles.voiceItemText}>{getVoiceItemLabel(item)}</Text>
                        <View style={[styles.voiceConfidencePill, item.needsReview && styles.voiceConfidencePillWarn]}>
                          <Text style={[styles.voiceConfidenceText, item.needsReview && styles.voiceConfidenceTextWarn]}>
                            {item.needsReview ? "Review" : "Ready"}
                          </Text>
                        </View>
                      </View>
                      {item.clarification ? <Text style={styles.voiceHint}>{item.clarification}</Text> : null}
                      <Text style={styles.voiceTapHint}>Tap to load this into the logger</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {composerMode === "search" ? (
            <>
              <View style={styles.discoveryHeader}>
                <Text style={styles.sectionLead}>Search for a food that already exists in the app’s food catalogs.</Text>
                <View style={styles.discoveryTabs}>
                  {[
                    { id: "all", label: "All" },
                    { id: "recent", label: "History" },
                    { id: "favorites", label: "Saved" }
                  ].map((tab) => (
                    <Pressable
                      key={tab.id}
                      onPress={() => setSearchCollectionTab(tab.id as "all" | "recent" | "favorites")}
                      style={[
                        styles.discoveryTab,
                        searchCollectionTab === tab.id && styles.discoveryTabActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.discoveryTabText,
                          searchCollectionTab === tab.id && styles.discoveryTabTextActive
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <TextInput
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setSearchOpen(true);
                }}
                placeholder="Search paneer, idli, hummus, biryani..."
                placeholderTextColor={palette.textSubtle}
                style={styles.input}
              />
              <Text style={styles.helperText}>Search is best for existing foods already in the USDA, Indian, or your saved custom catalog.</Text>
              {searchLoading ? <LoadingCard label="Searching food records..." /> : null}
              {!query.trim() && searchCollectionTab !== "all" ? (
                <View style={styles.discoveryCollectionCard}>
                  <View style={styles.discoveryCollectionHeader}>
                    <Text style={styles.groupTitle}>
                      {searchCollectionTab === "favorites" ? "Saved foods" : "Recent foods"}
                    </Text>
                    <Text style={styles.resultMeta}>
                      {currentMealDiscovery.length} items
                    </Text>
                  </View>
                  {currentMealDiscovery.length > 0 ? (
                    currentMealDiscovery.slice(0, 8).map((food) => (
                      <Pressable key={food.fdcId} onPress={() => handleSelectFood(food.fdcId)} style={styles.resultRow}>
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultTitle}>{food.description}</Text>
                          <Text style={styles.resultMeta}>
                            {food.lastLoggedAt ? new Date(food.lastLoggedAt).toLocaleDateString() : getStatusCopy(food.source)}
                          </Text>
                        </View>
                        {searchCollectionTab === "favorites" ? <Text style={styles.favoriteBadge}>Saved</Text> : null}
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.helperText}>
                      {searchCollectionTab === "favorites"
                        ? "Foods you save will show up here for one-tap logging."
                        : "Your recent foods will appear here after a few logs."}
                    </Text>
                  )}
                </View>
              ) : null}
              {searchOpen &&
                Object.entries(groupedResults).map(([groupKey, items]) => (
                  <View key={groupKey} style={styles.resultSection}>
                    <Text style={styles.groupTitle}>{getSourceLabel(groupKey)}</Text>
                    {items.map((food) => (
                      <Pressable key={food.fdcId} onPress={() => handleSelectFood(food.fdcId)} style={styles.resultRow}>
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultTitle}>{food.description}</Text>
                          <Text style={styles.resultMeta}>
                            {food.metadata?.state ? `${food.metadata.state} • ` : ""}
                            {food.metadata?.mealType ? `${food.metadata.mealType} • ` : ""}
                            {getStatusCopy(food.source)}
                          </Text>
                        </View>
                        {food.isFavorite ? <Text style={styles.favoriteBadge}>Saved</Text> : null}
                      </Pressable>
                    ))}
                  </View>
                ))}
            </>
          ) : null}

          {composerMode === "barcode" ? (
            <>
              <Text style={styles.sectionLead}>Use barcode for packaged foods. You can scan the pack or type the digits manually.</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  value={barcode}
                  onChangeText={setBarcode}
                  placeholder="Enter barcode manually"
                  placeholderTextColor={palette.textSubtle}
                  style={[styles.input, styles.inlineInput]}
                />
                <PrimaryButton label={barcodeLoading ? "Checking..." : "Find barcode"} onPress={handleBarcodeLookup} />
              </View>
              <Text style={styles.helperText}>If scan doesn’t work, type the digits from the packet here and tap `Find barcode`.</Text>
              <View style={styles.inlineRow}>
                <PrimaryButton label="Scan barcode" onPress={handleOpenScanner} />
                {scannerOpen ? (
                  <Pressable
                    onPress={() => {
                      setScannerOpen(false);
                      setScannerLocked(false);
                    }}
                    style={styles.inlineAction}
                  >
                    <Text style={styles.inlineActionText}>Close scanner</Text>
                  </Pressable>
                ) : null}
              </View>
              {scannerOpen ? (
                <View style={styles.scannerCard}>
                  <CameraView
                    facing="back"
                    style={styles.scannerView}
                    onBarcodeScanned={handleBarcodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"]
                    }}
                  />
                  <View pointerEvents="none" style={styles.scannerOverlay}>
                    <View style={styles.scannerFrame} />
                    <Text style={styles.scannerOverlayText}>Align the barcode inside the frame</Text>
                  </View>
                  <Text style={styles.voiceHint}>Point the camera at a barcode. You can confirm the matched product before adding it.</Text>
                </View>
              ) : null}
              {scannedFoodPreview ? (
                <View style={styles.scannedPreviewCard}>
                  <Text style={styles.groupTitle}>Scanned product found</Text>
                  <Text style={styles.resultTitle}>{scannedFoodPreview.description}</Text>
                  <Text style={styles.resultMeta}>
                    {getSourceLabel(scannedFoodPreview.source)}
                    {scannedBarcode ? ` • ${scannedBarcode}` : ""}
                  </Text>
                  {scannedFoodPreview.metadata?.brand ? (
                    <Text style={styles.helperText}>Brand: {String(scannedFoodPreview.metadata.brand)}</Text>
                  ) : null}
                  <View style={styles.inlineRow}>
                    <PrimaryButton label="Use scanned food" onPress={handleConfirmScannedFood} />
                    <Pressable onPress={handleRescan} style={styles.inlineAction}>
                      <Text style={styles.inlineActionText}>Scan again</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {composerMode === "manual" ? (
            <>
              <View style={styles.formGrid}>
                <Text style={styles.quickTitle}>Quick manual log</Text>
                <Text style={styles.helperText}>
                  Enter the food name, tap the star to autofill from known foods, or type the macros yourself and log it.
                </Text>
                <View style={styles.inlineRow}>
                  <TextInput
                    value={quickManual.description}
                    onChangeText={(value) => setQuickManual((current) => ({ ...current, description: value }))}
                    placeholder="Food name"
                    placeholderTextColor={palette.textSubtle}
                    style={[styles.input, styles.inlineInput]}
                  />
                  <Pressable onPress={handleAutofillManualFood} style={styles.starAction}>
                    <Text style={styles.starActionText}>★ Autofill</Text>
                  </Pressable>
                </View>
                <View style={styles.inlineRow}>
                  {mealTypes.map((item) => (
                    <Pressable
                      key={`manual-${item}`}
                      onPress={() => setQuickManual((current) => ({ ...current, mealType: item }))}
                      style={[styles.unitChip, quickManual.mealType === item && styles.unitChipActive]}
                    >
                      <Text style={[styles.unitChipText, quickManual.mealType === item && styles.unitChipTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={quickManual.grams}
                  onChangeText={(value) => setQuickManual((current) => ({ ...current, grams: value }))}
                  placeholder="Grams to log"
                  placeholderTextColor={palette.textSubtle}
                  keyboardType="numeric"
                  style={styles.input}
                />
                <View style={styles.metricGrid}>
                  {[
                    ["Calories / 100g", "calories"],
                    ["Protein / 100g", "protein"],
                    ["Carbs / 100g", "carbs"],
                    ["Fat / 100g", "fat"]
                  ].map(([label, key]) => (
                    <View key={key} style={styles.field}>
                      <Text style={styles.fieldLabel}>{label}</Text>
                      <TextInput
                        value={quickManual[key as keyof typeof quickManual]}
                        onChangeText={(value) => setQuickManual((current) => ({ ...current, [key]: value }))}
                        placeholder={label}
                        placeholderTextColor={palette.textSubtle}
                        keyboardType="numeric"
                        style={styles.input}
                      />
                    </View>
                  ))}
                </View>
                <PrimaryButton label="Log food manually" onPress={handleQuickManualLog} />
              </View>

              <Pressable onPress={() => setCustomFoodOpen((current) => !current)} style={styles.toggleRow}>
                <Text style={styles.quickTitle}>{customFoodOpen ? "Hide advanced form" : "Open advanced custom food form"}</Text>
                <Text style={styles.favoriteBadge}>{customFoodOpen ? "Close" : "Open"}</Text>
              </Pressable>
              <Text style={styles.helperText}>
                Use the advanced form only if you also want to save brand, barcode, cup weight, or piece weight.
              </Text>
              {customFoodOpen ? (
                <View style={styles.formGrid}>
              {[
                ["Description", "description"],
                ["Brand", "brand"],
                ["Barcode", "barcode"],
                ["Calories / 100g", "calories"],
                ["Protein / 100g", "protein"],
                ["Carbs / 100g", "carbs"],
                ["Fat / 100g", "fat"],
                ["Grams per serving", "gramsPerServing"],
                ["Cup weight grams", "cupWeightGrams"],
                ["Piece weight grams", "pieceWeightGrams"]
              ].map(([label, key]) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <TextInput
                    value={customFood[key as keyof typeof customFood]}
                    onChangeText={(value) => setCustomFood((current) => ({ ...current, [key]: value }))}
                    placeholder={label}
                    placeholderTextColor={palette.textSubtle}
                    keyboardType={key === "description" || key === "brand" || key === "barcode" ? "default" : "numeric"}
                    style={styles.input}
                  />
                </View>
              ))}
              <PrimaryButton label="Save custom food" onPress={handleCreateCustomFood} />
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <SectionTitle title="Current meal tray" subtitle="Pick a meal session, then log into it." />
        <View style={styles.sessionTabsRow}>
          {mealTypes.map((item) => {
            const itemBreakdown = dashboard?.mealBreakdown.find((meal) => meal.mealType === item);
            const selected = mealType === item;
            return (
              <Pressable
                key={`session-${item}`}
                onPress={() => setMealType(item)}
                style={[styles.sessionTab, selected && styles.sessionTabActive]}
              >
                <Text style={[styles.sessionTabLabel, selected && styles.sessionTabLabelActive]}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
                <Text style={[styles.sessionTabMeta, selected && styles.sessionTabMetaActive]}>
                  {itemBreakdown?.summary.itemCount || 0} items
                </Text>
              </Pressable>
            );
          })}
        </View>
        {currentMealBreakdown ? (
          <View style={styles.mealTrayCard}>
            <View style={styles.mealTrayHeader}>
              <View>
                <Text style={styles.mealTrayTitle}>{`Your ${mealType}`}</Text>
                <Text style={styles.resultMeta}>
                  {currentMealBreakdown.summary.itemCount} items · {currentMealBreakdown.summary.calories} kcal
                </Text>
              </View>
              <View style={styles.inlinePill}>
                <Text style={styles.inlinePillText}>{mealType}</Text>
              </View>
            </View>
            {currentMealBreakdown.logs.length > 0 ? (
              currentMealBreakdown.logs.slice(0, 3).map((log) => (
                <View key={log.id} style={styles.mealTrayItem}>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultTitle}>{log.food.description}</Text>
                    <Text style={styles.resultMeta}>
                      {log.nutrients.calories ?? "?"} cal, {log.quantity} {log.quantityUnit}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleDeleteLog(log.id)} style={styles.mealTrayDelete}>
                    <Ionicons name="trash-outline" size={18} color={palette.textSubtle} />
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.helperText}>No foods in this meal yet. Pick one below to start building it.</Text>
            )}
          </View>
        ) : null}
        {selectedFood ? (
          <View style={styles.selectedSheet}>
            <View style={styles.selectedTopRow}>
              <View style={styles.selectedIdentity}>
                <View style={styles.selectedBadgeRow}>
                  <Text style={styles.selectedBadge}>{getSourceLabel(selectedFood.source)}</Text>
                  <Text style={styles.selectedBadgeMuted}>{getStatusCopy(selectedFood.source)}</Text>
                </View>
                <Text style={styles.selectedSheetEyebrow}>Ready to log</Text>
                <Text style={styles.selectedTitle}>{selectedFood.description}</Text>
                <Text style={styles.resultMeta}>
                  {selectedFood.dataType}
                  {editingLog ? ` • Editing ${editingLog.mealType}` : ""}
                </Text>
              </View>
              <Pressable onPress={handleToggleFavorite} style={styles.favoriteIconButton}>
                <Text style={styles.favoriteIconText}>
                  {favoriteFoods.some((food) => food.fdcId === selectedFood.fdcId) ? "★" : "☆"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.nutrientChipGrid}>
              <View style={styles.nutrientChip}>
                <Text style={styles.nutrientChipLabel}>Base kcal</Text>
                <Text style={styles.nutrientChipValue}>{formatValue(selectedFood.nutrientsPer100g.calories, " kcal")}</Text>
              </View>
              <View style={styles.nutrientChip}>
                <Text style={styles.nutrientChipLabel}>Protein</Text>
                <Text style={styles.nutrientChipValue}>{formatValue(selectedFood.nutrientsPer100g.protein, " g")}</Text>
              </View>
              <View style={styles.nutrientChip}>
                <Text style={styles.nutrientChipLabel}>Carbs</Text>
                <Text style={styles.nutrientChipValue}>{formatValue(selectedFood.nutrientsPer100g.carbs, " g")}</Text>
              </View>
              <View style={styles.nutrientChip}>
                <Text style={styles.nutrientChipLabel}>Fat</Text>
                <Text style={styles.nutrientChipValue}>{formatValue(selectedFood.nutrientsPer100g.fat, " g")}</Text>
              </View>
            </View>

            <View style={styles.selectedControlsCard}>
              <View style={styles.selectedControlHeader}>
                <Text style={styles.controlLabel}>Portion</Text>
                <Text style={styles.selectedHint}>Pick the unit, then confirm quantity and meal.</Text>
              </View>
              <View style={styles.unitRow}>
                {portionChoices.map((choice) => (
                  <Pressable
                    key={choice.unit}
                    onPress={() => setPortionUnit(choice.unit)}
                    style={[styles.unitChip, portionUnit === choice.unit && styles.unitChipActive]}
                  >
                    <Text style={[styles.unitChipText, portionUnit === choice.unit && styles.unitChipTextActive]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.actionTrayRow}>
                <View style={styles.quantityCard}>
                  <Text style={styles.controlLabel}>Quantity</Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="numeric"
                    placeholder="Enter quantity"
                    placeholderTextColor={palette.textSubtle}
                    style={styles.actionTrayInput}
                  />
                </View>
                <View style={styles.mealPickerCard}>
                  <Text style={styles.controlLabel}>Session</Text>
                  <View style={styles.unitRow}>
                    {mealTypes.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setMealType(item)}
                        style={[styles.unitChip, mealType === item && styles.unitChipActive]}
                      >
                        <Text style={[styles.unitChipText, mealType === item && styles.unitChipTextActive]}>
                          {item}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              {preview ? (
                <View style={styles.previewStrip}>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewItemLabel}>This item</Text>
                    <Text style={styles.previewItemValue}>{formatValue(preview.calories, " kcal")}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewItemLabel}>Protein</Text>
                    <Text style={styles.previewItemValue}>{formatValue(preview.protein, " g")}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewItemLabel}>Carbs</Text>
                    <Text style={styles.previewItemValue}>{formatValue(preview.carbs, " g")}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewItemLabel}>Fat</Text>
                    <Text style={styles.previewItemValue}>{formatValue(preview.fat, " g")}</Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.selectedActionRow}>
                <View style={styles.primaryActionWrap}>
                  <PrimaryButton label={editingLog ? "Save changes" : `Log to ${mealType}`} onPress={handleSave} />
                </View>
                <Pressable onPress={resetComposer} style={styles.clearSelectionButton}>
                  <Text style={styles.clearSelectionText}>{editingLog ? "Cancel" : "Clear"}</Text>
                </Pressable>
              </View>
            </View>

            {saveMessage ? <Text style={styles.successText}>{saveMessage}</Text> : null}
          </View>
        ) : (
          <EmptyCard title="No food selected" detail="Pick a search result, recent food, or favorite to start logging." />
        )}

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
  heroShell: {
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: "#DCEAFB",
    padding: spacing.lg
  },
  hero: {
    gap: spacing.md
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  heroDateLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE"
  },
  heroBadgeText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  heroStats: {
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap"
  },
  weekStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  weekDay: {
    alignItems: "center",
    gap: 4,
    flex: 1
  },
  weekDayLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  weekDayLabelActive: {
    color: palette.textPrimary
  },
  weekDaySubLabel: {
    color: palette.textSubtle,
    fontSize: 10,
    fontWeight: "600"
  },
  weekDaySubLabelActive: {
    color: palette.primary
  },
  weekDayDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF"
  },
  weekDayDotFilled: {
    backgroundColor: palette.textPrimary,
    borderColor: palette.textPrimary
  },
  weekDayDotToday: {
    borderColor: palette.primary
  },
  heroSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#DCEAFB"
  },
  heroSummaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  heroSummaryLabel: {
    color: palette.textMuted,
    fontSize: typography.body,
    fontWeight: "600"
  },
  heroSummaryValue: {
    color: palette.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800"
  },
  heroSummaryUnit: {
    color: palette.textSubtle,
    fontSize: typography.body,
    fontWeight: "600"
  },
  heroSummaryRemaining: {
    color: palette.textMuted,
    fontSize: typography.body,
    fontWeight: "700"
  },
  heroProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden"
  },
  heroProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#3B82F6"
  },
  heroMacroRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  heroMacroRowCompact: {
    flexDirection: "row",
    gap: spacing.sm
  },
  heroMacroItem: {
    flex: 1,
    minWidth: 90,
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md,
    gap: 2
  },
  heroMacroLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  heroMacroValue: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  modeSwitcher: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  modeRail: {
    gap: spacing.md,
    paddingRight: spacing.sm
  },
  modeCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.xs
  },
  modeRailCard: {
    flex: undefined,
    width: 178,
    minWidth: 178,
    minHeight: 146,
    justifyContent: "space-between"
  },
  modeCardActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  modeCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DBEAFE"
  },
  modeCardIconActive: {
    backgroundColor: palette.primary
  },
  modeCardTitle: {
    color: palette.textPrimary,
    fontSize: typography.body,
    fontWeight: "700"
  },
  modeCardTitleActive: {
    color: palette.primary
  },
  modeCardHint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 18
  },
  modeCardHintActive: {
    color: palette.textMuted
  },
  modeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg
  },
  modeChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#DBEAFE"
  },
  modeChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  modeChipTextActive: {
    color: palette.primary
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.h1,
    fontWeight: "800"
  },
  titleSmall: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700"
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 24
  },
  progressPanel: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  panelHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  panelTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  panelSubtitle: {
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 18
  },
  inlinePill: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  inlinePillText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  quickAccessCard: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  quickAccessRail: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  quickAccessPill: {
    width: 148,
    minHeight: 88,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.xs
  },
  quickAccessLabel: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  quickAccessText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  searchGuideGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  searchGuideCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: spacing.md,
    gap: spacing.sm
  },
  quickCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm
  },
  quickHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  collectionPill: {
    minWidth: 30,
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  collectionPillText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  quickTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  quickPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,255,112,0.16)",
    backgroundColor: "rgba(212,255,112,0.08)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  quickPillText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md
  },
  mealOptionSection: {
    gap: spacing.xs
  },
  mealComposerHero: {
    gap: spacing.sm
  },
  mealComposerCopy: {
    gap: spacing.xs
  },
  modeFeaturePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: 999,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  modeFeaturePillText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  mealOptionTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  mealOptionSubtitle: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  discoveryHeader: {
    gap: spacing.sm
  },
  discoveryTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  discoveryTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderBottomWidth: 2,
    borderBottomColor: "transparent"
  },
  discoveryTabActive: {
    borderBottomColor: palette.primary
  },
  discoveryTabText: {
    color: palette.textSubtle,
    fontSize: typography.body,
    fontWeight: "600"
  },
  discoveryTabTextActive: {
    color: palette.primary,
    fontWeight: "800"
  },
  discoveryCollectionCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#F8FAFC",
    padding: spacing.md,
    gap: spacing.sm
  },
  discoveryCollectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm
  },
  inlineRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    flexWrap: "wrap"
  },
  inlineInput: {
    flex: 1
  },
  resultSection: {
    gap: spacing.sm
  },
  groupTitle: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  resultRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm
  },
  resultInfo: {
    flex: 1,
    gap: 4
  },
  resultTitle: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  resultMeta: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  favoriteBadge: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  formGrid: {
    gap: spacing.sm
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: palette.textMuted,
    fontSize: typography.caption
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  selectedSheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#DCEAFB",
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4
  },
  mealTrayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  sessionTabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between"
  },
  sessionTab: {
    width: "48%",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 2
  },
  sessionTabActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  sessionTabLabel: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  sessionTabLabelActive: {
    color: palette.primary
  },
  sessionTabMeta: {
    color: palette.textSubtle,
    fontSize: typography.caption
  },
  sessionTabMetaActive: {
    color: palette.primary
  },
  mealTrayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  mealTrayTitle: {
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800"
  },
  mealTrayItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: spacing.md
  },
  mealTrayDelete: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0"
  },
  selectedTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "flex-start"
  },
  selectedIdentity: {
    flex: 1,
    gap: 6
  },
  selectedSheetEyebrow: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  selectedBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  selectedBadge: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#DBEAFE"
  },
  selectedBadgeMuted: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted
  },
  selectedTitle: {
    color: palette.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800"
  },
  favoriteIconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(29,78,216,0.18)",
    backgroundColor: "#DBEAFE"
  },
  favoriteIconText: {
    color: palette.primary,
    fontSize: 24,
    fontWeight: "800"
  },
  favoriteButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "rgba(212,255,112,0.1)",
    borderWidth: 1,
    borderColor: "rgba(212,255,112,0.18)"
  },
  favoriteButtonText: {
    color: palette.accent,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  nutrientChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  nutrientChip: {
    flexGrow: 1,
    minWidth: 128,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  nutrientChipLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  nutrientChipValue: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  selectedControlsCard: {
    gap: spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md
  },
  selectedControlHeader: {
    gap: 2
  },
  selectedHint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 18
  },
  controlLabel: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  actionTrayRow: {
    gap: spacing.md
  },
  quantityCard: {
    gap: spacing.sm
  },
  mealPickerCard: {
    gap: spacing.sm
  },
  actionTrayInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    color: palette.textPrimary,
    fontSize: typography.h3,
    fontWeight: "800",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  composerGrid: {
    gap: spacing.md
  },
  composerField: {
    gap: spacing.sm
  },
  unitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  unitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card
  },
  unitChipActive: {
    borderColor: palette.primary,
    backgroundColor: "#DBEAFE"
  },
  unitChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  unitChipTextActive: {
    color: palette.primary
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  previewStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  previewItem: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: radii.lg,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCEAFB",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4
  },
  previewItemLabel: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  previewItemValue: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "800"
  },
  selectedActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center"
  },
  primaryActionWrap: {
    flex: 1
  },
  clearSelectionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF"
  },
  clearSelectionText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  successText: {
    color: palette.accent,
    fontSize: typography.body
  },
  mealHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  mealSummary: {
    alignItems: "flex-end"
  },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
    paddingTop: spacing.sm
  },
  logCalories: {
    color: palette.textPrimary,
    fontSize: typography.label,
    fontWeight: "700"
  },
  logActions: {
    alignItems: "flex-end",
    gap: 6
  },
  logButtons: {
    flexDirection: "row",
    gap: spacing.xs
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  recommendationCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    backgroundColor: "#F8FBFF",
    padding: spacing.md,
    gap: spacing.sm
  },
  recommendationHero: {
    gap: spacing.sm
  },
  recommendationHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: "#DBEAFE"
  },
  recommendationHeroBadgeText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  recommendationPromptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  recommendationPromptChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  recommendationPromptChipActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF"
  },
  recommendationPromptChipText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  recommendationPromptChipTextActive: {
    color: palette.primary
  },
  recommendationSummaryCard: {
    gap: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: spacing.md
  },
  recommendationSignalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  recommendationSignalChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: "#E2E8F0"
  },
  recommendationSignalChipText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  recommendationLead: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  recommendationDebugCard: {
    gap: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: spacing.md
  },
  recommendationDebugHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  recommendationDebugTitle: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  recommendationDebugToggle: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  recommendationDebugBody: {
    gap: spacing.sm
  },
  recommendationDebugSection: {
    gap: spacing.xs
  },
  recommendationDebugLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  recommendationDebugText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    lineHeight: 18
  },
  recommendationDebugChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  recommendationDebugChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE"
  },
  recommendationDebugWarnChip: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D"
  },
  recommendationDebugChipText: {
    color: palette.textPrimary,
    fontSize: 11,
    fontWeight: "700"
  },
  recommendationCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  recommendationActionPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: "#DBEAFE"
  },
  recommendationActionPillText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  recommendationMetaWrap: {
    gap: spacing.sm
  },
  recommendationMetaCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2
  },
  recommendationMetaWarn: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB"
  },
  recommendationMetaLabel: {
    color: palette.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  recommendationMetaText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    lineHeight: 18
  },
  helperText: {
    color: palette.textMuted,
    fontSize: typography.body,
    lineHeight: 22
  },
  sectionLead: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22,
    fontWeight: "600"
  },
  voiceStudio: {
    gap: spacing.md
  },
  voiceHero: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
    padding: spacing.lg,
    gap: spacing.sm
  },
  voiceHeroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    backgroundColor: "#DBEAFE"
  },
  voiceHeroBadgeText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  voiceExamplesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  voiceExampleChip: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF"
  },
  voiceExampleChipText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  voiceStatusCard: {
    gap: spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: spacing.lg
  },
  voiceStatus: {
    color: palette.accent,
    fontSize: typography.body,
    lineHeight: 22,
    fontWeight: "700"
  },
  voiceHint: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    lineHeight: 18
  },
  voiceItemsList: {
    gap: spacing.sm
  },
  voiceItemCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#F8FBFF",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs
  },
  voiceItemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    alignItems: "flex-start"
  },
  voiceItemText: {
    color: palette.textPrimary,
    fontSize: typography.body,
    lineHeight: 22,
    fontWeight: "700",
    flex: 1
  },
  voiceConfidencePill: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  voiceConfidencePillWarn: {
    backgroundColor: "#FEF3C7"
  },
  voiceConfidenceText: {
    color: palette.success,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  voiceConfidenceTextWarn: {
    color: palette.warning
  },
  voiceReviewText: {
    color: "#FFB48A",
    fontSize: typography.body,
    lineHeight: 22,
    fontWeight: "700",
    marginTop: 4
  },
  voiceTapHint: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  inlineAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg
  },
  inlineActionText: {
    color: palette.textMuted,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  starAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: "#DBEAFE"
  },
  starActionText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  scannerCard: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    position: "relative"
  },
  scannerView: {
    width: "100%",
    height: 240,
    borderRadius: radii.xl,
    overflow: "hidden"
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md
  },
  scannerFrame: {
    width: "76%",
    height: 108,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: "rgba(29,78,216,0.72)",
    backgroundColor: "transparent"
  },
  scannerOverlayText: {
    color: palette.textPrimary,
    fontSize: typography.caption,
    fontWeight: "700",
    backgroundColor: "rgba(4,15,12,0.72)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999
  },
  scannedPreviewCard: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(109,224,255,0.18)",
    backgroundColor: "rgba(109,224,255,0.08)",
    padding: spacing.md
  },
  macroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  macroChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(29,78,216,0.18)",
    backgroundColor: "#EFF6FF"
  },
  macroChipText: {
    color: palette.primary,
    fontSize: typography.caption,
    fontWeight: "800"
  },
  deleteAction: {
    borderColor: "rgba(255,122,122,0.18)",
    backgroundColor: "rgba(255,122,122,0.08)"
  },
  deleteActionText: {
    color: "#FF9E9E"
  },
  secondaryAction: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  secondaryActionText: {
    color: palette.textSubtle,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  editingText: {
    color: "#FFDF8A",
    fontSize: typography.caption,
    fontWeight: "700"
  }
});
