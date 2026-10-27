import { ProducerService } from './producer.service';

describe('producer assignment notification outcomes', () => {
  function fixture() {
    const producer = { id: 'producer', email: 'owner@example.test', name: 'Owner', keyIssuedAt: new Date(), lastSeenAt: null };
    const link = { producer, revenueShareBps: 9000 };
    const tx = { producer: { upsert: jest.fn().mockResolvedValue(producer) }, producerTitle: { upsert: jest.fn().mockResolvedValue(link) } };
    const prisma = { $transaction: jest.fn(async fn => fn(tx)), producerTitle: { findUnique: jest.fn().mockResolvedValue(link) } };
    const mail = { sendPlain: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ProducerService(prisma as never, { findRaw: async () => ({ title: 'Film' }) } as never, mail as never, audit as never, { get: () => undefined } as never);
    return { service, tx, mail, audit };
  }

  it('confirms committed assignment even when sending the dashboard email fails', async () => {
    const { service, tx, mail, audit } = fixture();
    mail.sendPlain.mockRejectedValue(new Error('Mail credentials unavailable'));
    const result = await service.assign('admin', 'film', { email: 'owner@example.test', name: 'Owner', revenueShareBps: 9000 });
    expect(result).toMatchObject({ email: 'owner@example.test', revenueShareBps: 9000, dashboardEmailSent: false });
    expect(tx.producerTitle.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { titleId: 'film', producerId: 'producer', revenueShareBps: 9000 } }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: { producerId: 'producer', revenueShareBps: 9000, dashboardEmailSent: false } }));
  });

  it('reports successful email submission separately from saving the assignment', async () => {
    const { service } = fixture();
    expect(await service.assign('admin', 'film', { email: 'owner@example.test' })).toMatchObject({ dashboardEmailSent: true, revenueShareBps: 9000 });
  });

  it('does not send an email or report success when the database transaction fails', async () => {
    const { service, tx, mail, audit } = fixture();
    tx.producerTitle.upsert.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.assign('admin', 'film', { email: 'owner@example.test' })).rejects.toThrow('Database unavailable');
    expect(mail.sendPlain).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
