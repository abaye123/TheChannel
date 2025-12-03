import { Component, OnInit, HostListener } from '@angular/core';
import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { NgIf } from '@angular/common';
import { NbCardModule, NbLayoutModule } from "@nebular/theme";
import { NotificationsService } from './services/notifications.service';
import { SoundService } from './services/sound.service';
import { GoogleAnalyticsService } from './services/google-analytics.service';
import { VersionService } from './services/version.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    NbLayoutModule,
    NbCardModule,
    NgIf,
  ],
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private hasUserInteracted = false;
  versionInfo: { frontend: string; backend: string } = { frontend: '', backend: '' };

  constructor(
    private notificationsService: NotificationsService,
    private soundService: SoundService,
    private googleAnalyticsService: GoogleAnalyticsService,
    private router: Router,
    private versionService: VersionService,
  ) { }

  ngOnInit(): void {
    this.notificationsService.init();
    this.googleAnalyticsService.init();

    this.versionService.getVersionInfo().subscribe(info => {
      this.versionInfo = info;
    });

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.googleAnalyticsService.trackPageView(event.urlAfterRedirects);
      });
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:keydown', ['$event'])
  async onUserInteraction() {
    if (!this.hasUserInteracted && this.soundService.isEnabled()) {
      this.hasUserInteracted = true;
      await this.soundService.initializeAudioContext();
    }
  }
}
