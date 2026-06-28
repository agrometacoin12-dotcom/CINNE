import { Controller, ForbiddenException, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
