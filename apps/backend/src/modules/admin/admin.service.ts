import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogueService } from '../catalogue/catalogue.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../auth/audit.service';
import { EventBus } from '../../infra/events/event-bus';
import type { Title } from '../catalogue/domain/title.entity';
import type { CreateMovieDto, PresignUploadDto, SetPremiereDto, UpdateMovieDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  private readonly defaultCurrency: string;

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    config: ConfigService,
  ) {
    this.defaultCurrency = config.get<string>('defaultCurrency') ?? 'NGN';
  }

  list() {
    return this.catalogue.adminList();
  }

  get(id: string) {
    return this.catalogue.adminGet(id);
  }

  async create(dto: CreateMovieDto, actorId: string) {
    const id = randomUUID();
    const title: Title = {
      id,
      type: dto.type ?? 'movie',
      title: dto.title,
      tagline: dto.tagline ?? null,
      overview: dto.overview,
      year: dto.year,
      genres: dto.genres ?? [],
      runtimeMinutes: dto.runtimeMinutes ?? null,
      seasons: null,
      maturityRating: dto.maturityRating ?? null,
      rating: 0,
      posterKey: dto.posterKey ?? null,
      heroKey: dto.heroKey ?? null,
      cast: dto.cast ?? [],
      director: dto.director ?? null,
      categories: dto.categories ?? [],
      popularity: dto.popularity ?? 50,
      featured: false,
      status: dto.status ?? 'draft',
      priceMinor: dto.priceMinor ?? 0,
      currency: dto.currency ?? this.defaultCurrency,
      videoKey: dto.videoKey ?? null,
      durationSeconds: dto.durationSeconds ?? (dto.runtimeMinutes ? dto.runtimeMinutes * 60 : null),
      isPremiere: dto.isPremiere ?? false,
      premiereStartAt: dto.premiereStartAt ?? null,
    };
    const created = await this.catalogue.createTitle(title);
    await this.audit.record({ actorId, action: 'admin.movie.create', entity: 'Title', entityId: id });
    await this.events.publish({ name: 'movie.created', detail: { titleId: id, title: dto.title } });
    return created;
  }

  async update(id: string, dto: UpdateMovieDto, actorId: string) {
    const patch: Partial<Title> = {};
    const assign = <K extends keyof Title>(k: K, v: Title[K] | undefined | null) => {
      if (v !== undefined) patch[k] = v as Title[K];
    };
    assign('type', dto.type);
    assign('title', dto.title);
    assign('tagline', dto.tagline ?? undefined);
    assign('overview', dto.overview);
    assign('year', dto.year);
    assign('genres', dto.genres);
    assign('cast', dto.cast);
    assign('director', dto.director ?? undefined);
    assign('categories', dto.categories);
    assign('maturityRating', dto.maturityRating ?? undefined);
    assign('runtimeMinutes', dto.runtimeMinutes);
    assign('durationSeconds', dto.durationSeconds);
    assign('priceMinor', dto.priceMinor);
    assign('currency', dto.currency);
    assign('posterKey', dto.posterKey);
    assign('heroKey', dto.heroKey);
    assign('videoKey', dto.videoKey);
    assign('popularity', dto.popularity);
    assign('status', dto.status);
    assign('isPremiere', dto.isPremiere);
    assign('premiereStartAt', dto.premiereStartAt ?? undefined);

    const updated = await this.catalogue.updateTitle(id, patch);
    await this.audit.record({ actorId, action: 'admin.movie.update', entity: 'Title', entityId: id });
    return updated;
  }

  async setFeatured(id: string, featured: boolean, actorId: string) {
    await this.catalogue.setFeatured(id, featured);
    await this.audit.record({
      actorId,
      action: 'admin.movie.featured',
      entity: 'Title',
      entityId: id,
      metadata: { featured },
    });
    return this.catalogue.adminGet(id);
  }

  async setPremiere(id: string, dto: SetPremiereDto, actorId: string) {
    if (dto.isPremiere && !dto.premiereStartAt) {
      throw new BadRequestException('A premiere requires a showtime (premiereStartAt).');
    }
    const updated = await this.catalogue.updateTitle(id, {
      isPremiere: dto.isPremiere,
      premiereStartAt: dto.isPremiere ? (dto.premiereStartAt ?? null) : null,
    });
    await this.audit.record({
      actorId,
      action: 'admin.movie.premiere',
      entity: 'Title',
      entityId: id,
      metadata: { isPremiere: dto.isPremiere, premiereStartAt: dto.premiereStartAt },
    });
    await this.events.publish({
      name: 'movie.premiere.scheduled',
      detail: { titleId: id, premiereStartAt: dto.premiereStartAt },
    });
    return updated;
  }

  presignUpload(dto: PresignUploadDto) {
    return this.media.presignUpload(dto.kind, dto.contentType);
  }
}
