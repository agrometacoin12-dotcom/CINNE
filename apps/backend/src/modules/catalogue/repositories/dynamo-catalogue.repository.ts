import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
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

  // ── Admin / write surface ──────────────────────────────────────────────────

  private static pad(n: number): string {
    return String(Math.max(0, Math.min(999999, Math.round(n)))).padStart(6, '0');
  }

  private static searchText(t: Title): string {
    return [t.title, t.overview, ...t.cast, ...t.genres].join(' ').toLowerCase();
  }

  /** All META items (a full scan; acceptable for the admin console scale). */
  async listAll(): Promise<Title[]> {
    const res = await this.doc.send(
      new ScanCommand({
        TableName: this.table,
        FilterExpression: 'SK = :meta',
        ExpressionAttributeValues: { ':meta': 'META' },
      }),
    );
    return (res.Items ?? [])
      .filter((i) => typeof i.PK === 'string' && (i.PK as string).startsWith('TITLE#'))
      .map((i) => i.title as Title)
      .sort((a, b) => b.popularity - a.popularity);
  }

  async listPremieres(): Promise<Title[]> {
    return (await this.listAll())
      .filter((t) => t.isPremiere && t.status === 'published')
      .sort(
        (a, b) =>
          new Date(a.premiereStartAt ?? 0).getTime() - new Date(b.premiereStartAt ?? 0).getTime(),
      );
  }

  /** Writes the META item plus a denormalized membership item per category. */
  async save(title: Title): Promise<Title> {
    // Remove stale category-membership items if the title already existed.
    const prev = await this.findById(title.id);
    if (prev) await this.deleteCategoryItems(prev);

    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: {
          PK: `TITLE#${title.id}`,
          SK: 'META',
          title,
          searchText: DynamoCatalogueRepository.searchText(title),
        },
      }),
    );

    if (title.status === 'published') {
      await Promise.all(
        title.categories.map((cat) =>
          this.doc.send(
            new PutCommand({
              TableName: this.table,
              Item: {
                PK: `CAT#${cat}`,
                SK: `POP#${DynamoCatalogueRepository.pad(title.popularity)}#${title.id}`,
                title,
              },
            }),
          ),
        ),
      );
    }
    return title;
  }

  async update(id: string, patch: Partial<Title>): Promise<Title> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`Title ${id} not found`);
    const merged: Title = { ...existing, ...patch, id };
    return this.save(merged);
  }

  async setFeatured(id: string, featured: boolean): Promise<void> {
    // Clear any current featured pointer + flag.
    const current = await this.featured();
    if (current) {
      await this.doc.send(
        new DeleteCommand({ TableName: this.table, Key: { PK: 'FEATURED', SK: 'META' } }),
      );
      if (current.id !== id) {
        await this.update(current.id, { featured: false });
      }
    }
    const target = await this.findById(id);
    if (!target) return;
    await this.update(id, { featured });
    if (featured) {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: { PK: 'FEATURED', SK: 'META', title: { ...target, featured: true } },
        }),
      );
    }
  }

  async delete(id: string): Promise<void> {
    // The DynamoDB driver is legacy (production moved to Postgres/Prisma);
    // deletion was never part of its admin surface.
    throw new Error(`delete(${id}) is not supported by the DynamoDB catalogue driver`);
  }

  private async deleteCategoryItems(title: Title): Promise<void> {
    await Promise.all(
      title.categories.map((cat) =>
        this.doc.send(
          new DeleteCommand({
            TableName: this.table,
            Key: {
              PK: `CAT#${cat}`,
              SK: `POP#${DynamoCatalogueRepository.pad(title.popularity)}#${title.id}`,
            },
          }),
        ),
      ),
    );
  }
}
