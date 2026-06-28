import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AddToWatchlistDto } from './dto/watchlist.dto';
import { WatchlistService } from './watchlist.service';

@ApiTags('Watchlist')
@ApiBearerAuth()
@Controller({ path: 'watchlist', version: '1' })
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user’s watchlist' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.watchlist.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Add a title to the watchlist' })
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddToWatchlistDto) {
    return this.watchlist.add(user.sub, dto.titleId);
  }

  @Delete(':titleId')
  @ApiOperation({ summary: 'Remove a title from the watchlist' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('titleId', new ParseUUIDPipe()) titleId: string,
  ) {
    return this.watchlist.remove(user.sub, titleId);
  }
}
