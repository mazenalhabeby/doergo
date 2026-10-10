import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MultiPageCapture } from '../multi-page-capture';
import type { PaperPages } from './use-paper-pages';
import { s, useSupplyPalette } from './styles';

/**
 * Sheets of paper take a different path entirely.
 *
 * No scanner, no frame, no expiry: those exist to photograph a card
 * accurately and are noise on a hotel invoice.
 */
export function PagesSection({ paper, busy }: { paper: PaperPages; busy: boolean }) {
  const { t } = useTranslation();
  const { colors } = useSupplyPalette();
  return (
    <>
      <Text style={[s.eyebrow, { color: colors.textMuted }]}>
        {t('documents.pages.title')}
      </Text>
      <TextInput
        value={paper.pageTitle}
        onChangeText={paper.setPageTitle}
        placeholder={t('documents.pages.titlePlaceholder')}
        placeholderTextColor={colors.textMuted}
        editable={!busy}
        style={[
          s.titleInput,
          { backgroundColor: colors.surfaceRaised, color: colors.textPrimary, borderColor: colors.border },
        ]}
      />
      <Text style={[s.titleHint, { color: colors.textMuted }]}>
        {t('documents.pages.titleHint')}
      </Text>
      <MultiPageCapture
        pages={paper.pages}
        onChange={paper.setPages}
        onScan={paper.scanPage}
        onLibrary={paper.pickPages}
        onFile={paper.pickFile}
        onRetry={paper.retryPage}
        disabled={busy}
      />
    </>
  );
}
