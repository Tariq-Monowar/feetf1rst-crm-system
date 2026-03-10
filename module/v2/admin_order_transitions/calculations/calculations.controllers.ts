import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { Prisma } from "@prisma/client";
import redis from "../../../../config/redis.config";
