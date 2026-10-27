import { EmailAlertsService } from './email-alerts.service';

const row = {id:'11111111-1111-1111-1111-111111111111',event_key:'event',recipient:'viewer@example.test',subject:'Receipt',body:'Confirmed',attempts:1,first_attempt_at:new Date(),lease_token:'lease'};
function setup(overrides={}) {
 const prisma:any={$queryRaw:jest.fn().mockResolvedValueOnce([{...row,...overrides}]).mockResolvedValue([]),$executeRaw:jest.fn().mockResolvedValue(1)};
 prisma.$transaction=async (fn:any)=>fn(prisma);
 const mail={sendPlain:jest.fn().mockResolvedValue(undefined)};
 const config={get:jest.fn().mockReturnValue(['admin@example.test','admin@example.test'])};
 return {prisma,mail,service:new EmailAlertsService(prisma,mail as never,config as never)};
}
beforeEach(()=>jest.useFakeTimers());
afterEach(()=>jest.useRealTimers());
async function run(service:EmailAlertsService) { const p=service.drain(); await jest.runAllTimersAsync(); await p; }
it('uses a stable provider key and records acceptance only after send',async()=>{
 const f=setup(); await run(f.service);
 expect(f.mail.sendPlain).toHaveBeenCalledWith(row.recipient,row.subject,row.body,`alert-${row.id}`);
 expect(f.prisma.$executeRaw.mock.calls[0][0].join('')).toContain("status='ACCEPTED'");
 expect(f.prisma.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE SKIP LOCKED');
});
it('retains failures for retry without calling them accepted',async()=>{
 const f=setup();f.mail.sendPlain.mockRejectedValue(new Error('provider unavailable')); await run(f.service);
 expect(f.prisma.$executeRaw.mock.calls[0]).toContain('PENDING');
 expect(f.prisma.$executeRaw.mock.calls[0]).toContain('DELIVERY_FAILED');
});
it('quarantines expired retry windows rather than risking duplicate delivery',async()=>{
 const f=setup({first_attempt_at:new Date(Date.now()-21*3600_000)});await run(f.service);
 expect(f.mail.sendPlain).not.toHaveBeenCalled();expect(f.prisma.$executeRaw.mock.calls[0]).toContain('FAILED');
});
it('fans out admin alerts once per configured recipient',async()=>{
 const f=setup({recipient:'@admins'});await run(f.service);
 expect(f.mail.sendPlain).not.toHaveBeenCalled();expect(f.prisma.$executeRaw).toHaveBeenCalledTimes(2);
 expect(f.prisma.$executeRaw.mock.calls[0]).toContain('admin@example.test');
});
it('does not lose an admin alert when recipients are unconfigured',async()=>{
 const f=setup({recipient:'@admins'});(f.service as any).config.get.mockReturnValue([]);await run(f.service);
 expect(f.prisma.$executeRaw.mock.calls[0]).toContain('ADMIN_RECIPIENTS_MISSING');
});
it('does not overlap drains in the same process',async()=>{
 const f=setup();let release!:()=>void;f.mail.sendPlain.mockImplementation(()=>new Promise<void>(r=>release=r));
 const first=f.service.drain();await Promise.resolve();await f.service.drain();expect(f.prisma.$queryRaw).toHaveBeenCalledTimes(1);
 release();await jest.runAllTimersAsync();await first;
});
