import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    ...sentryOptions,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
