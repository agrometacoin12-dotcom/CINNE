import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { TokensService } from '../auth/tokens.service';
import { MediaService } from '../media/media.service';
import { CatalogueService } from './catalogue.service';
import { SeriesService } from './series.service';

@ApiTags('Catalogue')
@Controller({ path: 'catalogue', version: '1' })
export class CatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly series: SeriesService,
    private readonly tokens: TokensService,
    private readonly media: MediaService,
  ) {}

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
  @ApiOperation({ summary: 'Get a single title (series include their seasons)' })
  async title(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request) {
    const detail = await this.catalogue.getTitle(id);
    if (detail.type !== 'series') return detail;

    // Optional auth: the route stays public, but an authenticated viewer gets
    // per-episode watch-once `consumed` flags in the seasons tree.
    const userId = await this.optionalUserId(req);
    const seasonsList = await this.series.viewerSeasons(id, userId);
    return seasonsList === null ? detail : { ...detail, seasonsList };
  }

  // Free preview. Public and un-watermarked: a trailer sells the ticket, so it
  // must be watchable before purchase. Returns a signed, expiring URL for the
  // TRAILER key ONLY — never the paid videoKey — and opens no entitlement or
  // viewing window. 404 when the title is unpublished or has no trailer.
  @Public()
  @Get('titles/:id/trailer')
  @ApiOperation({ summary: 'Signed URL for a title’s free preview/trailer' })
  async trailer(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ url: string }> {
    const title = await this.catalogue.findRaw(id);
    if (!title || title.status !== 'published' || !title.trailerKey) {
      throw new NotFoundException('Trailer not found');
    }
    const url = this.media.trailerUrl(title.trailerKey);
    if (!url) throw new NotFoundException('Trailer unavailable');
    return { url };
  }

  /** Resolve the caller's user id from a Bearer token, if one is presented. */
  private async optionalUserId(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    const claims = await this.tokens.verifyAccess(header.slice('Bearer '.length));
    return claims?.sub;
  }
}
