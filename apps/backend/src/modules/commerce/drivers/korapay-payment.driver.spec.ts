import { createHmac } from 'node:crypto';
import { KorapayPaymentDriver, koraMinor } from './korapay-payment.driver';
describe('Korapay checkout',()=>{
 const original=global.fetch;
 const driver=new KorapayPaymentDriver('sk_live_example','https://api.cinnetemple.com/v1/payments/webhook');
 const respond=(data:unknown)=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({status:true,data})});};
 afterEach(()=>{global.fetch=original;});
 it('initializes NGN amounts in naira, not kobo',async()=>{
  respond({reference:'coin_1',checkout_url:'https://checkout.korapay.com/coin_1/pay'});
  await driver.initialize({reference:'coin_1',amountMinor:50000,currency:'NGN',email:'test@example.com',callbackUrl:'https://www.cinnetemple.com/wallet/callback'});
  const body=JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body).toMatchObject({amount:500,reference:'coin_1',merchant_bears_cost:true});
 });
 it('allows the test checkout host only with a test credential',async()=>{
  respond({reference:'coin_1',checkout_url:'https://test-checkout.korapay.com/coin_1/pay'});
  const input={reference:'coin_1',amountMinor:50000,currency:'NGN',email:'test@example.com',callbackUrl:'https://www.cinnetemple.com/test/wallet/callback'};
  await expect(driver.initialize(input)).rejects.toThrow('Invalid Korapay checkout URL');
  await expect(new KorapayPaymentDriver('sk_test_example','https://example.com/webhook').initialize(input)).resolves.toMatchObject({reference:'coin_1'});
 });
 it('uses accepted amount for successful bank transfers',async()=>{
  respond({reference:'coin_1',status:'success',amount:500,amount_paid:400,amount_accepted:400,currency:'NGN'});
  await expect(driver.verify('coin_1')).resolves.toEqual({status:'paid',amountMinor:40000,currency:'NGN'});
 });
 it('rejects a different transaction reference',async()=>{
  respond({reference:'other',status:'success',amount:500,currency:'NGN'});
  await expect(driver.verify('coin_1')).rejects.toThrow('reference mismatch');
 });
 it('verifies the data-only HMAC and rejects changed data',()=>{
  const data={reference:'coin_1',amount:500,status:'success'};
  const signature=createHmac('sha256','sk_live_example').update(JSON.stringify(data)).digest('hex');
  expect(driver.verifyWebhookSignature(JSON.stringify({event:'charge.success',data}),signature)).toBe(true);
  expect(driver.verifyWebhookSignature(JSON.stringify({data:{...data,amount:5000}}),signature)).toBe(false);
  expect(driver.verifyWebhookSignature('{}',signature)).toBe(false);
 });
 it.each(['1.001','-1','NaN','Infinity','',undefined])('rejects invalid amounts %s',value=>expect(()=>koraMinor(value)).toThrow());
 it('converts decimal amounts exactly',()=>expect(koraMinor('100.29')).toBe(10029));
});
