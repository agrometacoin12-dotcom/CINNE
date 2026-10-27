// Local-only test entrypoint. Never use for a deployed backend.
const db = new URL(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== 'test' || db.hostname !== '127.0.0.1' ||
    db.port !== '55439' || db.pathname !== '/ct_loadtest' || process.env.PORT !== '4401' ||
    process.env.REDIS_URL !== 'redis://127.0.0.1:56389') {
  throw new Error('Refusing to run outside the disposable local load-test stack');
}
if (process.env.LOAD_TEST_DISABLE_THROTTLE === 'true') {
  const { ThrottlerGuard } = require('@nestjs/throttler');
  ThrottlerGuard.prototype.canActivate = async () => true;
  console.log('LOAD TEST ONLY: per-IP throttling disabled for capacity measurement');
}
require('../../dist/main.js');
