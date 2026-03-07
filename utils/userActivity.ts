import type Redis from "ioredis";
import type { Server as SocketIOServer } from "socket.io";

/**
 * User activity tracking + timeline_analytics (join/leave).
 *
 * Schema: timeline_analytics has partnerId (required), employeeId (optional).
 * - Partner online: one row per session with partnerId, employeeId = null, joinAt/leaveAt.
 * - Employee online: one row per session with partnerId + employeeId, joinAt/leaveAt.
 */

// --- Types (matches Prisma timeline_analytics) ---

type TimelineRow = {
  id: string;
};

type TimelineCreate =
  | { partnerId: string; joinAt: Date }
  | { partnerId: string; employeeId: string; joinAt: Date };

type PrismaLike = {
  timeline_analytics: {
    create: (args: { data: TimelineCreate }) => Promise<unknown>;
    findFirst: (args: {
      where: { partnerId?: string; employeeId?: string; leaveAt: null };
      orderBy: { joinAt: "desc" };
    }) => Promise<TimelineRow | null>;
    update: (args: { where: { id: string }; data: { leaveAt: Date } }) => Promise<unknown>;
    updateMany: (args: {
      where: { partnerId?: string; employeeId?: string; leaveAt: null };
      data: { leaveAt: Date };
    }) => Promise<unknown>;
  };
};

// --- Redis keys ---

const KEYS = {
  activeUsers: "activeUsers",
  activePartners: "activePartners",
  activeEmployees: "activeEmployees",
  userRole: (userId: string) => `userRole:${String(userId).trim()}`,
  userSockets: (userId: string) => `userSockets:${String(userId).trim()}`,
  socketToUser: (socketId: string) => `socket:${socketId}`,
  socketToEmployee: (socketId: string) => `socketEmployeeId:${socketId}`,
} as const;

// --- State ---

let redis: Redis;
let io: SocketIOServer;
let prisma: PrismaLike;

export function initUserActivity(r: Redis, s: SocketIOServer, p: PrismaLike) {
  redis = r;
  io = s;
  prisma = p;
}

// --- Helpers: timeline_analytics (join = create row, leave = set leaveAt) ---

async function recordPartnerJoin(partnerId: string): Promise<void> {
  await prisma.timeline_analytics.create({
    data: { partnerId, joinAt: new Date() },
  });
}

async function recordPartnerLeave(partnerId: string): Promise<void> {
  const now = new Date();
  await prisma.timeline_analytics.updateMany({
    where: { partnerId, leaveAt: null },
    data: { leaveAt: now },
  });
}

async function recordEmployeeJoin(partnerId: string, employeeId: string): Promise<void> {
  await prisma.timeline_analytics.create({
    data: { partnerId, employeeId, joinAt: new Date() },
  });
}

async function recordEmployeeLeave(employeeId: string): Promise<void> {
  const now = new Date();
  await prisma.timeline_analytics.updateMany({
    where: { employeeId, leaveAt: null },
    data: { leaveAt: now },
  });
}

// --- Helpers: Redis presence ---

async function broadcastActiveUsers(): Promise<void> {
  const ids = await redis.smembers(KEYS.activeUsers);
  io.emit("activeUsers", ids);
}

async function getCachedRole(userId: string): Promise<string | null> {
  return redis.get(KEYS.userRole(userId));
}

async function getCachedEmployeeId(socketId: string): Promise<string | null> {
  return redis.get(KEYS.socketToEmployee(socketId));
}

// --- Public: add user (join) ---

