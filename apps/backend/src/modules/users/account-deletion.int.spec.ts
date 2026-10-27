import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AccountDeletionService } from './account-deletion.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

const url = process.env.FUNDING_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Account deletion and access revocation', () => {
  let prisma: PrismaService;
  beforeAll(async () => { process.env.DATABASE_URL = url; prisma = new PrismaService(); await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('removes personal/authentication records, preserves financial audit, and rejects old access tokens', async () => {
    const email = `${randomUUID()}@fixture.test`;
    const u = await prisma.user.create({ data: { email, status: 'ACTIVE', passwordHash: 'fixture',
      profile: { create: { displayName: 'Delete fixture', bio: 'Personal data' } },
      sessions: { create: { refreshTokenHash: randomUUID(), expiresAt: new Date(Date.now() + 100000) } },
      credentials: { create: { provider: 'GOOGLE', providerId: randomUUID() } },
      coinWallet: { create: { balance: 500 } },
    } });
    const strategy = new JwtStrategy(new ConfigService({ jwt: { secret: 'local-test-only-secret' } }), prisma);
    expect((await strategy.validate({ sub: u.id, email, roles: [] })).sub).toBe(u.id);
    await new AccountDeletionService(prisma).delete(u.id);
    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(deleted.email).not.toBe(email);
    expect(deleted.passwordHash).toBeNull();
    expect(deleted.deletedAt).not.toBeNull();
    expect(await prisma.profile.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.credential.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.coinWallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(500);
    await expect(strategy.validate({ sub: u.id, email, roles: ['admin'] })).rejects.toThrow('no longer active');
  });
});
