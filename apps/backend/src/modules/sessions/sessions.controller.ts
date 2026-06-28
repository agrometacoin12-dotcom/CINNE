import { Controller, Delete, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller({ path: 'sessions', version: '1' })
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.listActive(user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a specific session' })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessions.revoke(user.sub, id);
  }
}
