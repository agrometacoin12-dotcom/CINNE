import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClassificationService } from '../catalogue/classification/classification.service';
import { UpdateClassificationDto } from './dto/admin-classification.dto';

/** Title classification: vocabularies and per-title genres/tags/industries/… */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminClassificationController {
  constructor(private readonly classification: ClassificationService) {}

  @Get('taxonomy')
  @ApiOperation({ summary: 'Genres, tags, industries, collections and fixed choices (admin)' })
  taxonomy() {
    return this.classification.taxonomy();
  }

  @Get('titles/:id/classification')
  @ApiOperation({ summary: "A movie or series' classification and homepage placement (admin)" })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.classification.get(id);
  }

  @Put('titles/:id/classification')
  @ApiOperation({ summary: 'Update a movie or series classification (admin)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateClassificationDto,
  ) {
    return this.classification.update(id, dto, user.sub);
  }
}
