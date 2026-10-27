import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AccountDeletionService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
