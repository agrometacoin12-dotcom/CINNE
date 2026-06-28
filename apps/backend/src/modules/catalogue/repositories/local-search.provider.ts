import { Inject, Injectable } from '@nestjs/common';
import { CATALOGUE_REPOSITORY, type CatalogueRepository } from '../domain/catalogue.repository';
import type { SearchProvider } from '../domain/search.provider';
import type { Title } from '../domain/title.entity';

/** Offline search: reuses the repository's substring scan. */
@Injectable()
export class LocalSearchProvider implements SearchProvider {
  constructor(@Inject(CATALOGUE_REPOSITORY) private readonly repo: CatalogueRepository) {}

  search(query: string, limit = 30): Promise<Title[]> {
    return this.repo.search(query, limit);
  }
}
