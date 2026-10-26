import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { Icon } from '@/components/amazen/ink-icon';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/theme-context';
import { COLORS, SPACING, RADIUS, FONT_SIZE, FONT_WEIGHT } from '../lib/constants';
import { movePage, type Page } from '../lib/page-order';

/**
 * Sheets of paper, added one at a time.
 *
 * Deliberately NOT the scanner. There is no frame to line the sheet up in, no
 * machine-readable zone to read and no expiry to confirm — all of which exist
 * to photograph a licence accurately, and all of which are noise on a hotel
 * invoice. What is left is: add a page, see it went, put them in order.
 *
 * ⚠️ Every sheet shows its own state, because they do not finish together. A
 * page still uploading, and a page that failed, look different from a page that
 * landed — otherwise the member taps Send and waits on something they cannot
 * see, or files an invoice with page four missing and never knows.
 */
export function MultiPageCapture({
  pages,
  onChange,
  onScan,
  onLibrary,
  onFile,
  onRetry,
  disabled,
}: {
  pages: Page[];
  onChange: (next: Page[]) => void;
  /** One sheet through the scanner — framed, deskewed, cropped. */
  onScan: () => void;
  /** Several at once out of the photo library, for paper already photographed. */
  onLibrary: () => void;
  /** A PDF off the phone — most of this paper never was paper. */
  onFile: () => void;
  onRetry: (id: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const remove = (id: string) => onChange(pages.filter((p) => p.id !== id));
  const move = (id: string, delta: -1 | 1) => onChange(movePage(pages, id, delta));
  const failed = pages.filter((p) => p.state === 'failed');

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.head, { color: colors.textMuted }]}>
          {t('documents.pages.count', { count: pages.length })}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {pages.map((page, index) => (
          <View
            key={page.id}
            style={[styles.tile, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            {page.mimeType === 'application/pdf' ? (
              // Nothing to draw: a PDF has no thumbnail until something renders
              // it, and rendering one here to show a 90px square is not worth a
              // native dependency. Its name says more than a grey box would.
              <View style={[styles.thumb, styles.pdf, { backgroundColor: colors.surface }]}>
                <Icon name="file" size={26} color={COLORS.primary} />
                <Text numberOfLines={2} style={[styles.pdfName, { color: colors.textMuted }]}>
                  {page.name ?? 'PDF'}
                </Text>
              </View>
            ) : (
              <Image source={{ uri: page.uri }} style={styles.thumb} resizeMode="cover" />
            )}

            <View style={[styles.badge, { backgroundColor: COLORS.primary }]}>
              <Text style={styles.badgeText}>{index + 1}</Text>
            </View>

            {/* What this sheet is doing, on the sheet itself. */}
            {page.state !== 'ready' && (
              <View style={styles.veil}>
                {page.state === 'failed' ? (
                  <TouchableOpacity
                    onPress={() => onRetry(page.id)}
                    style={styles.retry}
                    accessibilityLabel={t('documents.pages.retry')}
                  >
                    <Icon name="refreshLine" size={18} color="#fff" />
                    <Text style={styles.retryText}>{t('documents.pages.retry')}</Text>
                  </TouchableOpacity>
                ) : (
                  <ActivityIndicator color="#fff" />
                )}
              </View>
            )}

            {!disabled && (
              <TouchableOpacity
                style={styles.remove}
                onPress={() => remove(page.id)}
                accessibilityLabel={t('documents.pages.remove', { n: index + 1 })}
              >
                <Icon name="close" size={13} color="#fff" />
              </TouchableOpacity>
            )}

            {!disabled && pages.length > 1 && (
              <View style={styles.arrows}>
                <TouchableOpacity
                  disabled={index === 0}
                  onPress={() => move(page.id, -1)}
                  style={[styles.arrow, index === 0 && styles.arrowOff]}
                  accessibilityLabel={t('documents.pages.moveLeft')}
                >
                  <Icon name="backLine" size={13} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={index === pages.length - 1}
                  onPress={() => move(page.id, 1)}
                  style={[styles.arrow, index === pages.length - 1 && styles.arrowOff]}
                  accessibilityLabel={t('documents.pages.moveRight')}
                >
                  <Icon name="chevronRight" size={13} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {!disabled && (
          <TouchableOpacity
            style={[styles.tile, styles.add, { borderColor: COLORS.primary }]}
            onPress={onScan}
            accessibilityLabel={t('documents.pages.scan')}
          >
            <Icon name="scanCard" size={24} color={COLORS.primary} />
            <Text style={[styles.addText, { color: COLORS.primary }]}>{t('documents.pages.scan')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/*
        The library, beside the scanner rather than behind a chooser.

        Paper does not always start as paper: a hotel invoice arrives by email
        and is already in Photos. Multi-select means six sheets in one tap
        instead of six trips through a camera that was never needed.
      */}
      {!disabled && (
        <View style={styles.sourceRow}>
          <TouchableOpacity onPress={onLibrary} style={styles.libraryRow}>
            <Icon name="attach" size={16} color={COLORS.primary} />
            <Text style={[styles.libraryText, { color: COLORS.primary }]}>{t('documents.pages.fromLibrary')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onFile} style={styles.libraryRow}>
            <Icon name="file" size={16} color={COLORS.primary} />
            <Text style={[styles.libraryText, { color: COLORS.primary }]}>{t('documents.pages.fromFiles')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/*
        ⚠️ A failed sheet says WHY, above the strip.

        A bare Retry on a thumbnail is the worst possible failure: it offers an
        action that will fail identically, and hides the one sentence that would
        let somebody fix it — the file was too big, the type is not accepted,
        there is no signal. The first version of this screen did exactly that,
        and the answer turned out to be a bug nobody could have guessed from a
        tile.
      */}
      {failed.length > 0 && (
        <View style={[styles.problem, { backgroundColor: colors.errorLight }]}>
          <Icon name="alertLine" size={15} color={COLORS.error} />
          <Text style={[styles.problemText, { color: colors.textPrimary }]}>
            {failed[0].error || t('documents.pages.failedGeneric')}
          </Text>
        </View>
      )}

      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('documents.pages.hint')}</Text>
    </View>
  );
}

const TILE = 92;

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  head: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  strip: { gap: SPACING.sm, paddingVertical: 2 },
  tile: {
    width: TILE,
    height: TILE * 1.33,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: { ...StyleSheet.absoluteFillObject },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  retry: { alignItems: 'center', gap: 2 },
  retryText: { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.semibold },
  badge: {
    position: 'absolute',
    left: 5,
    top: 5,
    minWidth: 19,
    height: 19,
    borderRadius: 6,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrows: { position: 'absolute', bottom: 4, flexDirection: 'row', gap: 4 },
  arrow: {
    width: 22,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowOff: { opacity: 0.3 },
  add: { borderStyle: 'dashed', gap: 3 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, flexWrap: 'wrap' },
  libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  pdf: { justifyContent: 'center', alignItems: 'center', gap: 4, padding: 6 },
  pdfName: { fontSize: 9.5, textAlign: 'center' },
  problem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  problemText: { flex: 1, fontSize: FONT_SIZE.xs, lineHeight: 16 },
  libraryText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  addText: { fontSize: 10.5, fontWeight: FONT_WEIGHT.semibold },
  hint: { fontSize: FONT_SIZE.xs, lineHeight: 16 },
});
