import { Controller, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MediaService } from './media.service';

/**
 * Local media ingest — the "presigned PUT" endpoint used when S3 isn't
 * configured. Authenticated by the HMAC signature embedded in the URL (issued
 * by the admin presign endpoint), not by a bearer token, exactly like an S3
 * presigned URL. The raw request body is streamed straight to disk.
 */
@ApiTags('Media')
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Put('upload')
  @ApiOperation({ summary: 'Signed local upload (dev / no-S3 driver)' })
  async upload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Req() req: Request,
  ) {
    await this.media.saveLocal(key, Number(expires), sig, req);
    return { stored: true, key };
  }
}
