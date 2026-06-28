/**
 * Bulk-indexes the seed catalogue into OpenSearch (index: "catalogue").
 * Each document is the full title object so search hits return ready-to-map data.
 *
 * Usage:
 *   OPENSEARCH_ENDPOINT=https://search-...es.amazonaws.com AWS_REGION=us-east-1 \
 *     ts-node scripts/index-catalogue.ts
 */
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SAMPLE_CATALOGUE } from '../src/modules/catalogue/data/sample-catalogue';

const INDEX = 'catalogue';
const region = process.env.AWS_REGION ?? 'us-east-1';
const node = process.env.OPENSEARCH_ENDPOINT;

if (!node) {
  console.error('OPENSEARCH_ENDPOINT is required');
  process.exit(1);
}

const client = new Client({
  ...AwsSigv4Signer({ region, service: 'es', getCredentials: () => defaultProvider()() }),
  node,
});

async function main() {
  const exists = await client.indices.exists({ index: INDEX });
  if (!exists.body) {
    await client.indices.create({
      index: INDEX,
      body: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            title: { type: 'text' },
            overview: { type: 'text' },
            cast: { type: 'text' },
            genres: { type: 'text' },
            director: { type: 'text' },
            year: { type: 'integer' },
            rating: { type: 'float' },
            popularity: { type: 'integer' },
          },
        },
      },
    });
  }

  const body = SAMPLE_CATALOGUE.flatMap((title) => [
    { index: { _index: INDEX, _id: title.id } },
    title,
  ]);
  const res = await client.bulk({ refresh: true, body });
  if (res.body.errors) {
    console.error('Bulk index reported errors');
    process.exit(1);
  }
  console.log(`Indexed ${SAMPLE_CATALOGUE.length} titles into "${INDEX}".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
