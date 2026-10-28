import { deriveIndustries, type IndustryRule } from './industry';

const AFRICA = ['NG', 'GH', 'ZA', 'KE', 'EG', 'SN'];
const EUROPE = ['FR', 'DE', 'GB', 'NO', 'CH', 'UA'];

/** A trimmed copy of the seeded vocabulary (docs/content-classification.md). */
const INDUSTRIES: IndustryRule[] = [
  { slug: 'nollywood', countries: ['NG'], languages: [] },
  { slug: 'ghallywood', countries: ['GH'], languages: [] },
  { slug: 'bollywood', countries: ['IN'], languages: ['hi'] },
  { slug: 'hollywood', countries: ['US'], languages: [] },
  { slug: 'kannywood', countries: ['NG'], languages: ['ha'] },
  { slug: 'yoruba-cinema', countries: [], languages: ['yo'] },
  { slug: 'igbo-cinema', countries: [], languages: ['ig'] },
  { slug: 'south-african-cinema', countries: ['ZA'], languages: [] },
  { slug: 'african-cinema', countries: AFRICA, languages: [] },
  { slug: 'korean-cinema', countries: ['KR'], languages: [] },
  { slug: 'european-cinema', countries: EUROPE, languages: [] },
  { slug: 'international-cinema', countries: [], languages: [] },
];

const derive = (countries: string[], languages: string[]) =>
  deriveIndustries(countries, languages, INDUSTRIES);

describe('deriveIndustries', () => {
  it('NG + Hausa → Nollywood, Kannywood, African Cinema', () => {
    expect(derive(['NG'], ['ha'])).toEqual(['nollywood', 'kannywood', 'african-cinema']);
  });

  it('NG + Yoruba → Nollywood, Yoruba Cinema, African Cinema', () => {
    expect(derive(['NG'], ['yo'])).toEqual(['nollywood', 'yoruba-cinema', 'african-cinema']);
  });

  it('NG + English → Nollywood, African Cinema (not Kannywood)', () => {
    expect(derive(['NG'], ['en'])).toEqual(['nollywood', 'african-cinema']);
  });

  it('GH → Ghallywood, African Cinema', () => {
    expect(derive(['GH'], ['en', 'tw'])).toEqual(['ghallywood', 'african-cinema']);
  });

  it('IN + Hindi → Bollywood; IN without Hindi → International', () => {
    expect(derive(['IN'], ['hi'])).toEqual(['bollywood']);
    expect(derive(['IN'], ['ta'])).toEqual(['international-cinema']);
  });

  it('US → Hollywood', () => {
    expect(derive(['US'], ['en'])).toEqual(['hollywood']);
  });

  it('FR → European Cinema', () => {
    expect(derive(['FR'], ['fr'])).toEqual(['european-cinema']);
  });

  it('language-only industries match without countries', () => {
    expect(derive([], ['ig'])).toEqual(['igbo-cinema']);
  });

  it('unknown country/language → International Cinema', () => {
    expect(derive(['AQ'], [])).toEqual(['international-cinema']);
    expect(derive([], ['xx'])).toEqual(['international-cinema']);
  });

  it('no countries and no languages → nothing', () => {
    expect(derive([], [])).toEqual([]);
    expect(derive(['  '], [''])).toEqual([]);
  });

  it('is case-insensitive on both inputs and the vocabulary', () => {
    expect(derive(['ng'], ['HA'])).toEqual(['nollywood', 'kannywood', 'african-cinema']);
    expect(
      deriveIndustries(['us'], [], [{ slug: 'hollywood', countries: ['us'], languages: [] }]),
    ).toEqual(['hollywood']);
    expect(
      deriveIndustries(
        ['IN'],
        ['hi'],
        [{ slug: 'bollywood', countries: ['IN'], languages: ['HI'] }],
      ),
    ).toEqual(['bollywood']);
  });

  it('multiple countries combine', () => {
    expect(derive(['US', 'NG'], ['en'])).toEqual(['nollywood', 'hollywood', 'african-cinema']);
  });

  it('never matches a vocabulary row with no rules', () => {
    expect(deriveIndustries(['NG'], [], [{ slug: 'empty', countries: [], languages: [] }])).toEqual(
      ['international-cinema'],
    );
  });
});
