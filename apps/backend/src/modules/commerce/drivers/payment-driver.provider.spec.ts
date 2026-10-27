import { ConfigService } from '@nestjs/config';
import { paymentDriverProvider } from './payment-driver.provider';
import { PaystackPaymentDriver } from './paystack-payment.driver';
const factory = (paymentDriverProvider as any).useFactory;
describe('Production website payments', () => {
  it.each([{paymentDriver:'mock'}, {paymentDriver:'paystack',paystack:{secretKey:'sk_test_example'}}, {paymentDriver:'paystack'}])('fails closed for %j', async settings => {
    const driver = factory(new ConfigService({env:'production',...settings}));
    await expect(driver.initialize({})).rejects.toThrow('not available');
    await expect(driver.verify('coin_any')).rejects.toThrow('not available');
    expect(driver.verifyWebhookSignature('{}','anything')).toBe(false);
  });
  it('permits a configured live gateway', () => {
    expect(factory(new ConfigService({env:'production',paymentDriver:'paystack',paystack:{secretKey:'sk_live_example'}}))).toBeInstanceOf(PaystackPaymentDriver);
  });
});
