import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import i18n from '../i18n';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, RADIUS } from '../lib/constants';
import { checkVersion, type VersionStatus } from '../lib/version-gate';
import { lastKnownVersion } from '../contexts/version-context';
import { openUpdate } from '../lib/in-app-updates';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** A newer version exists — asked for only once something has already broken. */
  update: VersionStatus | null;
}

/**
 * The screen somebody actually sees when the app breaks.
 *
 * ⚠️ IT USED TO PRINT THE EXCEPTION. A member on an old build was shown
 * "Rendered more hooks than during the previous render" — in English, under a
 * German heading, above a button that retried the same broken render. That
 * sentence is React's internal vocabulary; it tells a driver nothing, it cannot
 * be acted on, and it is frightening in the specific way that makes somebody
 * stop using an app.
 *
 * ⚠️ AND THE CAUSE WAS ALMOST ALWAYS "an old copy of the app". Over-the-air
 * updates are pinned to the native build they were made for, so a phone that
 * has not been updated in the store keeps running months-old JavaScript —
 * including bugs fixed long ago. A crash there is not news; it is a version.
 *
 * So the first thing this does after catching is ASK whether a newer version
 * exists, and if one does it says so and offers the update. Only when the app
 * is current does it fall back to "something went wrong", because then it
 * genuinely is something we have not seen.
 *
 * The exception text is kept — small, muted, last — because support has to be
 * able to ask "what does the grey line say". It is no longer the headline.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, update: null };
  }

  /** Kept so a late-arriving version answer cannot setState on a dead tree. */
  private alive = true;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack);

    /*
      Asked HERE and not on mount. A version check on every launch is a request
      nobody needed; a version check the moment something broke is the one
      question most likely to explain it.

      Every failure path leaves `update` null and the generic screen standing —
      a boundary that throws while rendering the boundary has nowhere left to go.
    */
    /*
      The answer the app already has, first.

      `VersionProvider` checks on launch and on every foreground, and keeps the
      result at module scope precisely so this can read it — instantly, and
      without a request, on a screen that has already failed once. A spinner
      here would be the second thing to go wrong in a row.
    */
    const known = lastKnownVersion();
    if (known?.updateAvailable) {
      this.setState({ update: known });
      return;
    }
    // Nothing known yet — the crash happened before the first check landed, or
    // the provider never mounted. Ask once. Every failure path leaves the
    // generic screen standing.
    if (known) return;
    checkVersion()
      .then((status) => {
        if (this.alive && status.updateAvailable) this.setState({ update: status });
      })
      .catch(() => {});
  }

  componentWillUnmount() {
    this.alive = false;
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, update: null });
  };

  handleUpdate = () => {
    void openUpdate(this.state.update?.downloadUrl ?? null);
  };

  render() {
    if (this.state.hasError) {
      const { update, error } = this.state;
      const canUpdate = !!update?.downloadUrl;

      return (
        <View style={s.container}>
          {/*
            The icon carries the whole difference in tone. An outdated app is
            not an alarm — it is an errand, and a red triangle over "please
            update" tells somebody their phone is broken when it is not.
          */}
          <Ionicons
            name={canUpdate ? 'arrow-down-circle-outline' : 'warning-outline'}
            size={48}
            color={canUpdate ? COLORS.primary : COLORS.error}
          />

          <Text style={s.title}>
            {canUpdate
              ? i18n.t('errors.outdatedTitle')
              : i18n.t('errors.somethingWentWrong')}
          </Text>

          <Text style={s.message}>
            {canUpdate
              ? i18n.t('errors.outdatedBody', { version: update!.latest ?? '' })
              : i18n.t('errors.unexpectedError')}
          </Text>

          {canUpdate ? (
            <>
              <TouchableOpacity style={s.button} onPress={this.handleUpdate} activeOpacity={0.8}>
                <Text style={s.buttonText}>{i18n.t('errors.updateNow')}</Text>
              </TouchableOpacity>
              {/*
                Still offered, quietly. The update is a trip to the store and
                somebody in a van may need the screen back first — refusing them
                that because we would rather they updated is not our call.
              */}
              <TouchableOpacity style={s.secondary} onPress={this.handleReset} activeOpacity={0.8}>
                <Text style={s.secondaryText}>{i18n.t('errors.tryAgain')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.button} onPress={this.handleReset} activeOpacity={0.8}>
              <Text style={s.buttonText}>{i18n.t('errors.tryAgain')}</Text>
            </TouchableOpacity>
          )}

          {/*
            The exception, kept but demoted. Support has to be able to ask "what
            does the grey line say"; a member should not have to read React's
            internal vocabulary to find the button.
          */}
          {!!error?.message && <Text style={s.detail} numberOfLines={3}>{error.message}</Text>}
        </View>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    backgroundColor: '#0c0c14',
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: '#f0f0f8',
    marginTop: SPACING.lg,
  },
  message: {
    fontSize: FONT_SIZE.base,
    color: '#9898b0',
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 22,
  },
  button: {
    marginTop: SPACING.xxl,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.md,
  },
  buttonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.white,
  },
  secondary: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  secondaryText: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    color: '#9898b0',
  },
  detail: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: SPACING.xxl,
    right: SPACING.xxl,
    fontSize: FONT_SIZE.xs,
    color: '#5a5a70',
    textAlign: 'center',
  },
});
