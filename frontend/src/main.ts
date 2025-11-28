/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from "@sentry/angular";
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

Sentry.init({
  dsn: environment.sentry.dsn,
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: environment.sentry.tracesSampleRate,
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: environment.sentry.replaysSessionSampleRate,
  replaysOnErrorSampleRate: environment.sentry.replaysOnErrorSampleRate,
  // Enable sending logs to Sentry
  enableLogs: environment.sentry.enableLogs
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
