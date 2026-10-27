import { ProducerService } from './producer.service';
import { ProducerAccountController, AdminProducerController } from './producer.controller';
import { AdminGuard } from '../../common/guards/admin.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

function setup() {
  const row = {id: 'producer-a', name: 'Studio A', email: 'owner@example.test'};
  const prisma = {
    user: {findUnique: jest.fn().mockResolvedValue({email: 'Owner@example.test', emailVerified: true, status: 'ACTIVE', credentials: [{provider: 'GOOGLE'}]})},
    producer: {upsert: jest.fn().mockResolvedValue(row), findUnique: jest.fn().mockResolvedValue(row)},
  };
  const catalogue = {findRaw: jest.fn().mockResolvedValue({id:'film-a', title:'Film'})};
  const service = new ProducerService(prisma as never, catalogue as never, {} as never, {} as never, {get: () => undefined} as never);
  return {service, prisma, row};
}

describe('producer account ownership', () => {
  it('registers the verified account email and preserves existing links and money', async () => {
    const {service, prisma, row} = setup();
    expect(await service.registerAccount('user-a', ' Studio A ')).toEqual(row);
    const call = prisma.producer.upsert.mock.calls[0][0];
    expect(call.where).toEqual({email: 'owner@example.test'});
    expect(call.update).toEqual({name:'Studio A', lastSeenAt:expect.any(Date)});
    expect(call.create.keyHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    {emailVerified:true, status:'ACTIVE', credentials:[]},
    {emailVerified:false, status:'ACTIVE', credentials:[{}]},
    {emailVerified:true, status:'SUSPENDED', credentials:[{}]},
  ])('rejects an unproven or suspended identity: %j', async identity => {
    const {service, prisma} = setup();
    prisma.user.findUnique.mockResolvedValue({...identity, email:'owner@example.test'});
    await expect(service.registerAccount('imposter', 'Studio')).rejects.toThrow('Sign in with Google');
    expect(prisma.producer.upsert).not.toHaveBeenCalled();
  });
  it('rejects a whitespace-only producer name', async () => {
    await expect(setup().service.registerAccount('user-a', '   ')).rejects.toThrow('producer name');
  });
  it('resolves ownership from the database identity, not submitted email or movie IDs', async () => {
    const {service, prisma, row} = setup();
    expect(await service.accountProducer('user-a')).toEqual(row);
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({id:'user-a'});
    expect(prisma.producer.findUnique).toHaveBeenCalledWith({where:{email:'owner@example.test'}});
  });
  it('requires registration when no producer profile exists', async () => {
    const {service, prisma} = setup(); prisma.producer.findUnique.mockResolvedValue(null);
    await expect(service.accountProducer('user-a')).rejects.toThrow('Register');
  });
  it('rejects a selected producer ID paired with another email', async () => {
    const {service} = setup();
    await expect(service.assign('admin', 'film-a', {producerId:'producer-a', email:'other@example.test'})).rejects.toThrow('no longer matches');
  });
  it('only exposes identity fields to the admin lookup', async () => {
    const {service, prisma} = setup(); await service.lookup(' OWNER@EXAMPLE.TEST ');
    expect(prisma.producer.findUnique).toHaveBeenCalledWith({where:{email:'owner@example.test'}, select:{id:true, name:true, email:true}});
  });
  it('keeps directory lookup behind the admin guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminProducerController)).toContain(AdminGuard);
  });
  it('passes only the authenticated user ID into registration', async () => {
    const producers = {registerAccount:jest.fn()};
    const controller = new ProducerAccountController(producers as never);
    controller.register({sub:'verified-user', email:'ignored@example.test', roles:[]}, {name:'Studio'});
    expect(producers.registerAccount).toHaveBeenCalledWith('verified-user', 'Studio');
  });
});
