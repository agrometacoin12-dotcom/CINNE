import { ConfigService } from '@nestjs/config';
import { MediaService } from '../media/media.service';
import { CatalogueService } from './catalogue.service';
import { BROWSE_ROWS } from './domain/title.entity';
import type { HomeService } from './home/home.service';
import { LocalCatalogueRepository } from './repositories/local-catalogue.repository';
import { LocalSearchProvider } from './repositories/local-search.provider';

describe('Catalogue artwork delivery', () => {
  const posterKey = 'originals/poster/upload.png';
  const heroKey = 'originals/hero/upload.png';
  const api = 'https://api.cinnetemple.com';

  async function fixture(settings: Record<string, string> = {}) {
    const repo = new LocalCatalogueRepository();
    const title = (await repo.listAll())[0]!;
    await repo.update(title.id, { posterKey, heroKey });
    const media = new MediaService(new ConfigService({ apiPublicUrl: api, ...settings }));
    const catalogue = new CatalogueService(repo, new LocalSearchProvider(repo), media);
    return { catalogue, title, repo };
  }

  it('uses the image facade for bucket artwork in Studio, details, search and browse', async () => {
    const { catalogue, title } = await fixture({ mediaOriginalsBucket: 'test-media' });
    const posterUrl = `${api}/v1/media/image?key=${encodeURIComponent(posterKey)}`;
    const heroUrl = `${api}/v1/media/image?key=${encodeURIComponent(heroKey)}`;
    expect(await catalogue.adminGet(title.id)).toMatchObject({ posterKey, heroKey, posterUrl, heroUrl });
    expect(await catalogue.getTitle(title.id)).toMatchObject({ posterUrl, heroUrl });
    expect((await catalogue.adminList()).find(t => t.id === title.id)).toMatchObject({ posterUrl, heroUrl });
    expect((await catalogue.search(title.title)).results.find(t => t.id === title.id)).toMatchObject({ posterUrl });
    expect(await catalogue.summaryFor(title.id)).toMatchObject({ posterUrl });
    const browse = await catalogue.browse();
    expect(browse.rows.flatMap(row => row.items).find(t => t.id === title.id)).toMatchObject({ posterUrl });
  });

  it('preserves local-disk URLs when no bucket is configured', async () => {
    const { catalogue, title } = await fixture();
    expect(await catalogue.getTitle(title.id)).toMatchObject({
      posterUrl: `${api}/media/${posterKey}`, heroUrl: `${api}/media/${heroKey}`,
    });
  });

  it('uses the configured CDN without duplicate slashes', async () => {
    const { catalogue, title } = await fixture({ mediaOriginalsBucket: 'test-media', mediaBaseUrl: 'https://cdn.example.com/' });
    expect(await catalogue.getTitle(title.id)).toMatchObject({
      posterUrl: `https://cdn.example.com/${posterKey}`, heroUrl: `https://cdn.example.com/${heroKey}`,
    });
  });

  it('preserves absolute artwork URLs and missing artwork', async () => {
    const { catalogue, title, repo } = await fixture({ mediaOriginalsBucket: 'test-media' });
    await repo.update(title.id, { posterKey: 'https://images.example.com/poster.png', heroKey: null });
    expect(await catalogue.getTitle(title.id)).toMatchObject({ posterUrl: 'https://images.example.com/poster.png', heroUrl: null });
  });
});

describe('CatalogueService.browse drivers', () => {
  const media = new MediaService(new ConfigService({ apiPublicUrl: 'https://api.example.com' }));
  const homeRows = [{ slug: 'newly-added', title: 'Newly Added', items: [] }];

  function make(driver?: string) {
    const repo = new LocalCatalogueRepository();
    const home = { rows: jest.fn(async () => homeRows) } as unknown as HomeService;
    const config = new ConfigService(driver ? { catalogueDriver: driver } : {});
    const catalogue = new CatalogueService(repo, new LocalSearchProvider(repo), media, home, config);
    return { catalogue, home };
  }

  it('uses the rule-based homepage rows with the prisma driver (the default)', async () => {
    for (const driver of ['prisma', undefined]) {
      const { catalogue, home } = make(driver);
      const browse = await catalogue.browse();
      expect(browse.rows).toBe(homeRows);
      expect(browse.hero).not.toBeNull();
      expect(home.rows).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['local', 'dynamodb'])('keeps the legacy BROWSE_ROWS with the %s driver', async (driver) => {
    const { catalogue, home } = make(driver);
    const browse = await catalogue.browse();
    expect(home.rows).not.toHaveBeenCalled();
    expect(browse.rows.length).toBeGreaterThan(0);
    expect(browse.rows.every((r) => BROWSE_ROWS.some((b) => b.slug === r.slug))).toBe(true);
  });
});
