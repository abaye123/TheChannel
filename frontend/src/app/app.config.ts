import { APP_INITIALIZER, ApplicationConfig, ErrorHandler, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import * as Sentry from "@sentry/angular";
import { routes } from './app.routes';
import {
  NbDialogModule,
  NbGlobalLogicalPosition,
  NbIconModule,
  NbLayoutDirection,
  NbMenuModule,
  NbSidebarModule,
  NbThemeModule,
  NbToastrModule
} from "@nebular/theme";
import { provideAnimationsAsync } from "@angular/platform-browser/animations/async";
import { NbEvaIconsModule } from "@nebular/eva-icons";
import { provideMarkdown } from "ngx-markdown";
import { MarkdownConfig } from "./markdown.config";
import { NgIconsModule, provideIcons } from "@ng-icons/core"; // Import NgIconsModule and provideIcons
import {
  heroBold,
  heroCheck,
  heroCodeBracket,
  heroItalic,
  heroPaperAirplane,
  heroPaperClip,
  heroQuestionMarkCircle,
  heroUnderline,
  heroXMark
} from "@ng-icons/heroicons/outline";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes), // withHashLocation()
    provideHttpClient(),
    provideAnimationsAsync(),
    provideMarkdown(MarkdownConfig),
    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler(),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [Sentry.TraceService],
      multi: true,
    },
    provideIcons({
      heroBold,
      heroItalic,
      heroUnderline,
      heroCodeBracket,
      heroPaperClip,
      heroQuestionMarkCircle,
      heroPaperAirplane,
      heroCheck,
      heroXMark
    }),
    importProvidersFrom(
      NbThemeModule.forRoot({ name: 'custom' }, undefined, undefined, NbLayoutDirection.RTL),
      NbIconModule,
      NbEvaIconsModule,
      NbMenuModule.forRoot(),
      NbDialogModule.forRoot(),
      NbToastrModule.forRoot({ position: NbGlobalLogicalPosition.TOP_START }),
      NgIconsModule,
      NbSidebarModule.forRoot(),
    )
  ]
};
