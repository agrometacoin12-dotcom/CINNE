import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Equals } from 'class-validator';
import { AccountDeletionService } from './account-deletion.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

class DeleteAccountDto {
  @Equals('DELETE')
  confirmation!: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService, private readonly deletion: AccountDeletionService) {}

  @Delete('me')
  deleteMe(@CurrentUser() principal: AuthenticatedUser, @Body() _body: DeleteAccountDto) {
    return this.deletion.delete(principal.sub);
  }

  @Get(':id')
  async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() principal: AuthenticatedUser,
  ) {
    const isSelf = principal.sub === id;
    const isAdmin = principal.roles.includes('admin');
    if (!isSelf && !isAdmin) throw new ForbiddenException('Cannot access another user');
    return this.users.toPublic(await this.users.getById(id));
  }
}
