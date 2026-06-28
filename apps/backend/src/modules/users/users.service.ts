import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository, UserWithRelations } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getById(id: string): Promise<UserWithRelations> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toPublic(user: UserWithRelations) {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      status: user.status,
      roles: UsersRepository.roleNames(user),
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
