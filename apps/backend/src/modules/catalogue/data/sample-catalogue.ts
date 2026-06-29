import { withCommerceDefaults, type SeedTitle, type Title } from '../domain/title.entity';

/**
 * Seed catalogue of original, fictional titles so the platform is fully
 * self-contained (no third-party content API). Used directly by the local
 * driver and loaded into DynamoDB by the seed script. Commerce/premiere fields
 * are filled in by `withCommerceDefaults` so seed entries stay terse.
 */
const RAW_TITLES: SeedTitle[] = [
  {
    id: '11111111-1111-4111-8111-000000000001',
    type: 'movie',
    title: 'Aurora Drift',
    tagline: 'Some horizons pull you under.',
    overview:
      'A deep-sea cartographer chasing a vanished signal discovers a city that should not exist beneath the ice.',
    year: 2025, genres: ['Sci-Fi', 'Mystery'], runtimeMinutes: 128, seasons: null,
    maturityRating: 'PG-13', rating: 8.4, posterKey: null, heroKey: null,
    cast: ['Mara Quill', 'Idris Vane'], director: 'Lena Ostrov',
    categories: ['trending', 'most-watched', 'coming-soon', 'new-releases', 'acclaimed'], popularity: 98, featured: true,
  },
  {
    id: '11111111-1111-4111-8111-000000000002',
    type: 'movie',
    title: 'The Paper Kingdom',
    tagline: 'Every empire is one folded page from ruin.',
    overview:
      'A forger of royal documents in a crumbling court must choose between the truth and the family she invented.',
    year: 2024, genres: ['Drama', 'Thriller'], runtimeMinutes: 141, seasons: null,
    maturityRating: 'R', rating: 8.1, posterKey: null, heroKey: null,
    cast: ['Sofia Reñé', 'Auguste Bell'], director: 'Tomas Hale',
    categories: ['acclaimed', 'trending', 'most-watched'], popularity: 91, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000003',
    type: 'series',
    title: 'Nightglass',
    tagline: 'The city only wakes after midnight.',
    overview:
      'A noir detective bends the rules of a neon metropolis where memories can be bought, sold, and forged.',
    year: 2025, genres: ['Crime', 'Sci-Fi'], runtimeMinutes: null, seasons: 2,
    maturityRating: 'TV-MA', rating: 8.7, posterKey: null, heroKey: null,
    cast: ['Devon Cross', 'Yuki Mori'], director: null,
    categories: ['series', 'trending', 'most-watched'], popularity: 95, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000004',
    type: 'movie',
    title: 'Saltwater Saints',
    tagline: 'Faith is a tide.',
    overview:
      'Two estranged sisters return to their island home and reopen a wound the whole town agreed to forget.',
    year: 2023, genres: ['Drama'], runtimeMinutes: 117, seasons: null,
    maturityRating: 'PG-13', rating: 7.9, posterKey: null, heroKey: null,
    cast: ['Niamh O\'Dell', 'Carys Bloom'], director: 'Marie Dunn',
    categories: ['acclaimed'], popularity: 78, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000005',
    type: 'movie',
    title: 'Velocity Theory',
    tagline: 'Outrun everything but the truth.',
    overview:
      'A getaway driver with a perfect record takes one last job that loops back through her own past.',
    year: 2025, genres: ['Action', 'Thriller'], runtimeMinutes: 109, seasons: null,
    maturityRating: 'PG-13', rating: 7.6, posterKey: null, heroKey: null,
    cast: ['Renata Cole', 'Sam Adeyemi'], director: 'Kai Brennan',
    categories: ['trending', 'most-watched', 'coming-soon', 'new-releases'], popularity: 88, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000006',
    type: 'series',
    title: 'The Long Orchard',
    tagline: 'Generations grow in the same soil.',
    overview:
      'A sweeping family saga set across a century of a fruit-growing valley and the secrets buried under the trees.',
    year: 2024, genres: ['Drama', 'History'], runtimeMinutes: null, seasons: 3,
    maturityRating: 'TV-14', rating: 8.5, posterKey: null, heroKey: null,
    cast: ['Eleanor Voss', 'Hiroshi Tan'], director: null,
    categories: ['series', 'acclaimed', 'most-watched'], popularity: 84, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000007',
    type: 'movie',
    title: 'Comet Season',
    tagline: 'Make a wish you can keep.',
    overview:
      'A small-town astronomer and a touring musician fall in love during the week a comet passes overhead.',
    year: 2024, genres: ['Romance', 'Comedy'], runtimeMinutes: 102, seasons: null,
    maturityRating: 'PG', rating: 7.4, posterKey: null, heroKey: null,
    cast: ['Priya Anand', 'Theo Marsh'], director: 'Gwen Liu',
    categories: ['new-releases', 'coming-soon'], popularity: 72, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000008',
    type: 'movie',
    title: 'Ironwood',
    tagline: 'The forest remembers.',
    overview:
      'A ranger hunting a phantom fire uncovers what the wilderness has been protecting for decades.',
    year: 2023, genres: ['Mystery', 'Horror'], runtimeMinutes: 121, seasons: null,
    maturityRating: 'R', rating: 7.2, posterKey: null, heroKey: null,
    cast: ['Hollis Crane', 'Ada Fenn'], director: 'Victor Soto',
    categories: ['trending'], popularity: 69, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000009',
    type: 'series',
    title: 'Grand Static',
    tagline: 'Tune in to the impossible.',
    overview:
      'A 1970s radio crew starts receiving broadcasts from a station that will not exist for another forty years.',
    year: 2025, genres: ['Sci-Fi', 'Drama'], runtimeMinutes: null, seasons: 1,
    maturityRating: 'TV-14', rating: 8.2, posterKey: null, heroKey: null,
    cast: ['June Park', 'Marcus Lowe'], director: null,
    categories: ['series', 'new-releases', 'trending', 'most-watched', 'coming-soon'], popularity: 86, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000010',
    type: 'movie',
    title: 'The Cartographer\'s Daughter',
    tagline: 'Every map hides a door.',
    overview:
      'A grieving daughter follows her late father\'s impossible map across three continents and one closed border.',
    year: 2024, genres: ['Adventure', 'Drama'], runtimeMinutes: 133, seasons: null,
    maturityRating: 'PG-13', rating: 8.0, posterKey: null, heroKey: null,
    cast: ['Amara Diallo', 'Lukas Veen'], director: 'Rosa Imai',
    categories: ['acclaimed', 'new-releases'], popularity: 81, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000011',
    type: 'movie',
    title: 'Neon Harvest',
    tagline: 'The future is hungry.',
    overview:
      'In a vertical farm-city, a maintenance worker stumbles onto a conspiracy growing in the dark between floors.',
    year: 2025, genres: ['Sci-Fi', 'Thriller'], runtimeMinutes: 115, seasons: null,
    maturityRating: 'PG-13', rating: 7.7, posterKey: null, heroKey: null,
    cast: ['Bo Tran', 'Selma Hart'], director: 'Otto Vance',
    categories: ['trending', 'most-watched', 'coming-soon', 'new-releases'], popularity: 83, featured: false,
  },
  {
    id: '11111111-1111-4111-8111-000000000012',
    type: 'series',
    title: 'Quiet Hours',
    tagline: 'Listen closely.',
    overview:
      'A night-shift hospital chaplain becomes the unlikely confidant of the city\'s strangest emergencies.',
    year: 2024, genres: ['Drama'], runtimeMinutes: null, seasons: 2,
    maturityRating: 'TV-MA', rating: 8.3, posterKey: null, heroKey: null,
    cast: ['Grace Abara', 'Daniel Fox'], director: null,
    categories: ['series', 'acclaimed'], popularity: 79, featured: false,
  },
];

export const SAMPLE_CATALOGUE: Title[] = RAW_TITLES.map(withCommerceDefaults);
