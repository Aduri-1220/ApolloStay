const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { isRequestOriginAllowed, sendJson } = require("./http-utils");

const tokensFilePath = path.join(__dirname, "..", "data", "wearable-tokens.json");

function ensureTokensFile() {
  if (!fs.existsSync(tokensFilePath)) {
    fs.writeFileSync(tokensFilePath, "{}\n", "utf8");
  }
}

function readTokens() {
  ensureTokensFile();
  return JSON.parse(fs.readFileSync(tokensFilePath, "utf8"));
}

function writeTokens(value) {
  ensureTokensFile();
  fs.writeFileSync(tokensFilePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function saveToken(userId, device, token) {
  const all = readTokens();
  if (!all[userId]) {
    all[userId] = {};
  }
  all[userId][device] = {
    ...token,
    savedAt: new Date().toISOString()
  };
  writeTokens(all);
}

function getToken(userId, device) {
  return readTokens()?.[userId]?.[device] || null;
}

function deleteToken(userId, device) {
  const all = readTokens();
  if (all[userId]) {
    delete all[userId][device];
  }
  writeTokens(all);
}

const oauthStateStore = new Map();

const config = {
  polar: {
    clientId: process.env.POLAR_CLIENT_ID || "",
    clientSecret: process.env.POLAR_CLIENT_SECRET || "",
    redirectUri: process.env.POLAR_REDIRECT_URI || "http://127.0.0.1:4000/wearables/callback/polar",
    authUrl: "https://flow.polar.com/oauth2/authorization",
    tokenUrl: "https://polarremote.com/v2/oauth2/token",
    meUrl: "https://www.polaraccesslink.com/v3/users"
  },
  whoop: {
    clientId: process.env.WHOOP_CLIENT_ID || "",
    clientSecret: process.env.WHOOP_CLIENT_SECRET || "",
    redirectUri: process.env.WHOOP_REDIRECT_URI || "http://127.0.0.1:4000/wearables/callback/whoop",
    authUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    dataUrl: "https://api.prod.whoop.com/developer/v1"
  },
  garmin: {
    clientId: process.env.GARMIN_CONSUMER_KEY || "",
    clientSecret: process.env.GARMIN_CONSUMER_SECRET || ""
  }
};

function buildOAuth2AuthUrl(device, userId, scope) {
  const cfg = config[device];
  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, {
    device,
    userId,
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope,
    state
  });

  return `${cfg.authUrl}?${params.toString()}`;
}

async function exchangeCode(device, code) {
  const cfg = config[device];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const result = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!result.ok) {
    throw new Error(`Could not complete ${device} OAuth: ${result.status}`);
  }

  return result.json();
}

async function refreshTokenIfNeeded(device, token) {
  if (!token?.refresh_token) {
    return token?.access_token || null;
  }

  const expiresAt = new Date(token.savedAt).getTime() + Number(token.expires_in || 3600) * 1000;
  if (Date.now() < expiresAt - 60_000) {
    return token.access_token;
  }

  const cfg = config[device];
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret
  });

  const result = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!result.ok) {
    return null;
  }

  const refreshed = await result.json();
  return refreshed;
}

