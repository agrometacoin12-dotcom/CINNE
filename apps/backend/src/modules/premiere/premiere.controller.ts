import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PremiereService } from './premiere.service';
import { PostChatDto } from './dto/premiere.dto';

@ApiTags('Premiere')
@Controller({ path: 'premieres', version: '1' })
export class PremiereController {
  constructor(private readonly premiere: PremiereService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List premieres (upcoming + live)' })
  list() {
    return this.premiere.list();
  }

  @ApiBearerAuth()
  @Get(':titleId/room')
  @ApiOperation({ summary: 'Premiere room state (live + chat eligibility)' })
  room(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
  ) {
    return this.premiere.room(user.sub, titleId);
  }

  @ApiBearerAuth()
  @Get(':titleId/chat')
  @ApiOperation({ summary: 'Fetch live-chat messages (poll with ?since=)' })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
    @Query('since') since?: string,
  ) {
    return this.premiere.messages(user.sub, titleId, since);
  }

  @ApiBearerAuth()
  @Post(':titleId/chat')
  @ApiOperation({ summary: 'Post a live-chat message' })
  post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
    @Body() dto: PostChatDto,
  ) {
    return this.premiere.post(user.sub, titleId, dto.body);
  }
}
