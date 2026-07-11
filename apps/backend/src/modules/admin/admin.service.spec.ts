import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import type { Title } from '../catalogue/domain/title.entity';
import type { UpdateMovieDto } from './dto/admin.dto';

/** UpdateMovieDto is a partial update at runtime; relax the compile-time shape. */
const dto = (d: Partial<UpdateMovieDto>) => d as UpdateMovieDto;

const baseTitle: Title = {
  id: '22222222-2222-2222-2222-222222222222',
  type: 'movie',
  title: 'The Long Rain',
  tagline: 'It never stops',
  overview: 'A storm-bound thriller.',
  year: 2026,
  genres: ['thriller'],
  runtimeMinutes: 110,
  seasons: null,
  maturityRating: '16',
  rating: 0,
  posterKey: 'posters/rain.jpg',
  heroKey: 'heroes/rain.jpg',
  cast: [],
  director: 'A. Director',
  categories: ['new-listings'],
  popularity: 50,
  featured: false,
  status: 'published',
  priceMinor: 150000,
  currency: 'NGN',
  videoKey: 'videos/rain.mp4',
  durationSeconds: 6600,
  isPremiere: false,
  premiereStartAt: null,
};

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

function build(overrides: { existing?: Title | null; user?: unknown } = {}) {
  const existing = overrides.existing === undefined ? { ...baseTitle } : overrides.existing;

  const catalogue = {
    findRaw: jest.fn(async () => existing),
    updateTitle: jest.fn(async (_id: string, patch: Partial<Title>) => ({
      ...baseTitle,
      ...patch,
    })),
    deleteTitle: jest.fn(async () => undefined),
    adminGet: jest.fn(),
    adminList: jest.fn(async () => []),
  };
  const media = { presignUpload: jest.fn() };
  const audit = { record: jest.fn(async () => undefined) };
  const events = { publish: jest.fn(async () => undefined) };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => overrides.user ?? null),
      update: jest.fn(async () => overrides.user ?? null),
      count: jest.fn(async () => 0),
    },
    purchase: { count: jest.fn(async () => 3) },
    role: {
      upsert: jest.fn(async ({ where }: { where: { name: string } }) => ({
        id: `role-${where.name}`,
        name: where.name,
      })),
    },
    userRole: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    auditLog: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const config = { get: () => 'NGN' } as unknown as ConfigService;

  const service = new AdminService(
    catalogue as never,
    media as never,
    audit as never,
    events as never,
    prisma as never,
    config,
  );
  return { service, catalogue, audit, events, prisma };
}

const adminUser = (id: string, roles: string[]) => ({
  id,
  email: 'admin@cinnetemple.com',
  status: 'ACTIVE',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  profile: { displayName: 'Admin' },
  roles: roles.map((name) => ({ role: { id: `role-${name}`, name } })),
  _count: { purchases: 0 },
});

