/**
 * Loads the seed catalogue into DynamoDB (single-table design).
 *
 *   Title item:      PK = TITLE#<id>   SK = META         { title, searchText }
 *   Category member: PK = CAT#<slug>   SK = POP#<padded> { title }
 *   Featured:        PK = FEATURED     SK = POP#<padded> { title }
 *
 * Usage:
 *   CATALOGUE_TABLE=cinnetemple-prod-catalogue AWS_REGION=us-east-1 \
 *     ts-node scripts/seed-catalogue.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SAMPLE_CATALOGUE } from '../src/modules/catalogue/data/sample-catalogue';

const region = process.env.AWS_REGION ?? 'us-east-1';
const table = process.env.CATALOGUE_TABLE ?? 'cinnetemple-catalogue';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

const pad = (n: number) => String(100000 - Math.round(n)).padStart(6, '0'); // higher popularity → lower SK

async function main() {
  const items: Record<string, unknown>[] = [];

  for (const title of SAMPLE_CATALOGUE) {
    const searchText = [title.title, title.overview, ...title.cast, ...title.genres]
      .join(' ')
      .toLowerCase();

    items.push({ PK: `TITLE#${title.id}`, SK: 'META', title, searchText });

    for (const category of title.categories) {
      items.push({ PK: `CAT#${category}`, SK: `POP#${pad(title.popularity)}#${title.id}`, title });
    }
    if (title.featured) {
      items.push({ PK: 'FEATURED', SK: `POP#${pad(title.popularity)}#${title.id}`, title });
    }
  }

  // BatchWrite in chunks of 25.
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await doc.send(
      new BatchWriteCommand({
        RequestItems: { [table]: chunk.map((Item) => ({ PutRequest: { Item } })) },
      }),
    );
  }

  console.log(`Seeded ${items.length} items for ${SAMPLE_CATALOGUE.length} titles into ${table}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
