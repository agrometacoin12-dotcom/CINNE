import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminSeriesService } from './admin-series.service';
import {
  CreateEpisodeDto,
  CreateSeasonDto,
  CreateSeriesDto,
  UpdateEpisodeDto,
  UpdateSeasonDto,
  UpdateSeriesDto,
} from './dto/admin-series.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminSeriesController {
  constructor(private readonly series: AdminSeriesService) {}

  // ── Series ──────────────────────────────────────────────────────────────────

  @Get('series')
  @ApiOperation({ summary: 'List series with season/episode counts (admin)' })
  list(@Query('query') query?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.series.list(
      query,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Post('series')
  @ApiOperation({ summary: 'Create a series (admin; starts as DRAFT)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSeriesDto) {
    return this.series.create(dto, user.sub);
  }

  @Get('series/:id')
  @ApiOperation({ summary: 'Get a series with its full season/episode tree (admin)' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.series.get(id);
  }

  @Patch('series/:id')
  @ApiOperation({ summary: 'Update series metadata/status (admin; publish needs a video)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSeriesDto,
  ) {
    return this.series.update(id, dto, user.sub);
  }

  @Delete('series/:id')
  @ApiOperation({ summary: 'Permanently delete a series incl. seasons/episodes (admin)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.series.delete(id, user.sub);
  }

  // ── Seasons ─────────────────────────────────────────────────────────────────

  @Post('series/:id/seasons')
  @ApiOperation({ summary: 'Add a season to a series (admin)' })
  createSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateSeasonDto,
  ) {
    return this.series.createSeason(id, dto, user.sub);
  }

  @Patch('seasons/:seasonId')
  @ApiOperation({ summary: 'Update a season (admin)' })
  updateSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('seasonId', new ParseUUIDPipe()) seasonId: string,
    @Body() dto: UpdateSeasonDto,
  ) {
    return this.series.updateSeason(seasonId, dto, user.sub);
  }

  @Delete('seasons/:seasonId')
  @ApiOperation({ summary: 'Delete a season incl. its episodes (admin)' })
  removeSeason(
    @CurrentUser() user: AuthenticatedUser,
    @Param('seasonId', new ParseUUIDPipe()) seasonId: string,
  ) {
    return this.series.deleteSeason(seasonId, user.sub);
  }

  // ── Episodes ────────────────────────────────────────────────────────────────

  @Post('seasons/:seasonId/episodes')
  @ApiOperation({ summary: 'Add an episode to a season (admin)' })
  createEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('seasonId', new ParseUUIDPipe()) seasonId: string,
    @Body() dto: CreateEpisodeDto,
  ) {
    return this.series.createEpisode(seasonId, dto, user.sub);
  }

  @Patch('episodes/:episodeId')
  @ApiOperation({ summary: 'Update an episode incl. media keys (admin)' })
  updateEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
    @Body() dto: UpdateEpisodeDto,
  ) {
    return this.series.updateEpisode(episodeId, dto, user.sub);
  }

  @Delete('episodes/:episodeId')
  @ApiOperation({ summary: 'Delete an episode (admin)' })
  removeEpisode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
  ) {
    return this.series.deleteEpisode(episodeId, user.sub);
  }
}
