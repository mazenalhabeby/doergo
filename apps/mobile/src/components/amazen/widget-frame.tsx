import React from 'react';

/**
 * The boundary that keeps a widget from taking the screen down with it.
 *
 * ⚠️ EACH WIDGET FAILS ALONE. `offline/tasks/list-failure.ts` is the model and
 * three of its four branches are non-fatal: a refusal is fatal, an unreachable
 * network with something already on screen is not, and a cold start that has
 * not opened the phone's database yet is not — declaring somebody offline a
 * few hundred milliseconds before their own data arrives is how a phone with
 * full signal shows an error a Retry button then clears.
 *
 * ⚠️ AN EMPTY STATE IS A DECISION, NOT AN ABSENCE. Every widget says which of
 * the three it is, in its own registry row or its own component:
 *
 *   hidden      — normal, nothing to report (documents, next job)
 *   invitation  — there is something here but it has not been set up
 *                 (stops with no plan → "Plan the route")
 *   all-clear   — the answer is genuinely "nothing, and that is good"
 *                 (a calm crew)
 */
export class WidgetBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) {
    /*
      The widget is out; the screen is not — and in development it SAYS SO.

      ⚠️ A SILENT `catch` HERE COSTS HOURS. The fallback is usually `null`, so
      a widget that throws simply is not drawn: the column renders with a gap,
      or with nothing at all, and there is no error anywhere to explain it. In
      production that is exactly right — a member does not need a stack trace
      about a card they cannot fix. In development it is the difference between
      a one-line answer and bisecting the whole home screen.
    */
    if (__DEV__) console.error('[widget] threw and was removed from the column:', error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
