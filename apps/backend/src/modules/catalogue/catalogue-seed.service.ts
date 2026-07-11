import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { CATALOGUE_REPOSITORY, type CatalogueRepository } from './domain/catalogue.repository';
import { SAMPLE_CATALOGUE } from './data/sample-catalogue';

/**
 * Boot-time demo seeding for the persistent (Prisma) catalogue.
 *
 * When the catalogue table is EMPTY and CATALOGUE_SEED_DEMO resolves true
 * (default: true outside production, false in production), the bundled
 * SAMPLE_CATALOGUE is inserted so a fresh dev/staging stack renders a full
 * browse page. Production defaults to a clean catalogue for real admin
 * content.
 *
 * The sample titles reference art under `art/{posters,hero}/<id>.jpg`; those
 * files are bundled with the backend at `assets/art/**` and copied into
 * MEDIA_UPLOADS_DIR (served at /media/<key>) so the demo catalogue is fully
 * self-sufficient on any host. Copying is idempotent — existing files are
 * left untouched.
 */
@Injectable()
export class CatalogueSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogueSeedService.name);

  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly repo: CatalogueRepository,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('catalogueDriver') !== 'prisma') return;
    if (!this.config.get<boolean>('catalogueSeedDemo')) return;

    try {
      const existing = await this.repo.listAll();
      if (existing.length === 0) {
        // Only ever insert into an EMPTY catalogue.
        for (const title of SAMPLE_CATALOGUE) {
          await this.repo.save(title);
        }
        this.logger.log(`Seeded ${SAMPLE_CATALOGUE.length} demo titles into the catalogue`);
      }

      // Always (re)bootstrap the bundled artwork while demo seeding is on: the
      // database persists across deploys but MEDIA_UPLOADS_DIR may live on an
      // ephemeral filesystem, so previously copied art can vanish on redeploy
      // while the seeded rows (and their art keys) remain. The copy skips
      // files that already exist, so this is a cheap no-op when nothing is
      // missing.
      await this.copySeedArtwork();
    } catch (err) {
      // Seeding is best-effort convenience; never block boot on it.
      this.logger.error(`Demo catalogue seeding failed: ${(err as Error).message}`);
    }
  }

  /** Copy bundled seed artwork into the local media dir (skip files that exist). */
  private async copySeedArtwork(): Promise<void> {
    const assetsDir = path.join(process.cwd(), 'assets', 'art');
    const uploadsDir =
      this.config.get<string>('mediaUploadsDir') ?? path.join(process.cwd(), 'uploads');

    let copied = 0;
    for (const kind of ['posters', 'hero']) {
      const srcDir = path.join(assetsDir, kind);
      const destDir = path.join(uploadsDir, 'art', kind);
      let files: string[];
      try {
        files = await fs.readdir(srcDir);
      } catch {
        this.logger.warn(`Seed artwork directory missing: ${srcDir} — skipping`);
        continue;
      }
      await fs.mkdir(destDir, { recursive: true });
      for (const file of files) {
        const dest = path.join(destDir, file);
        try {
          await fs.copyFile(path.join(srcDir, file), dest, fs.constants.COPYFILE_EXCL);
          copied += 1;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        }
      }
    }
    if (copied > 0) this.logger.log(`Copied ${copied} seed artwork files into ${uploadsDir}/art`);
  }
}
