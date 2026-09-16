import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BlurSheet } from '../blur-sheet';
import { SheetPanel } from '../sheet-panel';
import { Skeleton } from '../skeleton';
import { ChoiceChip } from './client-fields';
import { ClientPicker } from './client-picker';
import { customersApi, type MobileCustomer } from '../../lib/api';
import { useTheme } from '../../contexts/theme-context';
import { SPACING, FONT_SIZE, type ThemeColors } from '../../lib/constants';
import { duplicateSearchTerm, looksLikeSameClient, type CardDestination } from './card-review';

/**
 * WHERE DOES THIS PERSON GO?
 *
 * The question the scanner never asked. A person's card is usually a person AT
 * a company, and until now the only thing the scanner could do with one was
 * create a second client beside the company — or, if a company name was read,
 * file the person as a line of text in `contactName` where nothing can ever
 * reach them again.
 *
 * Three exits, and the first is the common one:
 *
 *  · the company the reader found, IF it is already in the book;
 *  · any other company, through the same search;
 *  · a client in their own right, which is what the screen did before.
 *
 * ⚠️ "Create the company from this card" is NOT on offer, and must not be
 * added. One line's spelling is how "BILLA" and "BILLA AG" become two clients
 * in the same book — the contact sheet hides the same toggle for the same
 * reason, and the CRM ladder bills per client.
 *
 * ⚠️ The DEFAULT stays "a client in their own right". The suggestion is a chip,
 * not a pre-selection: defaulting to a company means a card whose employer is
 * not in the book opens on a choice that cannot be completed, and a dead end on
 * the review screen costs the whole scan.
 */
export function CardDestinationPicker({
  /** What the reader read as the company. '' when it found none. */
  companyGuess,
  destination,
  company,
  onChange,
}: {
  companyGuess: string;
  destination: CardDestination;
  company: MobileCustomer | null;
  onChange: (destination: CardDestination, company: MobileCustomer | null) => void;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => styles(colors), [colors]);
  const { t } = useTranslation();

  const [suggested, setSuggested] = useState<MobileCustomer | null>(null);
  const [looking, setLooking] = useState(false);
  const [sheet, setSheet] = useState(false);

  /*
    ONE lookup, when the review opens, for the company the reader named.

    ⚠️ The reader's strongest free signal is the email's domain — `a.gruber@
    siemens.com` names the employer — and `parseBusinessCard` tries exactly that
    before anything else, so `company` already IS the domain-derived answer when
    there was one, and is a legal-form line otherwise. Searching it here turns
    "we think they work at Siemens" into "Siemens AG is in your book, one tap".

    ⚠️ Offline this throws and the suggestion is simply absent. That is the
    right failure: the other two exits still work, and the save itself queues.

    ⚠️ Not on every keystroke, and not on every render — the member may correct
    the company name while this is on screen, and re-searching would make the
    suggestion flicker under a choice they have already made. Once per time the
    question is asked, which is what the ref means: flipping back to a company's
    card and returning does ask again, deliberately, because by then the name it
    searches may be one the member has fixed.
  */
  const asked = useRef(false);
  useEffect(() => {
    const guess = companyGuess.trim();
    if (!guess || asked.current) return;
    asked.current = true;
    let live = true;
    setLooking(true);
    void (async () => {
      try {
        const rows = await customersApi.list({
          search: duplicateSearchTerm(guess),
          limit: 5,
          // Every client, whatever its type says: a real book files firms as
          // PERSON, so asking for companies only would hide the match.
          contacts: 'all',
          portalResident: false,
        });
        if (!live) return;
        setSuggested(rows.find((r) => looksLikeSameClient(r.name, guess)) ?? null);
      } catch {
        if (live) setSuggested(null);
      } finally {
        if (live) setLooking(false);
      }
    })();
    return () => { live = false; };
  }, [companyGuess]);

  const chooseSuggested = useCallback(() => {
    if (suggested) onChange('contact', suggested);
  }, [onChange, suggested]);

  const chooseStandalone = useCallback(() => onChange('client', null), [onChange]);

  const pickFromSheet = useCallback(
    (picked: MobileCustomer) => {
      onChange('contact', picked);
      setSheet(false);
    },
    [onChange],
  );

  const onSuggested = destination === 'contact' && !!suggested && company?.id === suggested.id;
  const onOther = destination === 'contact' && !onSuggested;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{t('scan.whereGoes')}</Text>

      {looking ? (
        <Skeleton.Line width="60%" height={30} style={{ marginTop: SPACING.sm }} />
      ) : (
        <View style={s.chips}>
          {!!suggested && (
            <ChoiceChip
              label={t('scan.contactAt', { name: suggested.name })}
              selected={onSuggested}
              onPress={chooseSuggested}
            />
          )}
          <ChoiceChip
            /* The same picker, unfiltered — and the only wording change is
               whether a suggestion is already sitting next to it. */
            label={
              onOther && company
                ? t('scan.contactAt', { name: company.name })
                : t(suggested ? 'scan.contactAtOther' : 'scan.contactAtSearch')
            }
            selected={onOther}
            onPress={() => setSheet(true)}
          />
          <ChoiceChip
            label={t('scan.ownRight')}
            selected={destination === 'client'}
            onPress={chooseStandalone}
          />
        </View>
      )}

      <Text style={s.hint}>
        {destination === 'contact' ? t('scan.contactExplain') : t('scan.ownRightExplain')}
      </Text>

      <BlurSheet visible={sheet} onClose={() => setSheet(false)}>
        <SheetPanel title={t('scan.chooseCompany')} onClose={() => setSheet(false)}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ClientPicker
              kind="COMPANY"
              /* Nothing to exclude: the scanner opens from no record, so there
                 is no "itself" to keep out of the results. */
              excludeId=""
              selectedId={company?.id ?? null}
              onSelect={pickFromSheet}
              includeOtherKind
              initialSearch={companyGuess.trim()}
            />
            <View style={{ height: SPACING.xl }} />
          </ScrollView>
        </SheetPanel>
      </BlurSheet>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginTop: SPACING.xl },
    title: {
      fontSize: FONT_SIZE.sm,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    // Wrapping, not a scrolling row: a company's name makes a chip as wide as
    // the screen, and a name half off the edge is a choice nobody can read.
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
    hint: { fontSize: FONT_SIZE.sm, color: c.textMuted, marginTop: SPACING.sm, lineHeight: 18 },
  });
