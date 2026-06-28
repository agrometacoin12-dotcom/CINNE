import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client wrapper with a global soft-delete read filter. Records with a
 * non-null `deletedAt` are excluded from reads on models that support it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    const softDeleteModels = new Set(['User', 'Profile']);
    this.$use(async (params, next) => {
      if (params.model && softDeleteModels.has(params.model)) {
        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.action = 'findFirst';
          params.args = params.args ?? {};
          params.args.where = { ...params.args.where, deletedAt: null };
        }
        if (params.action === 'findMany') {
          params.args = params.args ?? {};
          params.args.where = { deletedAt: null, ...params.args.where };
        }
      }
      return next(params);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
