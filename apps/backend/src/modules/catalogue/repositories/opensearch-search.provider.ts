import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type { SearchProvider } from '../domain/search.provider';
import type { Title } from '../domain/title.entity';

export const CATALOGUE_INDEX = 'catalogue';

/**
 * OpenSearch relevance search. Multi-match across title (boosted), overview,
 * cast, and genres with fuzziness for typo tolerance. Documents are the title
 * objects themselves (see scripts/index-catalogue.ts).
 */
@Injectable()
export class OpenSearchSearchProvider implements SearchProvider {
  private readonly logger = new Logger(OpenSearchSearchProvider.name);
  private readonly client: Client;

  constructor(config: ConfigService) {
    const node = config.get<string>('openSearchEndpoint')!;
    this.client = new Client({
      ...AwsSigv4Signer({
        region: config.get<string>('region') ?? 'us-east-1',
        service: 'es',
        getCredentials: () => defaultProvider()(),
      }),
      node,
    });
  }

  async search(query: string, limit = 30): Promise<Title[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const res = await this.client.search<{ hits: { hits: { _source: Title }[] } }>({
        index: CATALOGUE_INDEX,
        body: {
          size: limit,
          query: {
            multi_match: {
              query: q,
              fields: ['title^3', 'overview', 'cast^2', 'genres^2', 'director'],
              fuzziness: 'AUTO',
              type: 'best_fields',
            },
          },
        },
      });
      return res.body.hits.hits.map((h) => h._source);
    } catch (error) {
      this.logger.error({ err: error }, 'OpenSearch query failed');
      return [];
    }
  }
}
