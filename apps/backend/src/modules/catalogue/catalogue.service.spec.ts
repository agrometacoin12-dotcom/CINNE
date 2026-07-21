import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogueService } from './catalogue.service';
import type { CatalogueRepository } from './domain/catalogue.repository';
import type { SearchProvider } from './domain/search.provider';
import { withCommerceDefaults, type SeedTitle, type Title } from './domain/title.entity';

describe('CatalogueService', () => {
  const config = {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        mediaBaseUrl: 'https://cdn.cinnetemple.com',
        apiPublicUrl: 'https://api.cinnetemple.com',
      };
      return map[key];
    },
  } as unknown as ConfigService;

  const baseTitle = (overrides: Partial<Title> = {}): Title => {
    const seed: SeedTitle = {
      id: '11111111-0000-4000-8000-000000000001',
      type: 'movie',
      title: 'Test Movie',
      tagline: null,
      overview: 'A test overview.',
      year: 2026,
      genres: ['Drama'],
      runtimeMinutes: 100,
      seasons: null,
      maturityRating: '16+',
      rating: 8.1,
      posterKey: 'posters/test.jpg',
      heroKey: null,
      cast: [],
      director: null,
      categories: ['trending'],
      popularity: 50,
      featured: false,
    };
    return { ...withCommerceDefaults(seed), ...overrides };
  };

  const makeService = (titles: Title[]) => {
    const repo = {
      findById: jest.fn(async (id: string) => titles.find((t) => t.id === id) ?? null),
    } as unknown as CatalogueRepository;
    const search = { search: jest.fn(async () => []) } as unknown as SearchProvider;
    return new CatalogueService(repo, search, config);
  };

  describe('getTitle (public detail route)', () => {
    it('returns published titles', async () => {
      const title = baseTitle({ status: 'published' });
      const detail = await makeService([title]).getTitle(title.id);
      expect(detail.id).toBe(title.id);
      expect(detail.title).toBe('Test Movie');
      // Public DTO must not carry admin-only fields.
      expect(detail).not.toHaveProperty('status');
      expect(detail).not.toHaveProperty('videoKey');
    });

    it('404s for draft titles fetched by direct UUID (metadata leak regression)', async () => {
      const draft = baseTitle({ status: 'draft' });
      await expect(makeService([draft]).getTitle(draft.id)).rejects.toThrow(NotFoundException);
    });

    it('404s for unknown ids', async () => {
      await expect(
        makeService([]).getTitle('99999999-0000-4000-8000-000000000009'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminGet (admin surface)', () => {
    it('still returns draft titles', async () => {
      const draft = baseTitle({ status: 'draft' });
      const detail = await makeService([draft]).adminGet(draft.id);
      expect(detail.id).toBe(draft.id);
      expect(detail.status).toBe('draft');
    });
  });
});
