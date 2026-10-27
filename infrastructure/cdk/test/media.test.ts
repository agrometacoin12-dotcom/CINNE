import { generateKeyPairSync } from 'node:crypto';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MediaStack } from '../lib/media-stack';

const env = { account: '123456789012', region: 'us-east-1' };

function behaviors(stack: MediaStack) {
  const resources = Template.fromStack(stack).findResources('AWS::CloudFront::Distribution');
  return Object.values(resources)[0]!.Properties.DistributionConfig.CacheBehaviors as Array<
    Record<string, unknown>
  >;
}

describe('Media CDN authorization', () => {
  it('fails closed for HLS and old video copies when no signing key exists', () => {
    const stack = new MediaStack(new cdk.App(), 'MediaClosed', { env, stage: 'dev' });
    const protectedPaths = behaviors(stack);
    expect(protectedPaths.map((b) => b.PathPattern)).toEqual([
      'hls/*',
      'originals/video/*',
      'originals/trailer/*',
    ]);
    for (const behavior of protectedPaths) {
      expect(behavior.FunctionAssociations).toBeDefined();
      expect(behavior.ViewerProtocolPolicy).toBe('https-only');
    }
    Template.fromStack(stack).hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode:
        'function handler(event) { return { statusCode: 403, statusDescription: "Forbidden" }; }',
    });
  });

  it('requires a trusted key group on every video behavior when configured', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const app = new cdk.App({
      context: {
        mediaSigningPublicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    });
    const stack = new MediaStack(app, 'MediaSigned', { env, stage: 'dev' });
    for (const behavior of behaviors(stack)) {
      expect(behavior.TrustedKeyGroups).toHaveLength(1);
      expect(behavior.FunctionAssociations).toBeUndefined();
    }
  });
});
