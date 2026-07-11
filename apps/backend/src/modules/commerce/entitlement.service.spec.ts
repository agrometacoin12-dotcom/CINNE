import { EntitlementService } from './entitlement.service';

const USER = '11111111-1111-1111-1111-111111111111';
const TITLE = '22222222-2222-2222-2222-222222222222';

function makeService() {
  const ent = {
    id: 'ent-1',
    userId: USER,
    titleId: TITLE,
    status: 'ACTIVE',
    startedAt: null,
    expiresAt: null,
    createdAt: new Date(),
  };
  const update = jest.fn(async ({ data }: { data: { startedAt: Date; expiresAt: Date } }) => ({
    ...ent,
    ...data,
  }));
  const prisma = {
    entitlement: {
      findMany: jest.fn(async () => [ent]),
      update,
    },
  } as never;
  return { service: new EntitlementService(prisma), update };
}

function windowSeconds(update: jest.Mock): number {
  const { startedAt, expiresAt } = update.mock.calls[0][0].data as {
    startedAt: Date;
    expiresAt: Date;
  };
  return (expiresAt.getTime() - startedAt.getTime()) / 1000;
}

describe('EntitlementService viewing window', () => {
  it('uses runtime + 30-min grace when the duration is known', async () => {
    const { service, update } = makeService();
    await service.startViewing(USER, TITLE, 90 * 60); // 90-minute film
    expect(windowSeconds(update)).toBe(90 * 60 + 30 * 60);
  });

  it('floors the window to 3 hours when the duration is 0 (no runtime on the title)', async () => {
    const { service, update } = makeService();
    await service.startViewing(USER, TITLE, 0);
    expect(windowSeconds(update)).toBe(3 * 60 * 60);
  });

  it('floors the window to 3 hours when the duration is missing', async () => {
    const { service, update } = makeService();
    await service.startViewing(USER, TITLE, null as unknown as number);
    expect(windowSeconds(update)).toBe(3 * 60 * 60);
  });

  it('does not shrink windows longer than the floor', async () => {
    const { service, update } = makeService();
    await service.startViewing(USER, TITLE, 4 * 60 * 60); // 4-hour epic
    expect(windowSeconds(update)).toBe(4 * 60 * 60 + 30 * 60);
  });
});

describe('EntitlementService watch-once consumption', () => {
  function makeConsumeService(activeCount = 1) {
    const updateMany = jest.fn(async () => ({ count: activeCount }));
    const findMany = jest.fn(async () => []); // nothing ACTIVE after consumption
    const prisma = { entitlement: { updateMany, findMany } } as never;
    return { service: new EntitlementService(prisma), updateMany, findMany };
  }

  it("marks the user's ACTIVE entitlement CONSUMED for the title", async () => {
    const { service, updateMany } = makeConsumeService();
    await service.consume(USER, TITLE);
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER, titleId: TITLE, status: 'ACTIVE' },
      data: { status: 'CONSUMED' },
    });
  });

  it('is idempotent — a no-op when nothing is ACTIVE', async () => {
    const { service, updateMany } = makeConsumeService(0);
    await expect(service.consume(USER, TITLE)).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('leaves the title unusable after consumption (findUsable returns null)', async () => {
    const { service } = makeConsumeService();
    await service.consume(USER, TITLE);
    // findMany is stubbed to return no ACTIVE rows, mirroring a consumed title.
    expect(await service.findUsable(USER, TITLE)).toBeNull();
  });

  it('throws the purchase-to-watch 403 from startViewing once consumed', async () => {
    const { service } = makeConsumeService();
    await expect(service.startViewing(USER, TITLE, 90 * 60)).rejects.toThrow(
      'No active access to this title. Purchase to watch.',
    );
  });
});
