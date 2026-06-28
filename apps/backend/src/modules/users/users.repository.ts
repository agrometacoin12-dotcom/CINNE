import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export type UserWithRelations = User & {
  roles: { role: { name: string } }[];
  profile: { displayName: string; avatarUrl: string | null; locale: string } | null;
};

/**
 * Repository pattern: the only place that knows how Users are persisted.
 * Services depend on this abstraction, not on Prisma directly.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly relations = {
    roles: { include: { role: true } },
    profile: true,
  } satisfies Prisma.UserInclude;

  findById(id: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findFirst({
      where: { id },
      include: this.relations,
    }) as Promise<UserWithRelations | null>;
  }

  findByEmail(email: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      include: this.relations,
    }) as Promise<UserWithRelations | null>;
  }

  async createWithProfile(input: {
    email: string;
    passwordHash?: string;
    cognitoSub?: string;
    displayName: string;
  }): Promise<UserWithRelations> {
    const userRole = await this.prisma.role.findUnique({ where: { name: 'user' } });
    return this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        cognitoSub: input.cognitoSub,
        profile: { create: { displayName: input.displayName, locale: 'en' } },
        roles: userRole ? { create: { roleId: userRole.id } } : undefined,
      },
      include: this.relations,
    }) as Promise<UserWithRelations>;
  }

  markEmailVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { emailVerified: true, status: 'ACTIVE', version: { increment: 1 } },
    });
  }

  updatePassword(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, version: { increment: 1 } },
    });
  }

  static roleNames(user: UserWithRelations): string[] {
    return user.roles.map((r) => r.role.name);
  }
}
