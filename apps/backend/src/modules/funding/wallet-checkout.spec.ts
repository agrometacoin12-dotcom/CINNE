import { createHmac } from 'node:crypto';
import { WalletService } from './wallet.service';
import { PaystackPaymentDriver } from '../commerce/drivers/paystack-payment.driver';
import { KorapayPaymentDriver } from '../commerce/drivers/korapay-payment.driver';
function fixture(keys: Record<string,string> = {'paystack.secretKey':'sk_live_pay','korapay.secretKey':'sk_live_kora'}) {
 const row = {id:'topup',reference:'coin_example',userId:'owner',provider:'PAYSTACK',status:'PENDING',coins:500,amountMinor:50000,currency:'NGN'};
 const tx:any={coinTopup:{updateMany:jest.fn(async()=>{if(row.status==='PAID')return {count:0};row.status='PAID';return {count:1}})}};
 const db:any={coinTopup:{findUnique:jest.fn(async()=>row),create:jest.fn(),updateMany:jest.fn()},coinWallet:{findUnique:jest.fn(async()=>({balance:500,refundDebt:0}))},$transaction:jest.fn(fn=>fn(tx))};
 const svc=new WalletService(db,{} as any,{record:jest.fn()} as any,{publish:jest.fn()} as any,{provider:'KORAPAY'} as any,{get:(k:string)=>keys[k]} as any);
 const apply=jest.spyOn(svc,'apply').mockResolvedValue(500);
 return {svc,db,row,apply};
}
afterEach(()=>jest.restoreAllMocks());
it('offers only live-configured providers',()=>{const {svc}=fixture({'paystack.secretKey':'sk_live_pay','korapay.secretKey':'sk_test_kora'});expect(svc.checkoutOptions()).toMatchObject({enabled:true,provider:'PAYSTACK',providers:[{provider:'PAYSTACK',enabled:true},{provider:'KORAPAY',enabled:false}]});});
it.each(['PAYSTACK','KORAPAY'])('initializes selected provider %s and persists it',async(provider)=>{const {svc,db}=fixture();const driver=provider==='PAYSTACK'?PaystackPaymentDriver:KorapayPaymentDriver;const init=jest.spyOn(driver.prototype,'initialize').mockImplementation(async(input)=>({reference:input.reference,authorizationUrl:'https://checkout.example/'}));await svc.startTopup({sub:'owner',email:'qa@example.test'},500,provider);expect(db.coinTopup.create).toHaveBeenCalledWith({data:expect.objectContaining({provider,coins:500,amountMinor:50000})});expect(init).toHaveBeenCalled();});
it('rejects test credentials before creating a live top-up',async()=>{const {svc,db}=fixture({'paystack.secretKey':'sk_test_pay'});await expect(svc.startTopup({sub:'owner',email:'qa@example.test'},500,'PAYSTACK')).rejects.toThrow('not available');expect(db.coinTopup.create).not.toHaveBeenCalled();});
it('verifies the recorded provider even when default driver is Korapay and credits once',async()=>{const {svc,apply}=fixture();const pay=jest.spyOn(PaystackPaymentDriver.prototype,'verify').mockResolvedValue({status:'paid',amountMinor:50000,currency:'NGN'});const kora=jest.spyOn(KorapayPaymentDriver.prototype,'verify');await svc.verifyTopup('owner','coin_example');await svc.verifyTopup('owner','coin_example');expect(pay).toHaveBeenCalledTimes(1);expect(kora).not.toHaveBeenCalled();expect(apply).toHaveBeenCalledTimes(1);});
it('rejects another account before provider verification',async()=>{const {svc}=fixture();const verify=jest.spyOn(PaystackPaymentDriver.prototype,'verify');await expect(svc.verifyTopup('other','coin_example')).rejects.toThrow('not found');expect(verify).not.toHaveBeenCalled();});
it.each([{amountMinor:1,currency:'NGN'},{amountMinor:50000,currency:'USD'}])('rejects settlement mismatch %j',async(result)=>{const {svc,apply}=fixture();jest.spyOn(PaystackPaymentDriver.prototype,'verify').mockResolvedValue({status:'paid',...result});await expect(svc.verifyTopup('owner','coin_example')).rejects.toThrow('mismatch');expect(apply).not.toHaveBeenCalled();});
it('rejects unsigned callbacks',async()=>{const {svc,db}=fixture();await expect(svc.webhook('PAYSTACK','{}','invalid')).rejects.toThrow('signature');expect(db.coinTopup.findUnique).not.toHaveBeenCalled();});
it('a valid Paystack signature cannot settle a Korapay payment',async()=>{const {svc,row,apply}=fixture();row.provider='KORAPAY';const raw=JSON.stringify({event:'charge.success',data:{reference:row.reference}});await svc.webhook('PAYSTACK',raw,createHmac('sha512','sk_live_pay').update(raw).digest('hex'));expect(apply).not.toHaveBeenCalled();});
it('signed webhook verifies with Paystack before crediting',async()=>{const {svc,row,apply}=fixture();const verify=jest.spyOn(PaystackPaymentDriver.prototype,'verify').mockResolvedValue({status:'pending'});const raw=JSON.stringify({event:'charge.success',data:{reference:row.reference,amount:50000,currency:'NGN'}});await svc.webhook('PAYSTACK',raw,createHmac('sha512','sk_live_pay').update(raw).digest('hex'));expect(verify).toHaveBeenCalledWith(row.reference);expect(apply).not.toHaveBeenCalled();});
it('history includes coin top-ups with status and keeps test purchases labelled and scoped to the owner',async()=>{
 const {svc,db}=fixture();const at=new Date('2026-10-26T12:00:00Z');
 db.coinTopup.findMany=jest.fn(async()=>[{id:'live',coins:500,status:'PAID',provider:'PAYSTACK',createdAt:at}]);
 db.appleSandboxCoinPurchase={findMany:jest.fn(async()=>[{transactionId:'apple',coins:1000,confirmed:true,refunded:true,updatedAt:at}])};
 db.korapayTestTopup={findMany:jest.fn(async()=>[{reference:'test',coins:500,status:'PENDING',createdAt:at}])};
 const rows=await svc.purchaseHistory('owner');expect(rows).toEqual(expect.arrayContaining([
 expect.objectContaining({id:'live',source:'Browser payment',environment:'Production',status:'PAID'}),
 expect.objectContaining({id:'apple-test:apple',source:'App Store',environment:'Sandbox',status:'REFUNDED'}),
 expect.objectContaining({id:'test',environment:'Sandbox',status:'PENDING'})]));
 for(const table of [db.coinTopup,db.appleSandboxCoinPurchase,db.korapayTestTopup])expect(table.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'owner'}}));
});
