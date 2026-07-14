import {
  Controller,
  Get,
  HttpException,
  NotFoundException,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MediaService } from './media.service';

/**
 * Media ingest + protected video delivery (local-disk driver).
 *
 * Both routes are @Public in the JWT sense but authenticated by the HMAC
 * signature embedded in the URL — exactly like an S3 presigned URL:
 *
 *  - PUT /v1/media/upload   — signed ingest issued by the admin presign
 *    endpoint. The raw request body streams straight to disk with a per-kind
 *    byte cap; the signature also pins the Content-Type.
 *  - GET /v1/media/stream   — signed, short-lived video delivery with HTTP
 *    Range support (206) so AVPlayer (iOS) and <video> (web) can seek.
 *    Videos are NOT served by the public static mounts. The signature also
 *    binds the entitled user id (the `u` query param), so a leaked URL can't
 *    be replayed under a different identity within its TTL.
 */
@ApiTags('Media')
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Put('upload')
  @ApiOperation({ summary: 'Signed local upload (HMAC-authenticated PUT)' })
  async upload(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Req() req: Request,
  ) {
    const declaredLength = req.headers['content-length']
      ? Number(req.headers['content-length'])
      : undefined;
    await this.media.saveLocal(
      key,
      Number(expires),
      sig,
      req,
      req.headers['content-type'] ?? '',
      Number.isFinite(declaredLength) ? declaredLength : undefined,
    );
    return { stored: true, key };
  }

  @Public()
  @Get('stream')
  @ApiOperation({ summary: 'Signed video delivery with HTTP Range support' })
  async stream(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Query('u') u: string,
    @Res() res: Response,
  ) {
    // Throws 400/401 on bad keys or invalid/expired signatures. The signed `u`
    // (entitled user id) is part of the HMAC, so a missing/tampered `u` fails
    // the signature check (CT-05: stream URL bound to the viewer).
    this.media.verifyStreamRequest(key, Number(expires), sig, u ?? '');

    const { exists } = await this.media.statObject(key);
    if (!exists) throw new NotFoundException('Media object not found');

    // res.sendFile (express `send`) implements Accept-Ranges/206 partial
    // content, Content-Type by extension, ETag and Last-Modified — everything
    // AVPlayer and <video> need to seek. `root` re-confines the path.
    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        key,
        {
          root: this.media.localUploadsDir,
          acceptRanges: true,
          dotfiles: 'deny',
          cacheControl: false,
          headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
        },
        (err) => {
          if (!err) return resolve();
          // Client aborts mid-stream surface here once headers are sent;
          // nothing useful can be written to the response anymore.
          if (res.headersSent) return resolve();
          // Preserve real HTTP semantics from express `send` — most notably
          // 416 Range Not Satisfiable, which seeking players rely on.
          const status = (err as { status?: number }).status;
          if (status === 416) {
            return reject(new HttpException('Requested range not satisfiable', 416));
          }
          reject(new NotFoundException('Media object not found'));
        },
      );
    });
  }
}
