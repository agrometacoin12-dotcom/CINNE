import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AdaptiveMediaService } from './adaptive-media.service';

const compressPlaylist = promisify(gzip);

@Controller({ path: 'media/hls', version: '1' })
export class AdaptiveMediaController {
  constructor(private readonly media: AdaptiveMediaService) {}

  @Public()
  @Get(':asset/:build/:file')
  async get(
    @Param('asset') asset: string,
    @Param('build') build: string,
    @Param('file') file: string,
    @Query('u') user: string,
    @Query('expires') expiry: string,
    @Query('scope') scope: string,
    @Query('sig') sig: string,
    @Headers('accept-encoding') acceptEncoding: string | undefined,
    @Res() res: Response,
  ) {
    const key = `hls/${asset}/${build}/${file}`;
    const expires = Number(expiry);
    this.media.verify(key, user, expires, scope, sig);
    res.setHeader('Cache-Control', 'private, no-store');
    if (file.endsWith('.m3u8')) {
      const playlist = await this.media.playlist(key, user, expires, scope);
      res.type('application/vnd.apple.mpegurl').vary('Accept-Encoding');
      // Long films have thousands of signed segment URLs. Compress the manifest
      // so fetching its index does not become another startup bottleneck.
      if (playlist.length > 1024 && /(?:^|,)\s*gzip(?:\s*,|\s*$)/i.test(acceptEncoding ?? '')) {
        res.setHeader('Content-Encoding', 'gzip');
        res.send(await compressPlaylist(playlist));
      } else {
        res.send(playlist);
      }
      return;
    }
    const remote = await this.media.remoteSegmentUrl(key, expires);
    if (remote) {
      res.redirect(307, remote);
      return;
    }
    res.type('video/mp2t');
    res.sendFile(key, { root: this.media.localRoot, dotfiles: 'deny', cacheControl: false });
  }
}
