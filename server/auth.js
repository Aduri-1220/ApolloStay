const { randomUUID, scryptSync, timingSafeEqual } = require("node:crypto");
const { ensureStore, loadMealLogs, saveMealLogs } = require("./store");
const { isPostgresEnabled, query } = require("./postgres");
const { sessionTtlDays } = require("./config");

const PUBLIC_ID_PREFIX = "AST";

function formatPublicUserId(sequence) {
  return `${PUBLIC_ID_PREFIX}-${String(sequence).padStart(4, "0")}`;
}

function parsePublicUserId(publicId) {
  const match = String(publicId || "").match(new RegExp(`^${PUBLIC_ID_PREFIX}-(\\d{4,})$`));
  return match ? Number(match[1]) : null;
}

function ensureAuthStores(usersPath, sessionsPath) {
  ensureStore(usersPath);
  ensureStore(sessionsPath);
}

function loadUsers(usersPath) {
  ensureStore(usersPath);
  const users = loadMealLogs(usersPath);
  let changed = false;
  let maxSequence = users.reduce((highest, user) => {
    const parsed = parsePublicUserId(user.publicId);
    return parsed && parsed > highest ? parsed : highest;
  }, 0);

  const normalized = users.map((user) => {
    if (user.publicId) {
      return user;
    }

    maxSequence += 1;
    changed = true;
    return {
      ...user,
      publicId: formatPublicUserId(maxSequence)
    };
  });

  if (changed) {
    saveUsers(usersPath, normalized);
  }

  return normalized;
}

function saveUsers(usersPath, users) {
  saveMealLogs(usersPath, users);
}

function updateUserProfile(usersPath, userId, updates) {
  if (isPostgresEnabled()) {
    return updateUserProfilePostgres(userId, updates);
  }
  const users = loadUsers(usersPath);
  const index = users.findIndex((user) => user.id === userId);
  if (index < 0) {
    return null;
  }

  users[index] = {
    ...users[index],
    ...updates
  };
  saveUsers(usersPath, users);
  return sanitizeUser(users[index]);
}

async function updateUserProfilePostgres(userId, updates) {
  const result = await query(
    `
      UPDATE users
      SET
        name = COALESCE($2, name),
        raw = COALESCE(raw, '{}'::jsonb) || $3::jsonb
      WHERE id = $1
      RETURNING id, public_id, email, name, created_at
    `,
    [
      userId,
      updates.name || null,
      JSON.stringify(updates || {})
    ]
  );

  const user = result.rows[0];
  return user
    ? sanitizeUser({
        id: user.id,
        publicId: user.public_id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at
      })
    : null;
}

function loadSessions(sessionsPath) {
  ensureStore(sessionsPath);
  return loadMealLogs(sessionsPath);
}

function saveSessions(sessionsPath, sessions) {
  saveMealLogs(sessionsPath, sessions);
}

