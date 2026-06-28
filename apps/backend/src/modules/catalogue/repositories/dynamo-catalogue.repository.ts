import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { CatalogueRepository } from '../domain/catalogue.repository';
import type { Title } from '../domain/title.entity';

/**
 * DynamoDB single-table catalogue store.
 *
 *   Title item:        PK = TITLE#<id>           SK = META
 *   Category member:   PK = CAT#<slug>           SK = POP#<padded>#<id>
 *                      GSI not required; query PK to read a row ordered by SK.
 *
 * Category-membership items carry a denormalized copy of the title so a browse
 * row is a single query with no fan-out reads.
 */
@Injectable()
export class DynamoCatalogueRepository implements CatalogueRepository {
  private readonly logger = new Logger(DynamoCatalogueRepository.name);
  private readonly doc: DynamoDBDocumentClient;
  private readonly table: string;

  constructor(config: ConfigService) {
    const client = new DynamoDBClient({ region: config.get<string>('region') });
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.table = config.get<string>('catalogueTable') ?? 'cinnetemple-catalogue';
  }

  async listByCategory(category: string, limit = 20): Promise<Title[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `CAT#${category}`, ':sk': 'POP#' },
        ScanIndexForward: false, // highest popularity first
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map((i) => i.title as Title);
  }

  async findById(id: string): Promise<Title | null> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK: `TITLE#${id}`, SK: 'META' } }),
    );
    return (res.Item?.title as Title) ?? null;
  }

  async search(query: string, limit = 30): Promise<Title[]> {
    // Substring scan is acceptable for the seed catalogue. At scale this is
    // replaced by an OpenSearch query (titles stream → index) — see CATALOGUE.md.
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const res = await this.doc.send(
      new ScanCommand({
        TableName: this.table,
        FilterExpression: 'SK = :meta AND contains(#s, :q)',
        ExpressionAttributeNames: { '#s': 'searchText' },
        ExpressionAttributeValues: { ':meta': 'META', ':q': q },
        Limit: 200,
      }),
    );
    return (res.Items ?? [])
      .map((i) => i.title as Title)
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  async featured(): Promise<Title | null> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'FEATURED' },
        Limit: 1,
      }),
    );
    return (res.Items?.[0]?.title as Title) ?? null;
  }
}
