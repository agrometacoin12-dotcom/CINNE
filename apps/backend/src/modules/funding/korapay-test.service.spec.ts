import { KorapayTestService } from './korapay-test.service';
import { KorapayPaymentDriver } from '../commerce/drivers/korapay-payment.driver';
const ref = 'koratest_' + 'a'.repeat(32);
function fixture(key = 'sk_test_fixture') {
  const row = { reference: ref, userId: 'owner', coins: 500, amountMinor: 50000, status: 'PENDING' };
  const db: any = { korapayTestTopup: {
    findUnique: jest.fn(async()=>row),
    updateMany: jest.fn(async({data})=>{row.status=data.status;return {count:1};}),
    create: jest.fn(),
  }, coinWallet: {update: jest.fn()}, coinLedgerEntry: {create: jest.fn()} };
  const sandbox: any = { sandboxSummary: async()=>({balance:row.status==='PAID'?500:0,environment:'Sandbox'}) };
  const service = new KorapayTestService(db,{get:()=>key} as any,sandbox);
  return {db,row,service};
}
afterEach(()=>jest.restoreAllMocks());
it('verifies with Kora, credits the unique test row once, never writes live ledger',async()=>{
  const {service,db}=fixture();const verify=jest.spyOn(KorapayPaymentDriver.prototype,'verify').mockResolvedValue({status:'paid',amountMinor:50000,currency:'NGN'});
  expect((await service.verify('owner',ref)).balance).toBe(500);
  expect((await service.verify('owner',ref)).balance).toBe(500);
  expect(verify).toHaveBeenCalledTimes(1);expect(db.korapayTestTopup.updateMany).toHaveBeenCalledTimes(1);
  expect(db.coinWallet.update).not.toHaveBeenCalled();expect(db.coinLedgerEntry.create).not.toHaveBeenCalled();
});
it('rejects another user before calling provider',async()=>{const {service,db}=fixture();await expect(service.verify('other',ref)).rejects.toThrow('Test payment not found');expect(db.korapayTestTopup.updateMany).not.toHaveBeenCalled();});
it.each([{amountMinor:1,currency:'NGN'},{amountMinor:50000,currency:'USD'}])('rejects mismatch %j',async result=>{const {service,db}=fixture();jest.spyOn(KorapayPaymentDriver.prototype,'verify').mockResolvedValue({status:'paid',...result});await expect(service.verify('owner',ref)).rejects.toThrow('does not match');expect(db.korapayTestTopup.updateMany).not.toHaveBeenCalled();});
it('never initializes real payments through the test route',async()=>{const {service,db}=fixture('sk_live_fixture');await expect(service.start({sub:'owner',email:'qa@example.test'},500)).rejects.toThrow('unavailable');expect(db.korapayTestTopup.create).not.toHaveBeenCalled();});
it('rejects forged callbacks',async()=>{const {service,db}=fixture();await expect(service.webhook('{}','0'.repeat(64))).rejects.toThrow('Invalid test webhook');expect(db.korapayTestTopup.findUnique).not.toHaveBeenCalled();});
it('rejects live and malformed references',async()=>{const {service}=fixture();await expect(service.verify('owner','coin_'+ 'a'.repeat(32))).rejects.toThrow('not found');});
