import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaybackService } from './playback.service';

@ApiTags('Playback')
@ApiBearerAuth()
@Controller({ path: 'playback', version: '1' })
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Post(':titleId/start')
  @ApiOperation({ summary: 'Authorize playback and open the single-view window' })
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
  ) {
    return this.playback.start({ sub: user.sub, email: user.email }, titleId);
  }

  @Get(':titleId/status')
  @ApiOperation({ summary: 'Check access without opening the window' })
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
  ) {
    return this.playback.status({ sub: user.sub }, titleId);
  }
}
