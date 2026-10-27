/** Offline characterization probes. Success CONFIRMS flaws, not security.
 * Run: pnpm --filter @cinnetemple/backend exec ts-node --transpile-only scripts/security-audit-probes.ts
 * No network, real database, real credentials or real purchases.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PaystackPaymentDriver } from '../src/modules/commerce/drivers/paystack-payment.driver';
import { AdminGuard } from '../src/common/guards/admin.guard';
import { MediaService } from '../src/modules/media/media.service';
import { JwtService } from '@nestjs/jwt';
import { TokensService } from '../src/modules/auth/tokens.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { GoogleOAuthService } from '../src/modules/auth/google-oauth.service';
import { CommerceService } from '../src/modules/commerce/commerce.service';
import { validateEnv } from '../src/config/env.validation';
import { MockPaymentDriver } from '../src/modules/commerce/drivers/mock-payment.driver';

const config = { get: (key: string, fallback?: unknown) => ({
  authDriver: 'local', emailVerificationRequired: false,
  'jwt.issuer': 'audit', 'jwt.audience': 'audit',
}[key] ?? fallback) } as any;
const audit = { record: async () => undefined } as any;
const events = { publish: async () => undefined } as any;
const user = { id: 'fixture-user', email: 'fixture@example.invalid', status: 'ACTIVE',
  emailVerified: true, passwordHash: 'attacker-password-retained', roles: [] };
async function main() {
  // Both refresh calls read the same unrevoked row before either updates it.
  const rows: any[] = [];
  const original = { id: 'old', userId: user.id, user, expiresAt: new Date(Date.now()+60000) };
  const prisma = { session: {
    findFirst: async () => ({ ...original }),
    update: async () => ({}),
    create: async ({data}: any) => rows.push(data),
  } } as any;
  const tokens = new TokensService(new JwtService({secret:'offline-security-audit-fixture-only'}),config,prisma);
  const pairs = await Promise.all([tokens.rotate('same-refresh',{}),tokens.rotate('same-refresh',{})]);
  assert.equal(rows.length,2); assert.notEqual(pairs[0].refreshToken,pairs[1].refreshToken);
  console.log('CONFIRMED: concurrent refresh replays issue two valid successor sessions');

  let resetHash = ''; let revocations = 0;
  const users = {findByEmail: async () => user, updatePassword: async (_id: string, hash: string) => {resetHash=hash;} } as any;
  const reset = new AuthService(users,{} as any,{revoke:async()=>revocations++,revokeAll:async()=>revocations++} as any,
    {verify:async()=>true} as any,{} as any,audit,{} as any,events,config);
  await reset.resetPassword({email:user.email,code:'123456',newPassword:'Fixture!Password123'});
  assert.ok(resetHash.startsWith('$argon2')); assert.equal(revocations,0);
  console.log('CONFIRMED: password reset updates hash without revoking sessions');

  // Simulate a password account preclaimed before the real email owner uses Google.
  let linked=false;
  const oauthUsers = {findByProvider:async()=>null,findByEmail:async()=>user,
    linkCredential:async()=>{linked=true;},markEmailVerified:async()=>{}} as any;
  // Constructor order follows the real service; resolveUser has no external calls.
  const google = new GoogleOAuthService(config,oauthUsers,{} as any,audit,events);
  const result = await (google as any).resolveUser({sub:'real-google-owner',email:user.email,email_verified:true});
  assert.ok(linked); assert.equal(result.user.passwordHash,'attacker-password-retained');
  const admin = new AdminGuard({get:()=>[user.email]} as any,
    {credential:{findFirst:async()=>linked ? {id:'linked-google'} : null}} as any);
  assert.equal(await admin.canActivate({switchToHttp:()=>({getRequest:()=>({user:{sub:user.id,email:user.email,roles:[]}})})} as any),true);
  console.log('CONFIRMED: Google linking retains preclaimed password and enables bootstrap admin access');

  let granted=false;
  const commerce = new CommerceService({purchase:{findUnique:async()=>null,create:async({data}:any)=>({id:'p',...data})}} as any,
    {findRaw:async()=>({id:'expensive-title',title:'Fixture',status:'published',priceMinor:999900,currency:'NGN'})} as any,
    {} as any,{grant:async()=>{granted=true;}} as any,audit,events,
    {verifyTransaction:async()=>({transactionId:'signed-fixture',productId:'com.cinnetemple.ticket.tier1'})} as any,
    {} as any,config,{} as any);
  await commerce.confirmApple({sub:user.id,email:user.email},{titleId:'expensive-title',transactionId:'signed-fixture',signedTransaction:'verified-by-fixture'});
  assert.ok(granted);
  console.log('CONFIRMED: lowest-tier verified Apple product grants an arbitrary expensive title');

  const media=new MediaService(config);
  const signed=new URL(media.playbackUrl('originals/video/fixture.mp4',user.id)!);
  const q=signed.searchParams;
  // Verification receives only URL fields, no independently authenticated viewer.
  assert.ok(media.verifyStreamRequest(q.get('key')!,Number(q.get('expires')),q.get('sig')!,q.get('u')!));
  console.log('CONFIRMED: complete signed media URL authorizes access without viewer authentication');

  const env=validateEnv({NODE_ENV:'production',DATABASE_URL:'postgresql://fixture:fixture@localhost/fixture',JWT_SECRET:'fixture-production-secret-not-real'});
  assert.equal(env.PAYMENT_DRIVER,'mock');
  const mock=new MockPaymentDriver('https://example.invalid');
  assert.equal((await mock.verify('fixture')).status,'paid'); assert.equal(mock.verifyWebhookSignature(),true);
  console.log('CONFIRMED: production configuration accepts default mock payments');
  const body=JSON.stringify({event:'charge.success',data:{reference:'fixture'}});
  assert.equal(new PaystackPaymentDriver('').verifyWebhookSignature(body,createHmac('sha512','').update(body).digest('hex')),true);
  console.log('CONFIRMED: unconfigured Paystack webhook accepts a signature made with the empty key');
}
main().catch(err=>{console.error(err);process.exitCode=1;});
