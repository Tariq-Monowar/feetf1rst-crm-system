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
  };
};

// --- Redis keys ---

const KEYS = {
  activeUsers: "activeUsers",
  activePartners: "activePartners",
  activeEmployees: "activeEmployees",
  userRole: (userId: string) => `userRole:${userId}`,
  userSockets: (userId: string) => `userSockets:${userId}`,
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
  const open = await prisma.timeline_analytics.findFirst({
    where: { partnerId, leaveAt: null },
    orderBy: { joinAt: "desc" },
  });
  if (open) {
    await prisma.timeline_analytics.update({
      where: { id: open.id },
      data: { leaveAt: new Date() },
    });
  }
}

async function recordEmployeeJoin(partnerId: string, employeeId: string): Promise<void> {
  await prisma.timeline_analytics.create({
    data: { partnerId, employeeId, joinAt: new Date() },
  });
}

async function recordEmployeeLeave(employeeId: string): Promise<void> {
  const open = await prisma.timeline_analytics.findFirst({
    where: { employeeId, leaveAt: null },
    orderBy: { joinAt: "desc" },
  });
  if (open) {
    await prisma.timeline_analytics.update({
      where: { id: open.id },
      data: { leaveAt: new Date() },
    });
  }
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

export function addActiveUser(
  userId: string,
  socketId: string,
  role?: string,
  employeeId?: string,
) {
  void (async () => {
    // 1. Presence: mark user online and link socket
    await redis.sadd(KEYS.activeUsers, userId);
    await redis.sadd(KEYS.userSockets(userId), socketId);
    await redis.set(KEYS.socketToUser(socketId), userId);

    if (!role) {
      await broadcastActiveUsers();
      return;
    }

    await redis.set(KEYS.userRole(userId), role);

    // 2. Role-specific: track in Redis + write timeline_analytics row (join)
    if (role === "PARTNER") {
      await redis.sadd(KEYS.activePartners, userId);
      await recordPartnerJoin(userId);
    }

    if (role === "EMPLOYEE" && employeeId) {
      await redis.sadd(KEYS.activeEmployees, employeeId);
      await redis.set(KEYS.socketToEmployee(socketId), employeeId);
      await recordEmployeeJoin(userId, employeeId);
    }

    await broadcastActiveUsers();
  })();
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

  await redis.srem(KEYS.userSockets(uid), socketId);
  const remainingSockets = await redis.scard(KEYS.userSockets(uid));

  if (remainingSockets === 0) {
    await redis.srem(KEYS.activeUsers, uid);
    await redis.del(KEYS.userSockets(uid), KEYS.userRole(uid));

    if (resolvedRole === "PARTNER") {
      await redis.srem(KEYS.activePartners, uid);
      await recordPartnerLeave(uid);
    }

    if (resolvedRole === "EMPLOYEE" && resolvedEmployeeId) {
      await redis.srem(KEYS.activeEmployees, resolvedEmployeeId);
      await recordEmployeeLeave(resolvedEmployeeId);
    }
  }

  await redis.del(KEYS.socketToUser(socketId), KEYS.socketToEmployee(socketId));
  await broadcastActiveUsers();
}

// --- Public: queries ---

export const getActiveUserIds = () => redis.smembers(KEYS.activeUsers);

export const isUserActive = (id: string) =>
  redis.sismember(KEYS.activeUsers, id).then((n) => n === 1);

export const getActivePartnerIds = () => redis.smembers(KEYS.activePartners);

export const isPartnerActive = (id: string) =>
  redis.sismember(KEYS.activePartners, id).then((n) => n === 1);

export const getActiveEmployeeIds = () => redis.smembers(KEYS.activeEmployees);

export const isEmployeeActive = (id: string) =>
  redis.sismember(KEYS.activeEmployees, id).then((n) => n === 1);
