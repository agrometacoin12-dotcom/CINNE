import { PaystackPaymentDriver } from './paystack-payment.driver';
import { createHmac } from 'node:crypto';
describe('Paystack verification', () => {
  const original = global.fetch;
  afterEach(() => {global.fetch=original;});
  const respond=(data:any,status=true)=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({status,data})});};
  it('accepts only the requested live transaction and returns authoritative amount', async()=>{
    respond({status:'success',reference:'coin_1',domain:'live',amount:50000,currency:'NGN'});
    await expect(new PaystackPaymentDriver('sk_live_example').verify('coin_1')).resolves.toEqual({status:'paid',amountMinor:50000,currency:'NGN'});
  });
  it.each([{reference:'different',domain:'live'}, {reference:'coin_1',domain:'test'}])('rejects mismatched claims %j',async claims=>{
    respond({status:'success',amount:50000,currency:'NGN',...claims});
    await expect(new PaystackPaymentDriver('sk_live_example').verify('coin_1')).rejects.toThrow('mismatch');
  });
  it('does not label gateway downtime as a failed payment',async()=>{
    respond(undefined,false);
    await expect(new PaystackPaymentDriver('sk_live_example').verify('coin_1')).rejects.toThrow('temporarily unavailable');
  });
  it('rejects unsigned events and accepts an exact signed body',()=>{
    const key='sk_live_example', body='{"event":"charge.success"}';const d=new PaystackPaymentDriver(key);
    expect(d.verifyWebhookSignature(body,createHmac('sha512',key).update(body).digest('hex'))).toBe(true);
    expect(d.verifyWebhookSignature(body,'forged')).toBe(false);
    expect(new PaystackPaymentDriver('').verifyWebhookSignature(body,createHmac('sha512','').update(body).digest('hex'))).toBe(false);
  });
});
