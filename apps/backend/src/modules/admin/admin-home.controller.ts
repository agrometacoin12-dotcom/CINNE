import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminHomeService } from './admin-home.service';
import {
  CreateCollectionDto,
  ReorderHomeSectionsDto,
  UpdateCollectionDto,
  UpdateHomeSectionDto,
} from './dto/admin-classification.dto';

/** Rule-based homepage: sections, order, preview and editorial collections. */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminHomeController {
  constructor(private readonly home: AdminHomeService) {}

  @Get('home-sections')
  @ApiOperation({ summary: 'Homepage sections in order, with eligible counts (admin)' })
  list() {
    return this.home.listSections();
  }

  @Put('home-sections/order')
  @ApiOperation({ summary: 'Reorder homepage sections; every id exactly once (admin)' })
  reorder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderHomeSectionsDto) {
    return this.home.reorderSections(dto.ids, user.sub);
  }

  @Patch('home-sections/:id')
  @ApiOperation({ summary: 'Update a homepage section (admin)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHomeSectionDto,
  ) {
    return this.home.updateSection(id, dto, user.sub);
  }

  @Get('home-preview')
  @ApiOperation({ summary: 'What browse returns now, plus why other sections are hidden (admin)' })
  preview() {
    return this.home.preview();
  }

  @Post('collections')
  @ApiOperation({ summary: 'Create an editorial collection (admin)' })
  createCollection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCollectionDto) {
    return this.home.createCollection(dto, user.sub);
  }

  @Patch('collections/:slug')
  @ApiOperation({ summary: 'Rename or describe a collection (admin)' })
  updateCollection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.home.updateCollection(slug, dto, user.sub);
  }
}
