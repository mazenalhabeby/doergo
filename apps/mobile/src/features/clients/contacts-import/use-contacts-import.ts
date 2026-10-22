import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  CONTACT_IMPORT_MAX,
  buildContactImport,
  pickModel,
  prepareContacts,
  type ClassifiedContact,
  type ContactImportSummary,
  type PhoneContact,
  type PickFilter,
} from '@hbcfield/shared/client';
import { customersApi } from '../../../lib/api';
import { hashMatchKeys, readPhoneContacts } from '../../../lib/phone-contacts';
import { uuidv7 } from '../../../offline/ids';

export type ImportStep = 'explain' | 'pick' | 'review' | 'done';

export interface ImportFields {
  email: boolean;
  phone: boolean;
  role: boolean;
}

/**
 * Everything the contacts import KNOWS, apart from how it is drawn.
 *
 * ⚠️ THE ADDRESS BOOK NEVER LEAVES THIS HOOK except as the import body, and
 * then only the people ticked and the fields switched on. The "already a
 * client" marks come from hashing this phone's keys against the hashes the
 * server sent — the comparison is local.
 *
 * Performance is decided here, not in the rows:
 *   · the book is read ONCE, with four fields, and classified ONCE;
 *   · the search is deferred, so typing never waits on the list;
 *   · the client marks arrive after the list is already on screen.
 */
export function useContactsImport(opts: { organizationId: string | null; granted: boolean }) {
  const [raw, setRaw] = useState<PhoneContact[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  /** This phone's keys that ARE a client's. null = not known (offline, or still hashing). */
  const [clientKeys, setClientKeys] = useState<Set<string> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<PickFilter>('suggested');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [fields, setFields] = useState<ImportFields>({ email: true, phone: true, role: true });
  const [fillMissing, setFillMissing] = useState(true);
  const [result, setResult] = useState<ContactImportSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const contacts = useMemo(() => (raw ? prepareContacts(raw) : []), [raw]);
  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Read the book once access is granted.
  useEffect(() => {
    if (!opts.granted || raw) return;
    let alive = true;
    readPhoneContacts()
      .then((r) => { if (alive) setRaw(r); })
      .catch(() => { if (alive) setReadFailed(true); });
    return () => { alive = false; };
  }, [opts.granted, raw]);

  const refreshClientKeys = useCallback(async (list: ClassifiedContact[]) => {
    if (!opts.organizationId || !list.length) return;
    try {
      const { hashes, complete } = await customersApi.matchKeys();
      // A partial list cannot say "not a client" — show no marks rather than wrong ones.
      if (!complete) return;
      const server = new Set(hashes);
      const keys = Array.from(new Set(list.flatMap((c) => c.keys)));
      const local = await hashMatchKeys(opts.organizationId, keys);
      setClientKeys(new Set(keys.filter((k) => server.has(local.get(k)!))));
    } catch {
      // Offline or refused: no marks. The server still checks every import.
    }
  }, [opts.organizationId]);

  useEffect(() => { void refreshClientKeys(contacts); }, [contacts, refreshClientKeys]);

  const isClient = useCallback((c: ClassifiedContact) => !!clientKeys && c.keys.some((k) => clientKeys.has(k)), [clientKeys]);

  const model = useMemo(
    () => pickModel(contacts, { filter, query: deferredQuery, isClient }),
    [contacts, filter, deferredQuery, isClient],
  );

  /** Tick or untick one row — a company takes the people under it along. */
  const toggle = useCallback((id: string, members?: string[]) => {
    setPicked((prev) => {
      const next = new Set(prev);
      const on = !prev.has(id);
      for (const x of [id, ...(members ?? [])]) {
        if (on) next.add(x);
        else next.delete(x);
      }
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const x of ids) {
        if (on) next.add(x);
        else next.delete(x);
      }
      return next;
    });
  }, []);

  const pickedContacts = useMemo(
    () => Array.from(picked).map((id) => byId.get(id)).filter((c): c is ClassifiedContact => !!c),
    [picked, byId],
  );

  const summary = useMemo(() => {
    const pickedCompanies = new Set(pickedContacts.filter((c) => c.kind === 'COMPANY' && c.groupKey).map((c) => c.groupKey!));
    let companies = 0, people = 0, privateCount = 0, existing = 0, contactPeople = 0, fresh = 0;
    const freshNames: string[] = [];
    for (const c of pickedContacts) {
      if (c.kind === 'COMPANY') companies++;
      else people++;
      if (isClient(c)) { existing++; continue; }
      if (c.signal === 'private') privateCount++;
      if (c.kind === 'PERSON' && c.groupKey && pickedCompanies.has(c.groupKey)) contactPeople++;
      else { fresh++; freshNames.push(c.name); }
    }
    return { total: pickedContacts.length, companies, people, privateCount, existing, contactPeople, fresh, freshNames };
  }, [pickedContacts, isClient]);

  const tooMany = pickedContacts.length > CONTACT_IMPORT_MAX;

  const runImport = useCallback(async (spaceId: string) => {
    setImporting(true);
    try {
      const items = buildContactImport(pickedContacts, {
        newRef: () => uuidv7(),
        fields,
        fillMissing: (c) => fillMissing && isClient(c),
      });
      const r = await customersApi.importContacts({ spaceId, items });
      setResult(r);
      return r;
    } finally {
      setImporting(false);
    }
  }, [pickedContacts, fields, fillMissing, isClient]);

  /** Back to the list for another round: nothing ticked, client marks re-read. */
  const again = useCallback(() => {
    setPicked(new Set());
    setResult(null);
    void refreshClientKeys(contacts);
  }, [contacts, refreshClientKeys]);

  return {
    loading: opts.granted && !raw && !readFailed,
    readFailed,
    total: contacts.length,
    model,
    filter, setFilter,
    query, setQuery,
    picked, toggle, setMany,
    isClient,
    summary, tooMany,
    fields, setFields,
    fillMissing, setFillMissing,
    runImport, importing, result, again,
  };
}
