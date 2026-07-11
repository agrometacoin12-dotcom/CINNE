import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateProgressDto } from './dto/playback.dto';
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

  @Get('continue')
  @ApiOperation({ summary: "The caller's Continue-watching rail (newest first)" })
  continueWatching(@CurrentUser() user: AuthenticatedUser) {
    return this.playback.continueWatching(user.sub);
  }

  @Put(':titleId/progress')
  @ApiOperation({ summary: 'Save resume position (player heartbeat, ~10s cadence)' })
  saveProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.playback.saveProgress(user.sub, titleId, dto);
  }

  @Delete(':titleId/progress')
  @ApiOperation({ summary: 'Remove a title from Continue watching' })
  clearProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
  ) {
    return this.playback.clearProgress(user.sub, titleId);
  }
}