function getSessionExpiryIso(createdAt = new Date().toISOString()) {
  return new Date(new Date(createdAt).getTime() + sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
}

function isSessionExpired(session) {
  const expiresAt = session?.expiresAt || getSessionExpiryIso(session?.createdAt);
  const expiresAtMs = new Date(expiresAt).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
}

function pruneExpiredSessions(sessionsPath) {
  const sessions = loadSessions(sessionsPath);
  const activeSessions = sessions.filter((session) => !isSessionExpired(session));
  if (activeSessions.length !== sessions.length) {
    saveSessions(sessionsPath, activeSessions);
  }
  return activeSessions;
}

async function pruneExpiredSessionsPostgres() {
  const cutoffIso = new Date(Date.now() - sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
  await query("DELETE FROM sessions WHERE created_at IS NOT NULL AND created_at < $1", [cutoffIso]);
  return cutoffIso;
}

function hashPassword(password) {
  const salt = randomUUID();
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash || "").split(":");
  if (!salt || !key) {
    return false;
  }

  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(key, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    publicId: user.publicId,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt
  };
}

function registerUser(usersPath, sessionsPath, { email, password, name }) {
  if (isPostgresEnabled()) {
    return registerUserPostgres({ email, password, name });
  }
  const users = loadUsers(usersPath);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  if (users.some((user) => user.email === normalizedEmail)) {
    throw new Error("An account already exists for that email.");
  }

  const user = {
    id: randomUUID(),
    publicId: formatPublicUserId(
      users.reduce((highest, item) => {
        const parsed = parsePublicUserId(item.publicId);
        return parsed && parsed > highest ? parsed : highest;
      }, 0) + 1
    ),
    email: normalizedEmail,
    name: String(name || "").trim() || normalizedEmail.split("@")[0],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(usersPath, users);

  return createSession(sessionsPath, user);
}

async function registerUserPostgres({ email, password, name }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new Error("Email and password are required.");
  }

  const existing = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", [normalizedEmail]);
  if (existing.rows[0]) {
    throw new Error("An account already exists for that email.");
  }

  const sequenceResult = await query(
    `
      SELECT COALESCE(
        MAX(NULLIF(regexp_replace(public_id, '^AST-', ''), '')::integer),
        0
      ) AS max_sequence
      FROM users
    `
  );
  const nextSequence = Number(sequenceResult.rows[0]?.max_sequence || 0) + 1;

  const user = {
    id: randomUUID(),
    publicId: formatPublicUserId(nextSequence),
    email: normalizedEmail,
    name: String(name || "").trim() || normalizedEmail.split("@")[0],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  await query(
    `
      INSERT INTO users (id, public_id, email, name, password_hash, created_at, raw)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [user.id, user.publicId, user.email, user.name, user.passwordHash, user.createdAt, JSON.stringify(user)]
  );

  return createSessionPostgres(user);
}

function loginUser(usersPath, sessionsPath, { email, password }) {
  if (isPostgresEnabled()) {
    return loginUserPostgres({ email, password });
  }
  const users = loadUsers(usersPath);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = users.find((item) => item.email === normalizedEmail);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  return createSession(sessionsPath, user);
}

async function loginUserPostgres({ email, password }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const result = await query(
    `
      SELECT id, public_id, email, name, password_hash, created_at
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );
  const user = result.rows[0];

  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  return createSessionPostgres({
    id: user.id,
    publicId: user.public_id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at
  });
}

function createSession(sessionsPath, user) {
  if (isPostgresEnabled()) {
    return createSessionPostgres(user);
  }
  const sessions = pruneExpiredSessions(sessionsPath);
  const token = randomUUID();
  const createdAt = new Date().toISOString();
  sessions.push({
    token,
    userId: user.id,
    createdAt,
    expiresAt: getSessionExpiryIso(createdAt)
  });
  saveSessions(sessionsPath, sessions);

  return {
    token,
    user: sanitizeUser(user)
  };
}

async function createSessionPostgres(user) {
  await pruneExpiredSessionsPostgres();
  const token = randomUUID();
  const createdAt = new Date().toISOString();
  const session = {
    token,
    userId: user.id,
    createdAt,
    expiresAt: getSessionExpiryIso(createdAt)
  };
  await query(
    `
      INSERT INTO sessions (token, user_id, created_at, raw)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [session.token, session.userId, session.createdAt, JSON.stringify(session)]
  );

  return {
    token,
    user: sanitizeUser(user)
  };
}

function getAuthenticatedUser(usersPath, sessionsPath, request) {
  if (isPostgresEnabled()) {
    return getAuthenticatedUserPostgres(request);
  }
  const userId = String(request.headers["x-user-id"] || "");
  const token = String(request.headers["x-session-token"] || "");

  if (!userId || !token) {
    throw new Error("Authentication required.");
  }

  const sessions = pruneExpiredSessions(sessionsPath);
  const session = sessions.find((item) => item.userId === userId && item.token === token);
  if (!session) {
    throw new Error("Session expired. Please log in again.");
  }

  const users = loadUsers(usersPath);
  const user = users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("User account not found.");
  }

  return sanitizeUser(user);
}

async function getAuthenticatedUserPostgres(request) {
  const cutoffIso = await pruneExpiredSessionsPostgres();
  const userId = String(request.headers["x-user-id"] || "");
  const token = String(request.headers["x-session-token"] || "");

  if (!userId || !token) {
    throw new Error("Authentication required.");
  }

  const result = await query(
    `
      SELECT u.id, u.public_id, u.email, u.name, u.created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.user_id = $1 AND s.token = $2
        AND (s.created_at IS NULL OR s.created_at >= $3)
      LIMIT 1
    `,
    [userId, token, cutoffIso]
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error("Session expired. Please log in again.");
  }

  return sanitizeUser({
    id: user.id,
    publicId: user.public_id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at
  });
}

function logoutSession(sessionsPath, request) {
  if (isPostgresEnabled()) {
    return logoutSessionPostgres(request);
  }
  const userId = String(request.headers["x-user-id"] || "");
  const token = String(request.headers["x-session-token"] || "");
  const sessions = pruneExpiredSessions(sessionsPath).filter(
    (item) => !(item.userId === userId && item.token === token)
  );
  saveSessions(sessionsPath, sessions);
}

async function logoutSessionPostgres(request) {
  await pruneExpiredSessionsPostgres();
  const userId = String(request.headers["x-user-id"] || "");
  const token = String(request.headers["x-session-token"] || "");
  await query("DELETE FROM sessions WHERE user_id = $1 AND token = $2", [userId, token]);
}

module.exports = {
  ensureAuthStores,
  registerUser,
  loginUser,
  getAuthenticatedUser,
  logoutSession,
  updateUserProfile
};