export async function addActiveUser(
  userId: string,
  socketId: string,
  role?: string,
  employeeId?: string,
): Promise<void> {
  // 1. Presence: mark user online and link socket
  await redis.sadd(KEYS.activeUsers, userId);
  await redis.sadd(KEYS.userSockets(userId), socketId);
  await redis.set(KEYS.socketToUser(socketId), userId);

  if (!role) {
    await broadcastActiveUsers();
    return;
  }

  await redis.set(KEYS.userRole(userId), role);

  // 2. Role-specific: track in Redis + one timeline row per session (first socket only)
  const socketCount = await redis.scard(KEYS.userSockets(userId));
  const isFirstSocket = socketCount === 1;

  if (role === "PARTNER") {
    await redis.sadd(KEYS.activePartners, userId);
    if (isFirstSocket) await recordPartnerJoin(userId);
  }

  if (role === "EMPLOYEE" && employeeId) {
    await redis.sadd(KEYS.activeEmployees, employeeId);
    await redis.set(KEYS.socketToEmployee(socketId), employeeId);
    if (isFirstSocket) await recordEmployeeJoin(userId, employeeId);
  }

  await broadcastActiveUsers();

  // If disconnect ran already (socket no longer in set), undo active state so isActive stays false
  const stillPresent = await redis.sismember(KEYS.userSockets(userId), socketId);
  console.log("stillPresent", stillPresent);
  if (!stillPresent) {
    if (role === "PARTNER") await redis.srem(KEYS.activePartners, userId);
    if (role === "EMPLOYEE" && employeeId) await redis.srem(KEYS.activeEmployees, employeeId);
  }
}

// --- Public: remove user (leave) ---

export async function removeActiveUser(
  socketId: string,
  userId?: string,
  role?: string,
  employeeId?: string,
): Promise<void> {
  const uid = userId ?? (await redis.get(KEYS.socketToUser(socketId)));
  if (!uid) return;

  const resolvedRole = role ?? (await getCachedRole(uid));
  const resolvedEmployeeId = employeeId ?? (await getCachedEmployeeId(socketId));

  // Always remove this socket from the user's set so getPartnerIdsWithSockets sees 0
  await redis.srem(KEYS.userSockets(uid), socketId);
  const remainingSockets = await redis.scard(KEYS.userSockets(uid));

  // Always remove from role sets on this socket's disconnect; re-add only if other sockets remain
  if (resolvedRole === "PARTNER") {
    await redis.srem(KEYS.activePartners, uid);
    if (remainingSockets > 0) await redis.sadd(KEYS.activePartners, uid);
    else {
      try {
        await recordPartnerLeave(uid);
      } catch (_) {}
    }
  }
  if (resolvedRole === "EMPLOYEE" && resolvedEmployeeId) {
    await redis.srem(KEYS.activeEmployees, resolvedEmployeeId);
    if (remainingSockets > 0) await redis.sadd(KEYS.activeEmployees, resolvedEmployeeId);
    else {
      try {
        await recordEmployeeLeave(resolvedEmployeeId);
      } catch (_) {}
    }
  }

  if (remainingSockets === 0) {
    await redis.srem(KEYS.activeUsers, uid);
    await redis.del(KEYS.userSockets(uid), KEYS.userRole(uid));
  }

  await redis.del(KEYS.socketToUser(socketId), KEYS.socketToEmployee(socketId));
  await broadcastActiveUsers();
}

// --- Public: queries ---

export const getActiveUserIds = () => redis.smembers(KEYS.activeUsers);

export const isUserActive = (id: string) =>
  redis.sismember(KEYS.activeUsers, id).then((n) => n === 1);

export const getActivePartnerIds = () => redis.smembers(KEYS.activePartners);

/** Source of truth: partner is active iff they have ≥1 socket in userSockets(id). */
export async function getPartnerIdsWithSockets(
  partnerIds: string[],
): Promise<string[]> {
  if (partnerIds.length === 0) return [];
  const pipeline = redis.pipeline();
  for (const id of partnerIds) pipeline.scard(KEYS.userSockets(id));
  const results = await pipeline.exec();
  const active: string[] = [];
  results?.forEach((reply, i) => {
    const [err, count] = reply ?? [];
    if (!err && count != null && Number(count) > 0) active.push(partnerIds[i]);
  });
  return active;
}

export const isPartnerActive = (id: string) =>
  redis.sismember(KEYS.activePartners, id).then((n) => n === 1);

export const getActiveEmployeeIds = () => redis.smembers(KEYS.activeEmployees);

export const isEmployeeActive = (id: string) =>
  redis.sismember(KEYS.activeEmployees, id).then((n) => n === 1);
