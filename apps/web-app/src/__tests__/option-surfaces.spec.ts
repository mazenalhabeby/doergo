import { readFileSync } from 'fs';
import { ROUTE_RULES, SETTINGS_SECTION_RULES } from '@/lib/route-access';
import { join } from 'path';
import { NAV_OPTION, SPACE_TAB_OPTION, SETTINGS_OPTION, ADD_ON_KEYS } from '@hbcfield/shared/client';
import { readNavbar } from './_navbar-screen';

/*
  An Option that is switched off has to disappear in three places: the server
  refuses the write, the page refuses to render, and THE WAY IN GOES.

  The third was missing everywhere. The navigation decided every item on
  PERMISSIONS ALONE — not one of them asked what the organization had bought — so
  switching an Option off left its entry point exactly where it was, for every
  role, and the refusal arrived a click or two later from a page or a save. A
  control somebody can press that then refuses reads as broken software, not as
  something unbought.

  These walk the tables against the sources that must honour them, so an Option
  cannot gain a surface without gaining its check.
*/

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('every surface an Option owns is gated', () => {
  it('the navigation asks about every href in the table', () => {
    // The bar reads the route table (lib/route-access), which carries each
    // Option on the page it owns.
    const navbar = readNavbar();
    expect(navbar).toContain('useRouteAccess()');
    const ungated = Object.entries(NAV_OPTION).filter(([href, opt]) => ROUTE_RULES[href]?.option !== opt);
    expect(ungated).toEqual([]);
    expect(read('hooks/use-schedule-access.ts')).toContain('offers("/schedule")');
  });

  it('every way into the Schedule asks the same hook', () => {
    // The calendar's Team button and a colleague's leave both link to it.
    expect(read('app/(dashboard)/calendar/page.tsx')).toContain('useScheduleAccess()');
  });

  it('the workspace tabs ask about every tab in the table', () => {
    const page = read('app/(dashboard)/locations/[id]/page.tsx');
    const ungated = Object.keys(SPACE_TAB_OPTION).filter((tab) => !page.includes(`optionAllows("${tab}")`));
    expect(ungated).toEqual([]);
  });

  it('the settings list reads the shared table, not a copy of it', () => {
    // It kept its own map — correct, and one of three places that had to be
    // found and edited together whenever an Option gained a surface.
    const settings = read('app/(dashboard)/settings/page.tsx');
    expect(settings).toContain('routeAccess.settingsSections');
    expect(settings).not.toContain('SECTION_PLAN_FEATURE');
    for (const [key, opt] of Object.entries(SETTINGS_OPTION)) {
      expect([key, SETTINGS_SECTION_RULES[key as keyof typeof SETTINGS_SECTION_RULES]?.option]).toEqual([key, opt]);
    }
  });

  it('names only Options that exist', () => {
    // A surface pointing at a key nobody sells would be permanently hidden, and
    // nothing would say why — the mirror of the Apartment portal gate, which
    // demanded a module the product had removed.
    const keys = [
      ...Object.values(NAV_OPTION),
      ...Object.values(SPACE_TAB_OPTION),
      ...Object.values(SETTINGS_OPTION),
    ];
    for (const k of keys) expect(ADD_ON_KEYS).toContain(k);
  });
});

describe('the workflow builder', () => {
  /*
    The worst case in the audit: the tab was unconditional, the builder opened,
    and the 402 arrived at the save — after the work was done.
  */
  it('is behind the tab, the tab body and the inline path', () => {
    const page = read('app/(dashboard)/locations/[id]/page.tsx');
    // The tab itself, and the body — for ?tab=workflow and bookmarks.
    expect(page).toContain('optionAllows("workflow")');
    expect(page).toContain('<PlanGate feature="workflows">');

    // …and the second way in, from inside the space form.
    const form = read('app/(dashboard)/locations/_components/space-form.tsx');
    expect(form).toContain('allowCreate={hasPlanFeature("workflows")}');
  });
});
