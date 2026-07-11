import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import {
  CreateMovieDto,
  PresignUploadDto,
  SetFeaturedDto,
  SetPremiereDto,
  SetUserRolesDto,
  SetUserStatusDto,
  UpdateMovieDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('movies')
  @ApiOperation({ summary: 'List all titles incl. drafts (admin)' })
  list() {
    return this.admin.list();
  }

  @Get('movies/:id')
  @ApiOperation({ summary: 'Get a single title with admin fields' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.get(id);
  }

  @Post('movies')
  @ApiOperation({ summary: 'Create a movie (admin)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMovieDto) {
    return this.admin.create(dto, user.sub);
  }

  @Patch('movies/:id')
  @ApiOperation({ summary: 'Update a movie incl. pricing (admin)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMovieDto,
  ) {
    return this.admin.update(id, dto, user.sub);
  }

  @Delete('movies/:id')
  @ApiOperation({ summary: 'Permanently delete a movie (admin)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.delete(id, user.sub);
  }

  @Put('movies/:id/featured')
  @ApiOperation({ summary: 'Set/clear the featured hero (admin)' })
  setFeatured(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetFeaturedDto,
  ) {
    return this.admin.setFeatured(id, dto.featured, user.sub);
  }

  @Put('movies/:id/premiere')
  @ApiOperation({ summary: 'Schedule/cancel a premiere (admin)' })
  setPremiere(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetPremiereDto,
  ) {
    return this.admin.setPremiere(id, dto, user.sub);
  }

  @Post('uploads/presign')
  @ApiOperation({ summary: 'Presign an upload PUT for a video/poster/hero (admin)' })
  presign(@Body() dto: PresignUploadDto) {
    return this.admin.presignUpload(dto);
  }

  @Get('uploads/stat')
  @ApiOperation({ summary: 'Stat an uploaded media object by key (admin)' })
  uploadStat(@Query('key') key?: string) {
    return this.admin.uploadStat(key);
  }

  @Get('users')
  @ApiOperation({ summary: 'List members with roles + purchase counts (admin)' })
  users(@Query('q') q?: string, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.admin.listUsers(
      q,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Put('users/:id/roles')
  @ApiOperation({ summary: "Replace a member's roles (admin; no self-demotion)" })
  setUserRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserRolesDto,
  ) {
    return this.admin.setUserRoles(id, dto.roles, user.sub);
  }

  @Put('users/:id/status')
  @ApiOperation({ summary: 'Suspend or reactivate a member (admin)' })
  setUserStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserStatusDto,
  ) {
    return this.admin.setUserStatus(id, dto.status, user.sub);
  }

  @Post('users/:id/verify')
  @ApiOperation({ summary: "Force-verify a member's email (admin)" })
  verifyUser(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.verifyUser(id, user.sub);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Sales ledger: purchases + buyer + entitlement (admin)' })
  purchases(
    @Query('q') q?: string,
    @Query('titleId') titleId?: string,
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.admin.listPurchases({
      q,
      titleId,
      status,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('audit')
  @ApiOperation({ summary: 'Audit feed, newest first (admin)' })
  auditFeed(@Query('take') take?: string, @Query('skip') skip?: string) {
    return this.admin.listAudit(take ? Number(take) : undefined, skip ? Number(skip) : undefined);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Studio overview stats (admin)' })
  stats() {
    return this.admin.stats();
  }
}
