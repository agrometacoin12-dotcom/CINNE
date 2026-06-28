import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogueService } from './catalogue.service';

@ApiTags('Catalogue')
@Controller({ path: 'catalogue', version: '1' })
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  // Browse is public so the landing experience works pre-auth.
  @Public()
  @Get('browse')
  @ApiOperation({ summary: 'Featured hero + curated browse rows' })
  browse() {
    return this.catalogue.browse();
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search the catalogue' })
  search(@Query('q') q = '') {
    return this.catalogue.search(q);
  }

  @Public()
  @Get('titles/:id')
  @ApiOperation({ summary: 'Get a single title' })
  title(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalogue.getTitle(id);
  }
}
