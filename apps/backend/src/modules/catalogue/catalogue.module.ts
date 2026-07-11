import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogueController } from './catalogue.controller';
import { CatalogueResolver } from './catalogue.resolver';
import { CatalogueSeedService } from './catalogue-seed.service';
import { CatalogueService } from './catalogue.service';
import { CATALOGUE_REPOSITORY, type CatalogueRepository } from './domain/catalogue.repository';
import { SEARCH_PROVIDER } from './domain/search.provider';
import { LocalCatalogueRepository } from './repositories/local-catalogue.repository';
import { DynamoCatalogueRepository } from './repositories/dynamo-catalogue.repository';
import { PrismaCatalogueRepository } from './repositories/prisma-catalogue.repository';
import { LocalSearchProvider } from './repositories/local-search.provider';
import { OpenSearchSearchProvider } from './repositories/opensearch-search.provider';

@Module({
  controllers: [CatalogueController],
  providers: [
    CatalogueService,
    CatalogueResolver,
    CatalogueSeedService,
    {
      // Driver-swappable repository: Postgres via Prisma (default, persistent),
      // in-memory seed (offline tests), or DynamoDB (legacy AWS).
      provide: CATALOGUE_REPOSITORY,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const driver = config.get<string>('catalogueDriver') ?? 'prisma';
        switch (driver) {
          case 'dynamodb':
            return new DynamoCatalogueRepository(config);
          case 'local':
            return new LocalCatalogueRepository();
          default:
            return new PrismaCatalogueRepository(prisma);
        }
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
