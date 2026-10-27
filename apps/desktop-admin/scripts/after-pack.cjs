const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async context => {
  const mac = context.electronPlatformName === 'darwin';
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const resources = mac ? path.join(app, 'Contents/Resources') : path.join(context.appOutDir, 'resources');
  const processor = path.join(resources, 'media-tools', mac ? 'ffmpeg' : 'ffmpeg.exe');
  if (!fs.existsSync(processor) || fs.statSync(processor).size < 1000000) {
    throw new Error('Missing bundled video processor. Run prepare-media-tools.mjs for the target platform first.');
  }
  // Explicit opt-in for local testing. Public Mac releases use Developer ID signing.
  if (!mac || process.env.STUDIO_ADHOC_SIGN !== '1') return;
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', processor], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
