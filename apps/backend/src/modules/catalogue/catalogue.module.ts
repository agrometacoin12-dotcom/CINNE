import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogueController } from './catalogue.controller';
import { CatalogueResolver } from './catalogue.resolver';
import { CatalogueService } from './catalogue.service';
import { CATALOGUE_REPOSITORY, type CatalogueRepository } from './domain/catalogue.repository';
import { SEARCH_PROVIDER } from './domain/search.provider';
import { LocalCatalogueRepository } from './repositories/local-catalogue.repository';
import { DynamoCatalogueRepository } from './repositories/dynamo-catalogue.repository';
import { LocalSearchProvider } from './repositories/local-search.provider';
import { OpenSearchSearchProvider } from './repositories/opensearch-search.provider';

@Module({
  controllers: [CatalogueController],
  providers: [
    CatalogueService,
    CatalogueResolver,
    {
      // Driver-swappable repository: local seed (offline) vs DynamoDB (AWS).
      provide: CATALOGUE_REPOSITORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('catalogueDriver') ?? 'local';
        return driver === 'dynamodb'
          ? new DynamoCatalogueRepository(config)
          : new LocalCatalogueRepository();
      },
    },
    {
      // Driver-swappable search: local substring vs OpenSearch relevance.
      provide: SEARCH_PROVIDER,
      inject: [ConfigService, CATALOGUE_REPOSITORY],
      useFactory: (config: ConfigService, repo: CatalogueRepository) => {
        const driver = config.get<string>('searchDriver') ?? 'local';
        return driver === 'opensearch'
          ? new OpenSearchSearchProvider(config)
          : new LocalSearchProvider(repo);
      },
    },
  ],
  exports: [CatalogueService],
})
export class CatalogueModule {}
