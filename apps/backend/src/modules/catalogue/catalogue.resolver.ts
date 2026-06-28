import { Args, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../../common/decorators/public.decorator';
import { CatalogueService } from './catalogue.service';
import {
  BrowseResponseType,
  SearchResponseType,
  TitleType,
} from './graphql/catalogue.types';

/**
 * GraphQL read layer for the catalogue. Aggregation-friendly: clients fetch the
 * whole browse screen (hero + rows) in one round trip and request only the
 * fields they need. Reuses the same CatalogueService as the REST controller.
 */
@Resolver(() => TitleType)
export class CatalogueResolver {
  constructor(private readonly catalogue: CatalogueService) {}

  @Public()
  @Query(() => BrowseResponseType, { name: 'browse' })
  browse() {
    return this.catalogue.browse();
  }

  @Public()
  @Query(() => TitleType, { name: 'title' })
  title(@Args('id') id: string) {
    return this.catalogue.getTitle(id);
  }

  @Public()
  @Query(() => SearchResponseType, { name: 'search' })
  search(@Args('q') q: string) {
    return this.catalogue.search(q);
  }
}
