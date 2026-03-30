import Constants from "expo-constants";
import { Platform } from "react-native";
import { Profile } from "@/lib/types";

const REMINDER_CHANNEL_ID = "meal-reminders";

type MealReminderSlot = {
  key: "breakfast" | "lunch" | "dinner" | "snack";
  title: string;
  body: string;
  time: string | null | undefined;
};

type NotificationsModule = typeof import("expo-notifications");

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (isExpoGo()) {
    return null;
  }

  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

function parseTimeLabel(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3];

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem === "AM") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (meridiem === "PM") {
    if (hour < 12) {
      hour += 12;
    }
  }

  if (hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
}

async function ensureNotificationChannel() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return;
  }

  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Meal reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: null
  });
}

export async function requestReminderPermissions() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return { granted: false, canAskAgain: false, status: "undetermined" as const, ios: undefined };
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return existing;
  }

  return Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true
    }
  });
}

export async function syncMealReminderSchedule(profile: Profile) {
  const Notifications = await getNotificationsModule();
  if (!Notifications) {
    return { scheduledCount: 0, unsupported: true };
  }

  await ensureNotificationChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!profile.wantsMealReminders) {
    return { scheduledCount: 0 };
  }

  const permission = await requestReminderPermissions();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    throw new Error("Notification permission is required to enable meal reminders.");
  }

  const slots: MealReminderSlot[] = [
    {
      key: "breakfast",
      title: "Breakfast reminder",
      body: "Time to log breakfast and keep your nutrition plan on track.",
      time: profile.mealTimes?.breakfast
    },
    {
      key: "lunch",
      title: "Lunch reminder",
      body: "Lunch is coming up. Log it while it’s still easy to remember.",
      time: profile.mealTimes?.lunch
    },
    {
      key: "dinner",
      title: "Dinner reminder",
      body: "Dinner check-in. Log your meal and close the day cleanly.",
      time: profile.mealTimes?.dinner
    },
    {
      key: "snack",
      title: "Snack reminder",
      body: "Quick snack reminder so your day stays complete.",
      time: (profile.mealsPerDay || 0) >= 4 ? profile.mealTimes?.snack : null
    }
  ];

  let scheduledCount = 0;

  for (const slot of slots) {
    const parsed = parseTimeLabel(slot.time);
    if (!parsed) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: slot.title,
        body: slot.body,
        sound: false
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: parsed.hour,
        minute: parsed.minute,
        channelId: Platform.OS === "android" ? REMINDER_CHANNEL_ID : undefined
      }
    });
    scheduledCount += 1;
  }

  return { scheduledCount, unsupported: false };
}
