import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { apiBaseUrl, disconnectWearableDevice, getWearableDeviceData, getWearableStatus } from "@/lib/api";
import { WearableConnectionStatus, WearableSnapshot } from "@/lib/types";

const CACHE_KEY = "apollostay_wearable_snapshot_v1";

const emptySnapshot: WearableSnapshot = {
  connected: false,
  source: null,
  lastSyncedAt: null,
  steps: null,
  sleepHours: null,
  activeCalories: null,
  distanceKm: null,
  heartRate: null,
  restingHeartRate: null,
  heartRateVariability: null,
  bloodPressure: null,
  bloodGlucose: null,
  weightKg: null,
  spo2: null,
  workouts: []
};

const emptyStatus: WearableConnectionStatus = {
  configuredDevices: [],
  connectedDevices: []
};

const isExpoGo =
  Constants.executionEnvironment === "storeClient" ||
  Constants.appOwnership === "expo";

function detectPlatformHealthSupport() {
  if (isExpoGo) {
    return {
      available: false,
      reason: "Health app sync is hidden in Expo Go. Use a native device build later when you're ready."
    };
  }

  if (Platform.OS === "ios") {
    try {
      const AppleHealthModule = require("react-native-health");
      const AppleHealth = AppleHealthModule?.default || AppleHealthModule;
      if (typeof AppleHealth?.initHealthKit === "function" && AppleHealth?.Constants?.Permissions) {
        return { available: true, reason: null };
      }
      return {
        available: false,
        reason: "Apple Health is not available in this iOS simulator/runtime. Test on a real iPhone later."
      };
    } catch {
      return {
        available: false,
        reason: "Apple Health is not available in this runtime. Test on a real iPhone later."
      };
    }
  }

  if (Platform.OS === "android") {
    try {
      const HealthConnect = require("react-native-health-connect");
      if (HealthConnect?.initialize) {
        return { available: true, reason: null };
      }
      return {
        available: false,
        reason: "Health Connect is not available in this Android runtime yet."
      };
    } catch {
      return {
        available: false,
        reason: "Health Connect is not available in this runtime yet."
      };
    }
  }

  return {
    available: false,
    reason: "Health app sync is only available on iOS and Android devices."
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function loadCachedSnapshot() {
  const raw = await SecureStore.getItemAsync(CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WearableSnapshot;
  } catch {
    return null;
  }
}

async function saveCachedSnapshot(snapshot: WearableSnapshot) {
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(snapshot));
}

function mergeWearableSnapshots(current: WearableSnapshot | null, next: Partial<WearableSnapshot>): WearableSnapshot {
  return {
    ...(current || emptySnapshot),
    ...next,
    connected: Boolean(next.connected ?? current?.connected),
    workouts: next.workouts || current?.workouts || []
  };
}

function callbackToPromise<T>(executor: (callback: (error: unknown, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    executor((error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

function normalizeTimestamp(value: unknown) {
  return typeof value === "string" ? value : null;
}

function buildWearableMetric(label: string, value: unknown, observedAt: unknown) {
  if (!isFiniteNumber(value) && typeof value !== "string") {
    return null;
  }

  return {
    label,
    value: String(value),
    observedAt: normalizeTimestamp(observedAt)
  };
}

async function readAppleHealthSnapshot(): Promise<WearableSnapshot> {
  if (isExpoGo) {
    throw new Error("Apple Health requires a native iOS build. Expo Go cannot access HealthKit.");
  }

  const AppleHealthModule = require("react-native-health");
  const AppleHealth = AppleHealthModule?.default || AppleHealthModule;
  if (!AppleHealth?.Constants?.Permissions || typeof AppleHealth?.initHealthKit !== "function") {
    throw new Error(
      "Apple Health is not available here. If you are on the iOS simulator, test on a real iPhone using expo run:ios or an EAS build."
    );
  }
  const permissions = AppleHealth.Constants.Permissions;

  await callbackToPromise((callback) =>
    AppleHealth.initHealthKit(
      {
        permissions: {
          read: [
            permissions.StepCount,
            permissions.HeartRate,
            permissions.RestingHeartRate,
            permissions.SleepAnalysis,
            permissions.BloodPressureSystolic,
            permissions.BloodPressureDiastolic,
            permissions.BloodGlucose,
            permissions.BodyMass,
            permissions.ActiveEnergyBurned
          ],
          write: []
        }
      },
      callback
    )
  );

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  const baseOptions = {
    startDate: startDate.toISOString(),
    endDate: new Date().toISOString(),
    ascending: false
  };

  const [stepCount, heartRates, restingHeartRate, sleepSamples, bloodPressureSamples, bloodGlucoseSamples, latestWeight, activeEnergy] =
    await Promise.all([
      callbackToPromise<{ value: number }>((callback) => AppleHealth.getStepCount(baseOptions, callback)).catch(() => ({ value: 0 })),
      callbackToPromise<Array<{ value: number; startDate: string }>>((callback) => AppleHealth.getHeartRateSamples(baseOptions, callback)).catch(() => []),
      callbackToPromise<{ value: number; startDate?: string }>((callback) => AppleHealth.getRestingHeartRate(baseOptions, callback)).catch(() => ({ value: 0 })),
      callbackToPromise<Array<{ startDate: string; endDate: string }>>((callback) => AppleHealth.getSleepSamples(baseOptions, callback)).catch(() => []),
      callbackToPromise<Array<{ bloodPressureSystolicValue: number; bloodPressureDiastolicValue: number; startDate: string }>>((callback) =>
        AppleHealth.getBloodPressureSamples(baseOptions, callback)
      ).catch(() => []),
      callbackToPromise<Array<{ value: number; startDate: string }>>((callback) => AppleHealth.getBloodGlucoseSamples(baseOptions, callback)).catch(() => []),
      callbackToPromise<{ value: number; startDate?: string }>((callback) => AppleHealth.getLatestWeight({ unit: "kg" }, callback)).catch(() => ({ value: 0 })),
      callbackToPromise<Array<{ value: number }>>((callback) => AppleHealth.getActiveEnergyBurned(baseOptions, callback)).catch(() => [])
    ]);

  const latestHeartRate = heartRates[0];
  const latestBloodPressure = bloodPressureSamples[0];
  const latestBloodGlucose = bloodGlucoseSamples[0];
  const restingHeartObservedAt =
    restingHeartRate && typeof restingHeartRate === "object" && "startDate" in restingHeartRate
      ? restingHeartRate.startDate || null
      : null;
  const sleepMinutes = sleepSamples.reduce((sum, sample) => {
    const start = new Date(sample.startDate).getTime();
    const end = new Date(sample.endDate).getTime();
    return sum + Math.max(0, Math.round((end - start) / 60000));
  }, 0);

  return {
    connected: true,
    source: "Apple HealthKit",
    lastSyncedAt: new Date().toISOString(),
    steps: isFiniteNumber(stepCount?.value) ? Math.round(stepCount.value) : null,
    sleepHours: sleepMinutes ? Math.round((sleepMinutes / 60) * 10) / 10 : null,
    activeCalories: activeEnergy.reduce((sum, sample) => sum + (sample?.value || 0), 0),
    distanceKm: null,
    heartRate: buildWearableMetric("Heart rate", latestHeartRate?.value, latestHeartRate?.startDate),
    restingHeartRate: buildWearableMetric("Resting heart rate", restingHeartRate?.value, restingHeartObservedAt),
    heartRateVariability: null,
    bloodPressure: latestBloodPressure
      ? buildWearableMetric(
          "Blood pressure",
          `${latestBloodPressure.bloodPressureSystolicValue}/${latestBloodPressure.bloodPressureDiastolicValue}`,
          latestBloodPressure.startDate
        )
      : null,
    bloodGlucose: buildWearableMetric("Blood glucose", latestBloodGlucose?.value, latestBloodGlucose?.startDate),
    weightKg: isFiniteNumber(latestWeight?.value) && latestWeight.value > 0 ? latestWeight.value : null,
    spo2: null,
    workouts: []
  };
}

async function readHealthConnectSnapshot(): Promise<WearableSnapshot> {
  if (isExpoGo) {
    throw new Error("Health Connect requires a native Android build and is not available in Expo Go.");
  }

  const HealthConnect = require("react-native-health-connect");
  if (!HealthConnect?.initialize) {
    throw new Error("Health Connect is not available in this runtime. Use expo run:android or an EAS build.");
  }
  await HealthConnect.initialize();
  await HealthConnect.requestPermission([
    { accessType: "read", recordType: "Steps" },
    { accessType: "read", recordType: "HeartRate" },
    { accessType: "read", recordType: "RestingHeartRate" },
    { accessType: "read", recordType: "SleepSession" },
    { accessType: "read", recordType: "BloodPressure" },
    { accessType: "read", recordType: "BloodGlucose" },
    { accessType: "read", recordType: "Weight" },
    { accessType: "read", recordType: "ActiveCaloriesBurned" }
  ]);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startTime = start.toISOString();
  const endTime = new Date().toISOString();
  const between = { operator: "between", startTime, endTime };

  const [stepsAgg, heartRates, restingHeartRate, sleepSessions, bloodPressure, bloodGlucose, weight, caloriesAgg] = await Promise.all([
    HealthConnect.aggregateRecord({ recordType: "Steps", timeRangeFilter: between }),
    HealthConnect.readRecords("HeartRate", { timeRangeFilter: between }),
    HealthConnect.readRecords("RestingHeartRate", { timeRangeFilter: between }),
    HealthConnect.readRecords("SleepSession", { timeRangeFilter: between }),
    HealthConnect.readRecords("BloodPressure", { timeRangeFilter: between }),
    HealthConnect.readRecords("BloodGlucose", { timeRangeFilter: between }),
    HealthConnect.readRecords("Weight", { timeRangeFilter: between }),
    HealthConnect.aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter: between })
  ]);

  const latestHeartRecord = heartRates.records?.[heartRates.records.length - 1];
  const latestRestingHeartRate = restingHeartRate.records?.[restingHeartRate.records.length - 1];
  const latestBloodPressure = bloodPressure.records?.[bloodPressure.records.length - 1];
  const latestBloodGlucose = bloodGlucose.records?.[bloodGlucose.records.length - 1];
  const latestWeight = weight.records?.[weight.records.length - 1];
  const sleepMinutes = (sleepSessions.records || []).reduce((sum: number, record: { startTime: string; endTime: string }) => {
    return sum + Math.max(0, Math.round((new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / 60000));
  }, 0);

  return {
    connected: true,
    source: "Health Connect",
    lastSyncedAt: new Date().toISOString(),
    steps: stepsAgg?.COUNT_TOTAL || 0,
    sleepHours: sleepMinutes ? Math.round((sleepMinutes / 60) * 10) / 10 : null,
    activeCalories: caloriesAgg?.ACTIVE_CALORIES_TOTAL?.inKilocalories || null,
    distanceKm: null,
    heartRate: buildWearableMetric(
      "Heart rate",
      latestHeartRecord?.samples?.[latestHeartRecord.samples.length - 1]?.beatsPerMinute,
      latestHeartRecord?.endTime
    ),
    restingHeartRate: buildWearableMetric("Resting heart rate", latestRestingHeartRate?.beatsPerMinute, latestRestingHeartRate?.time),
    heartRateVariability: null,
    bloodPressure: latestBloodPressure
      ? buildWearableMetric(
          "Blood pressure",
          `${latestBloodPressure.systolic?.inMillimetersOfMercury}/${latestBloodPressure.diastolic?.inMillimetersOfMercury}`,
          latestBloodPressure.time
        )
      : null,
    bloodGlucose: buildWearableMetric("Blood glucose", latestBloodGlucose?.level?.inMilligramsPerDeciliter, latestBloodGlucose?.time),
    weightKg: latestWeight?.weight?.inKilograms || null,
    spo2: null,
    workouts: []
  };
}

export function useWearableData(userId?: string) {
  const [snapshot, setSnapshot] = useState<WearableSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<WearableConnectionStatus>(emptyStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platformHealth = detectPlatformHealthSupport();

  const loadCacheAndStatus = useCallback(async () => {
    const [cached, backendStatus] = await Promise.all([
      loadCachedSnapshot().catch(() => null),
      getWearableStatus().catch(() => emptyStatus)
    ]);

    if (cached) {
      setSnapshot(cached);
    }
    setStatus(backendStatus);
  }, []);

  useEffect(() => {
    loadCacheAndStatus();
  }, [loadCacheAndStatus]);

  const refreshPlatformHealth = useCallback(
    async (forcePermissions = false) => {
      setLoading(true);
      try {
        if (!platformHealth.available) {
          throw new Error(platformHealth.reason || "Wearable sync is not available in this runtime.");
        }
        let nextSnapshot: WearableSnapshot;
        if (Platform.OS === "ios") {
          nextSnapshot = await readAppleHealthSnapshot();
        } else if (Platform.OS === "android") {
          nextSnapshot = await readHealthConnectSnapshot();
        } else {
          throw new Error("Wearable health sync is only available on iOS and Android devices.");
        }

        const merged = mergeWearableSnapshots(snapshot, nextSnapshot);
        setSnapshot(merged);
        await saveCachedSnapshot(merged);
        setError(null);
        return merged;
      } catch (requestError) {
        const message = (requestError as Error).message || "Could not read health data from this device.";
        setError(forcePermissions ? message : null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [snapshot]
  );

  const connectPlatformHealth = useCallback(async () => {
    return refreshPlatformHealth(true);
  }, [refreshPlatformHealth]);

  const openWearableOAuth = useCallback(
    async (device: string) => {
      if (!userId) {
        throw new Error("Sign in before connecting an external wearable.");
      }
      if ((device === "apple-health" || device === "health-connect") && !platformHealth.available) {
        throw new Error(platformHealth.reason || "Platform health sync is not available here.");
      }
      const url = `${apiBaseUrl}/wearables/connect/${encodeURIComponent(device)}?userId=${encodeURIComponent(userId)}`;
      await Linking.openURL(url);
    },
    [platformHealth.available, platformHealth.reason, userId]
  );

  const refreshExternalWearable = useCallback(
    async (device: string) => {
      setLoading(true);
      try {
        const externalSnapshot = await getWearableDeviceData(device);
        const merged = mergeWearableSnapshots(snapshot, externalSnapshot);
        setSnapshot(merged);
        await saveCachedSnapshot(merged);
        setError(null);
        return merged;
      } catch (requestError) {
        setError((requestError as Error).message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [snapshot]
  );

  const disconnectExternalWearable = useCallback(async (device: string) => {
    setLoading(true);
    try {
      await disconnectWearableDevice(device);
      const nextStatus = await getWearableStatus().catch(() => emptyStatus);
      setStatus(nextStatus);
      setError(null);
      return true;
    } catch (requestError) {
      setError((requestError as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    snapshot,
    status,
    loading,
    error,
    isExpoGo,
    platformHealthAvailable: platformHealth.available,
    platformHealthReason: platformHealth.reason,
    connectPlatformHealth,
    refreshPlatformHealth,
    refreshExternalWearable,
    disconnectExternalWearable,
    openWearableOAuth,
    reloadWearableStatus: loadCacheAndStatus
  };
}