describe('AdminService', () => {
  describe('setUserRoles — self-demotion guard', () => {
    it('rejects an admin removing their own admin role', async () => {
      const { service, prisma, audit } = build({ user: adminUser(ADMIN_ID, ['user', 'admin']) });

      await expect(service.setUserRoles(ADMIN_ID, ['user'], ADMIN_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('allows an admin to keep their own admin role while editing roles', async () => {
      const { service, prisma, audit } = build({ user: adminUser(ADMIN_ID, ['user', 'admin']) });

      const result = await service.setUserRoles(ADMIN_ID, ['user', 'admin'], ADMIN_ID);

      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: ADMIN_ID } });
      expect(prisma.userRole.createMany).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.user.roles', entityId: ADMIN_ID }),
      );
      expect(result.roles).toEqual(['user', 'admin']);
    });

    it('allows demoting a different admin', async () => {
      const otherId = '33333333-3333-3333-3333-333333333333';
      const { service, prisma } = build({ user: adminUser(otherId, ['user', 'admin']) });

      await service.setUserRoles(otherId, ['user'], ADMIN_ID);
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: otherId } });
    });

    it('404s when the user does not exist', async () => {
      const { service } = build({ user: null });
      await expect(service.setUserRoles(ADMIN_ID, ['user'], ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update — premiere validation', () => {
    it('400s when isPremiere is set true with no showtime anywhere', async () => {
      const { service, catalogue } = build();
      await expect(
        service.update(baseTitle.id, dto({ isPremiere: true }), ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(catalogue.updateTitle).not.toHaveBeenCalled();
    });

    it('accepts isPremiere true when the payload carries a showtime, and publishes the event', async () => {
      const { service, catalogue, events } = build();
      const showtime = '2026-08-01T18:00:00.000Z';

      await service.update(
        baseTitle.id,
        dto({ isPremiere: true, premiereStartAt: showtime }),
        ADMIN_ID,
      );

      expect(catalogue.updateTitle).toHaveBeenCalledWith(
        baseTitle.id,
        expect.objectContaining({ isPremiere: true, premiereStartAt: showtime }),
      );
      expect(events.publish).toHaveBeenCalledWith({
        name: 'movie.premiere.scheduled',
        detail: { titleId: baseTitle.id, premiereStartAt: showtime },
      });
    });

    it('accepts isPremiere true when the existing record already has a showtime', async () => {
      const showtime = '2026-08-01T18:00:00.000Z';
      const { service, events } = build({
        existing: { ...baseTitle, premiereStartAt: showtime },
      });

      await service.update(baseTitle.id, dto({ isPremiere: true }), ADMIN_ID);
      expect(events.publish).toHaveBeenCalledWith({
        name: 'movie.premiere.scheduled',
        detail: { titleId: baseTitle.id, premiereStartAt: showtime },
      });
    });

    it('does not re-publish when the title is already a premiere', async () => {
      const showtime = '2026-08-01T18:00:00.000Z';
      const { service, events } = build({
        existing: { ...baseTitle, isPremiere: true, premiereStartAt: showtime },
      });

      await service.update(baseTitle.id, dto({ isPremiere: true }), ADMIN_ID);
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('clears premiereStartAt when isPremiere is set false', async () => {
      const { service, catalogue, events } = build({
        existing: { ...baseTitle, isPremiere: true, premiereStartAt: '2026-08-01T18:00:00.000Z' },
      });

      await service.update(baseTitle.id, dto({ isPremiere: false }), ADMIN_ID);

      expect(catalogue.updateTitle).toHaveBeenCalledWith(
        baseTitle.id,
        expect.objectContaining({ isPremiere: false, premiereStartAt: null }),
      );
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('400s when clearing the showtime of an active premiere', async () => {
      const { service } = build({
        existing: { ...baseTitle, isPremiere: true, premiereStartAt: '2026-08-01T18:00:00.000Z' },
      });
      await expect(
        service.update(baseTitle.id, dto({ premiereStartAt: null }), ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s when the title does not exist', async () => {
      const { service } = build({ existing: null });
      await expect(
        service.update(baseTitle.id, dto({ title: 'New' }), ADMIN_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update — null-clears convention', () => {
    it('maps explicit null to a stored null', async () => {
      const { service, catalogue } = build();

      await service.update(
        baseTitle.id,
        dto({
          tagline: null,
          director: null,
          maturityRating: null,
          videoKey: null,
          posterKey: null,
          heroKey: null,
        }),
        ADMIN_ID,
      );

      expect(catalogue.updateTitle).toHaveBeenCalledWith(baseTitle.id, {
        tagline: null,
        director: null,
        maturityRating: null,
        videoKey: null,
        posterKey: null,
        heroKey: null,
      });
    });

    it('treats undefined as unchanged (field omitted from the patch)', async () => {
      const { service, catalogue } = build();

      await service.update(baseTitle.id, dto({ title: 'Renamed' }), ADMIN_ID);

      const patch = catalogue.updateTitle.mock.calls.at(0)?.[1] ?? {};
      expect(patch).toEqual({ title: 'Renamed' });
      expect('tagline' in patch).toBe(false);
      expect('videoKey' in patch).toBe(false);
    });
  });

  describe('delete', () => {
    it('404s for a missing title', async () => {
      const { service, catalogue } = build({ existing: null });
      await expect(service.delete(baseTitle.id, ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(catalogue.deleteTitle).not.toHaveBeenCalled();
    });

    it('deletes and audits the sold-ticket count', async () => {
      const { service, catalogue, audit, prisma } = build();

      const result = await service.delete(baseTitle.id, ADMIN_ID);

      expect(prisma.purchase.count).toHaveBeenCalledWith({ where: { titleId: baseTitle.id } });
      expect(catalogue.deleteTitle).toHaveBeenCalledWith(baseTitle.id);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.movie.delete',
          entityId: baseTitle.id,
          metadata: { title: baseTitle.title, soldTickets: 3 },
        }),
      );
      expect(result).toEqual({ deleted: true, id: baseTitle.id, soldTickets: 3 });
    });
  });
});
