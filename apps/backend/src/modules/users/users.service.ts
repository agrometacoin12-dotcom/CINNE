import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAdminUser } from '../../common/guards/admin.guard';
import { UsersRepository, UserWithRelations } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly config: ConfigService,
  ) {}

  async getById(id: string): Promise<UserWithRelations> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toPublic(user: UserWithRelations) {
    const roles = UsersRepository.roleNames(user);
    const adminEmails = this.config.get<string[]>('adminEmails') ?? [];
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      status: user.status,
      roles,
      isAdmin: isAdminUser({ roles, email: user.email }, adminEmails),
      profile: user.profile
        ? {
            displayName: user.profile.displayName,
            avatarUrl: user.profile.avatarUrl,
            locale: user.profile.locale,
          }
        : null,
    };
  }
}
