'use client';

import { useTranslation } from 'react-i18next';
import { MapPin, ClipboardCheck, Users, Boxes, KanbanSquare, Receipt } from 'lucide-react';
import { MODULE_MONTHLY_CENTS, AVAILABLE_ADD_ONS, formatCents } from '@hbcfield/shared/client';

const MONO = 'font-[family:var(--font-martian)]';
const DISPLAY = 'font-[family:var(--font-familjen)]';
const ACCENT = '#5B9BD5';

/**
 * What you can switch on, grouped by the problem it solves.
 *
 * Twice wrong before this. First a tick-and-cross matrix, where every ✗ meant
 * "upgrade to unlock" — which cannot survive the tiers going away. Then the raw
 * price list: twenty-seven rows of feature names and numbers, which is accurate,
 * unreadable, and adds up in the reader's head to a total nobody would ever pay.
 *
 * A price list is a reference. Somebody deciding whether to buy is not reading a
 * reference — they are looking for the thing that fixes their problem and then
 * asking what it costs. So the modules are grouped by the JOB they do, named in
 * words a tradesperson uses rather than ours, and each group carries the one
 * number that matters: what it costs to switch that whole capability on.
 *
 * The individual prices are still there, under the group, for anybody who wants
 * to check the arithmetic. They are just no longer the first thing anyone reads.
 *
 * Every figure comes from the same table the product bills from, so this page
 * and an invoice cannot quote different numbers.
 */

type Group = {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Module keys, in the order they should read. */
  modules: string[];
  /** Counted modules say so in words rather than showing a ladder. */
  note?: string;
};

export function FeatureMatrix() {
  const { t } = useTranslation();

  const price = (k: string) => MODULE_MONTHLY_CENTS[k] ?? 0;
  const sum = (keys: string[]) => keys.reduce((n, k) => n + price(k), 0);

  const GROUPS: Group[] = [
    {
      key: 'where',
      icon: <MapPin className="h-4 w-4" />,
      title: t('home.groups.where.title', 'Know where everyone is'),
      body: t('home.groups.where.body', 'Live map, the route each van actually drove, and geofenced clock-in you can put on a timesheet.'),
      modules: ['tracking', 'time_tracking'],
    },
    {
      key: 'prove',
      icon: <ClipboardCheck className="h-4 w-4" />,
      title: t('home.groups.prove.title', 'Prove the job was done'),
      body: t('home.groups.prove.body', 'Photos, parts used and a customer signature, turned into a report you can send or bill from.'),
      modules: ['service_reports', 'checklists', 'attachments'],
    },
    {
      key: 'clients',
      icon: <Users className="h-4 w-4" />,
      title: t('home.groups.clients.title', 'Keep customers in the loop'),
      body: t('home.groups.clients.body', 'Every customer, their history, and — if you want — a login where they place orders and watch their job.'),
      modules: ['crm', 'b2c_portal'],
      note: t('home.groups.clients.note', 'Covers your first 50 customers and one portal; grows from 30c a customer after that.'),
    },
    {
      key: 'things',
      icon: <Boxes className="h-4 w-4" />,
      title: t('home.groups.things.title', 'Track what you look after'),
      body: t('home.groups.things.body', 'Apartments, vehicles, machines — what they are, where they are and everything ever done to them.'),
      modules: ['assets'],
      note: t('home.groups.things.note', 'Covers the first 10, then from €1.20 each — cheaper the more you have.'),
    },
    {
      key: 'plan',
      icon: <KanbanSquare className="h-4 w-4" />,
      title: t('home.groups.plan.title', 'Run bigger projects'),
      body: t('home.groups.plan.body', 'Break long jobs into stages, sequence them, and add the fields your trade actually needs.'),
      modules: ['phases', 'epics', 'sprints', 'story_points', 'subtasks', 'dependencies', 'custom_fields'],
    },
    {
      key: 'office',
      icon: <Receipt className="h-4 w-4" />,
      title: t('home.groups.office.title', 'Handle the office side'),
      body: t('home.groups.office.body', 'Invoices from finished work, jobs that repeat themselves, rotas, and a record of who changed what.'),
      modules: [],
      note: t('home.groups.office.note', 'Bought once for the company, not per space.'),
    },
  ];

  const OFFICE_ADDONS = ['invoicing', 'recurring', 'shift_scheduling', 'audit_log'];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {GROUPS.map((g) => {
        const isOffice = g.key === 'office';
        const items = isOffice
          ? AVAILABLE_ADD_ONS.filter((a) => OFFICE_ADDONS.includes(a.key)).map((a) => ({
              key: a.key,
              label: t(`addOns.${a.key}.label`, a.label),
              cents: a.monthlyCents,
            }))
          : g.modules.map((k) => ({ key: k, label: t(`modules.${k}.label`, k), cents: price(k) }));
        const from = isOffice ? Math.min(...items.map((i) => i.cents)) : sum(g.modules);

        return (
          <div key={g.key} className="flex flex-col rounded-2xl border border-foreground/[0.10] p-6">
            <span
              className="flex size-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${ACCENT}1f`, color: ACCENT }}
            >
              {g.icon}
            </span>
            <h3 className={`${DISPLAY} mt-4 text-[19px] leading-snug tracking-[-0.01em] text-foreground`}>{g.title}</h3>
            <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-foreground/50">{g.body}</p>

            {/* The one number for the whole capability, not seven of them. */}
            <p className={`${MONO} mt-5 text-[13px] text-foreground [font-variant-numeric:tabular-nums]`}>
              <span style={{ color: ACCENT }}>
                {isOffice
                  ? t('home.groups.from', 'from {{price}}', { price: formatCents(from) })
                  : formatCents(from)}
              </span>
              <span className="text-foreground/40"> {t('home.groups.perSpace', '/ space / month')}</span>
            </p>

            {g.note && <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/35">{g.note}</p>}

            {/* The arithmetic, for anybody who wants to check it. */}
            <p className="mt-3 border-t border-foreground/[0.07] pt-3 text-[11.5px] leading-relaxed text-foreground/30">
              {items.map((i, n) => (
                <span key={i.key}>
                  {n > 0 && ' · '}
                  {i.label} {formatCents(i.cents)}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}
