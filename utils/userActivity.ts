import type Redis from "ioredis";
import type { Server as SocketIOServer } from "socket.io";

type PrismaLike = {
  timeline_analytics: {
    create: (args: { data: { partnerId: string; joinAt: Date } }) => Promise<unknown>;
    findFirst: (args: { where: { partnerId: string; leaveAt: null }; orderBy: { joinAt: "asc" | "desc" } }) => Promise<{ id: string } | null>;
    update: (args: { where: { id: string }; data: { leaveAt: Date } }) => Promise<unknown>;
  };
};

const ACTIVE_USERS_KEY = "activeUsers";
const ACTIVE_PARTNERS_KEY = "activePartners";
const USER_ROLE_PREFIX = "userRole:";

let redis: Redis;
let io: SocketIOServer;
let prisma: PrismaLike;

export function initUserActivity(r: Redis, s: SocketIOServer, p: PrismaLike) {
  redis = r;
  io = s;
  prisma = p;
}

const broadcast = () =>
  redis.smembers(ACTIVE_USERS_KEY).then((ids) => io.emit("activeUsers", ids));

export function addActiveUser(userId: string, socketId: string, role?: string) {
  void (async () => {
    await redis.sadd(ACTIVE_USERS_KEY, userId);
    await redis.sadd(`userSockets:${userId}`, socketId);
    await redis.set(`socket:${socketId}`, userId);
    if (role) {
      await redis.set(`${USER_ROLE_PREFIX}${userId}`, role);
      if (role === "PARTNER") {
        await redis.sadd(ACTIVE_PARTNERS_KEY, userId);
        await prisma.timeline_analytics.create({
          data: { partnerId: userId, joinAt: new Date() },
        });
      }
    }
    broadcast();
  })();
}

export function removeActiveUser(
  socketId: string,
  userId?: string,
  role?: string,
) {
  void (async () => {
    const uid = userId ?? (await redis.get(`socket:${socketId}`));
    if (!uid) return;
    const roleKey = `${USER_ROLE_PREFIX}${uid}`;
    await redis.srem(`userSockets:${uid}`, socketId);
    if ((await redis.scard(`userSockets:${uid}`)) === 0) {
      await redis.srem(ACTIVE_USERS_KEY, uid);
      await redis.del(`userSockets:${uid}`, roleKey);
      const isPartner = (role ?? (await redis.get(roleKey))) === "PARTNER";
      if (isPartner) {
        await redis.srem(ACTIVE_PARTNERS_KEY, uid);
        const open = await prisma.timeline_analytics.findFirst({
          where: { partnerId: uid, leaveAt: null },
          orderBy: { joinAt: "desc" },
        });
        if (open)
          await prisma.timeline_analytics.update({
            where: { id: open.id },
            data: { leaveAt: new Date() },
          });
      }
    }
    await redis.del(`socket:${socketId}`);
    broadcast();
  })();
}

export const getActiveUserIds = () => redis.smembers(ACTIVE_USERS_KEY);

export const isUserActive = (id: string) =>
  redis.sismember(ACTIVE_USERS_KEY, id).then((n) => n === 1);

export const getActivePartnerIds = () => redis.smembers(ACTIVE_PARTNERS_KEY);

export const isPartnerActive = (id: string) =>
  redis.sismember(ACTIVE_PARTNERS_KEY, id).then((n) => n === 1);
