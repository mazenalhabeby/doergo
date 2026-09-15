import { REPORT_LABELS, SUPPORTED_LOCALES, isReportLabelKey, localizeReportColumns, reportLabel } from '@hbcfield/shared';
import { DATASETS, datasetCatalog } from '../registry';
import { compile } from '../query-engine';
import { AnalyticsService } from '../analytics.service';

/*
  A report's column names are the system's own words, and each reader gets them
  in their language: the web table (and the CSV/PDF made from it) in the
  viewer's, the scheduled email in each recipient group's.

  That only holds if EVERY name the registry can produce has a key in the one
  catalogue and all five languages behind it. A field added with a key that is
  missing, or with a language left out, would render English to a German reader
  with nothing on screen to say why — so this walks the registry itself rather
  than a list somebody has to remember to extend.
*/
describe('report column names — every registry name is catalogued in five languages', () => {
  it('every catalogue entry has all five languages, none empty', () => {
    for (const [key, labels] of Object.entries(REPORT_LABELS)) {
      for (const locale of SUPPORTED_LOCALES) {
        const text = (labels as Record<string, string>)[locale];
        expect({ key, locale, ok: typeof text === 'string' && text.trim().length > 0 }).toEqual({ key, locale, ok: true });
      }
    }
  });

  it('every dataset, dimension and measure names a catalogued key', () => {
    const missing: string[] = [];
    for (const ds of Object.values(DATASETS)) {
      if (!isReportLabelKey(ds.labelKey)) missing.push(`dataset ${ds.key}`);
      for (const [k, d] of Object.entries(ds.dimensions)) if (!isReportLabelKey(d.labelKey)) missing.push(`${ds.key}.${k}`);
      for (const [k, m] of Object.entries(ds.measures)) if (!isReportLabelKey(m.labelKey)) missing.push(`${ds.key}.${k}`);
    }
    expect(missing).toEqual([]);
  });

  it('a compiled report carries a key on every column, the period included', () => {
    for (const ds of Object.values(DATASETS)) {
      const { columns } = compile(
        { dataset: ds.key, measures: Object.keys(ds.measures), dimensions: Object.keys(ds.dimensions), granularity: 'month' },
        'org',
      );
      for (const c of columns) {
        expect({ column: `${ds.key}.${c.key}`, catalogued: isReportLabelKey(c.labelKey) }).toEqual({ column: `${ds.key}.${c.key}`, catalogued: true });
        // The English label is READ from the catalogue — one spelling, not two.
        expect(c.label).toBe(REPORT_LABELS[c.labelKey].en);
      }
    }
  });

  it('the builder catalogue sends the key beside the English name', () => {
    for (const d of datasetCatalog()) {
      expect(d.label).toBe(reportLabel('en', d.labelKey));
      for (const f of [...d.dimensions, ...d.measures]) expect(f.label).toBe(reportLabel('en', f.labelKey));
    }
  });

  it('the day-by-day timesheet names its columns from the catalogue too', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ firstName: 'Ana', lastName: 'Ruiz' }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const { data } = await new AnalyticsService(prisma as any).timesheetDetail({ organizationId: 'org', userId: 'u1' });
    expect(data.columns.length).toBeGreaterThan(0);
    for (const c of data.columns) expect(isReportLabelKey(c.labelKey)).toBe(true);
    expect(localizeReportColumns(data.columns, 'de').find((c) => c.key === 'clockIn')?.label).toBe('Einstempeln');
  });

  it('names a column in the reader language, and keeps what it was given for a key it does not know', () => {
    expect(reportLabel('de-AT', 'col.hoursWorked')).toBe('Gearbeitete Stunden');
    expect(reportLabel('fr', 'col.period')).toBe('Période');
    expect(reportLabel('pt', 'col.period')).toBe('Period');
    expect(reportLabel('it', 'custom.field', 'Kilometerstand')).toBe('Kilometerstand');
    // An organization-named column arrives without a catalogued key and stays as written.
    expect(localizeReportColumns([{ key: 'cf', label: 'Zählerstand' }], 'es')).toEqual([{ key: 'cf', label: 'Zählerstand' }]);
  });

  /* Product rule: time is counted or worked, never "paid", in any language. */
  it('never says paid, in any language', () => {
    const pay = /\b(un)?paid\b|bezahlt|vergütet|pagad|remunerad|payé|rémunér|pagat|retribuit/i;
    for (const labels of Object.values(REPORT_LABELS)) {
      for (const text of Object.values(labels)) expect(text).not.toMatch(pay);
    }
  });
});