async function fetchPolarData(userId) {
  const token = getToken(userId, "polar");
  if (!token) {
    throw new Error("Polar is not connected.");
  }

  const accessToken = typeof token === "object" ? token.access_token : token;
  const userResponse = await fetch(`${config.polar.meUrl}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!userResponse.ok) {
    throw new Error(`Polar API error: ${userResponse.status}`);
  }

  const user = await userResponse.json();
  const polarUserId = user?.polar_user_id;
  const today = new Date().toISOString().slice(0, 10);

  const [activityResponse, sleepResponse] = await Promise.all([
    fetch(`${config.polar.meUrl}/${polarUserId}/activity/date/${today}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    }).catch(() => null),
    fetch(`${config.polar.meUrl}/${polarUserId}/sleep/date/${today}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
    }).catch(() => null)
  ]);

  const activity = activityResponse?.ok ? await activityResponse.json() : null;
  const sleep = sleepResponse?.ok ? await sleepResponse.json() : null;

  return {
    connected: true,
    source: "Polar",
    lastSyncedAt: new Date().toISOString(),
    steps: activity?.steps ?? null,
    sleepHours: typeof sleep?.total_sleep_minutes === "number" ? Math.round((sleep.total_sleep_minutes / 60) * 10) / 10 : null,
    activeCalories: activity?.active_calories ?? null,
    distanceKm: null,
    heartRate: sleep?.average_hr_sleeping
      ? { label: "Heart rate", value: String(sleep.average_hr_sleeping), observedAt: today }
      : null,
    restingHeartRate: null,
    heartRateVariability: sleep?.hrv_avg ? { label: "HRV", value: String(sleep.hrv_avg), observedAt: today } : null,
    bloodPressure: null,
    bloodGlucose: null,
    weightKg: null,
    spo2: null,
    workouts: []
  };
}

async function fetchWhoopData(userId) {
  const token = getToken(userId, "whoop");
  if (!token) {
    throw new Error("Whoop is not connected.");
  }

  const accessToken = typeof token === "object" ? token.access_token : token;
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const [recoveryRes, sleepRes] = await Promise.all([
    fetch(`${config.whoop.dataUrl}/recovery?limit=1`, { headers }).catch(() => null),
    fetch(`${config.whoop.dataUrl}/sleep?limit=1`, { headers }).catch(() => null)
  ]);

  const recoveryPayload = recoveryRes?.ok ? await recoveryRes.json() : null;
  const sleepPayload = sleepRes?.ok ? await sleepRes.json() : null;
  const recovery = recoveryPayload?.records?.[0] || null;
  const sleep = sleepPayload?.records?.[0] || null;

  return {
    connected: true,
    source: "Whoop",
    lastSyncedAt: new Date().toISOString(),
    steps: null,
    sleepHours: sleep?.score?.stage_summary?.total_in_bed_time_milli
      ? Math.round((sleep.score.stage_summary.total_in_bed_time_milli / 3_600_000) * 10) / 10
      : null,
    activeCalories: null,
    distanceKm: null,
    heartRate: recovery?.score?.resting_heart_rate
      ? { label: "Heart rate", value: String(recovery.score.resting_heart_rate), observedAt: recovery.created_at || null }
      : null,
    restingHeartRate: recovery?.score?.resting_heart_rate
      ? { label: "Resting heart rate", value: String(recovery.score.resting_heart_rate), observedAt: recovery.created_at || null }
      : null,
    heartRateVariability: recovery?.score?.hrv_rmssd_milli
      ? { label: "HRV", value: String(recovery.score.hrv_rmssd_milli), observedAt: recovery.created_at || null }
      : null,
    bloodPressure: null,
    bloodGlucose: null,
    weightKg: null,
    spo2: null,
    workouts: []
  };
}

function getUserId(request, url) {
  return request.headers["x-user-id"] || url.searchParams.get("userId") || null;
}

async function handleWearableRoutes(request, response) {
  if (!request.url) {
    return false;
  }

  const url = new URL(request.url, "http://127.0.0.1:4000");
  if (!url.pathname.startsWith("/wearables")) {
    return false;
  }

  if (!isRequestOriginAllowed(request)) {
    sendJson(response, 403, { error: "Origin is not allowed." });
    return true;
  }

  const connectMatch = url.pathname.match(/^\/wearables\/connect\/([^/]+)$/);
  if (request.method === "GET" && connectMatch) {
    const device = connectMatch[1];
    const userId = getUserId(request, url);
    if (!userId) {
      sendJson(response, 401, { error: "Missing user context for wearable connection." });
      return true;
    }

    if (device === "garmin") {
      sendJson(response, 200, {
        message: "Garmin direct OAuth is not wired yet. Start with Apple HealthKit or Health Connect first."
      });
      return true;
    }

    const cfg = config[device];
    if (!cfg?.clientId || !cfg?.clientSecret) {
      sendJson(response, 400, {
        error: `${device} OAuth is not configured on the backend yet.`
      });
      return true;
    }

    const scope =
      device === "polar"
        ? "accesslink.read_all"
        : "read:profile read:recovery read:sleep read:workout read:cycles";
    const redirectUrl = buildOAuth2AuthUrl(device, userId, scope);
    response.writeHead(302, { Location: redirectUrl });
    response.end();
    return true;
  }

  const callbackMatch = url.pathname.match(/^\/wearables\/callback\/([^/]+)$/);
  if (request.method === "GET" && callbackMatch) {
    const device = callbackMatch[1];
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const statePayload = state ? oauthStateStore.get(state) : null;

    if (!code || !statePayload) {
      sendJson(response, 400, { error: "Invalid wearable callback." });
      return true;
    }

    try {
      const token = await exchangeCode(device, code);
      saveToken(statePayload.userId, device, token);
      oauthStateStore.delete(state);
      response.writeHead(302, {
        Location: `apollostay://wearable-connected?device=${encodeURIComponent(device)}&success=true`
      });
      response.end();
    } catch (error) {
      sendJson(response, 500, { error: (error).message });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/wearables/status") {
    const userId = getUserId(request, url);
    if (!userId) {
      sendJson(response, 200, { configuredDevices: [], connectedDevices: [] });
      return true;
    }

    const allTokens = readTokens()[userId] || {};
    const configuredDevices = Object.entries(config)
      .filter(([, value]) => Boolean(value.clientId || value.clientSecret))
      .map(([key]) => key);
    const connectedDevices = Object.keys(allTokens);
    sendJson(response, 200, { configuredDevices, connectedDevices });
    return true;
  }

  const dataMatch = url.pathname.match(/^\/wearables\/data\/([^/]+)$/);
  if (request.method === "GET" && dataMatch) {
    const device = dataMatch[1];
    const userId = getUserId(request, url);
    if (!userId) {
      sendJson(response, 401, { error: "Missing user context for wearable data." });
      return true;
    }

    try {
      let payload = null;
      if (device === "polar") {
        payload = await fetchPolarData(userId);
      } else if (device === "whoop") {
        payload = await fetchWhoopData(userId);
      } else {
        throw new Error(`${device} data fetch is not implemented yet.`);
      }
      sendJson(response, 200, payload);
    } catch (error) {
      sendJson(response, 400, { error: (error).message });
    }
    return true;
  }

  const disconnectMatch = url.pathname.match(/^\/wearables\/disconnect\/([^/]+)$/);
  if (request.method === "DELETE" && disconnectMatch) {
    const device = disconnectMatch[1];
    const userId = getUserId(request, url);
    if (!userId) {
      sendJson(response, 401, { error: "Missing user context for wearable disconnect." });
      return true;
    }
    deleteToken(userId, device);
    sendJson(response, 200, { disconnected: true, device });
    return true;
  }

  sendJson(response, 404, { error: "Wearable route not found." });
  return true;
}

module.exports = {
  handleWearableRoutes
};
