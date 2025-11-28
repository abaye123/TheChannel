import { Injectable } from '@angular/core';
import { ChatService } from './chat.service';

declare let gtag: Function;

@Injectable({
  providedIn: 'root'
})
export class GoogleAnalyticsService {
  private isInitialized = false;
  private googleAnalyticsId: string = '';

  constructor(private chatService: ChatService) {}

  async init(): Promise<void> {
    try {
      if (!this.chatService.channelInfo) {
        await this.chatService.updateChannelInfo();
      }
      
      const googleAnalyticsId = this.chatService.channelInfo?.google_analytics_id;
      
      if (googleAnalyticsId && googleAnalyticsId.trim() !== '') {
        this.googleAnalyticsId = googleAnalyticsId;
        await this.loadGoogleAnalytics();
        this.isInitialized = true;
        console.log('Google Analytics initialized with ID:', this.googleAnalyticsId);
      }
    } catch (error) {
      console.warn('Failed to load Google Analytics config:', error);
    }
  }

  private async loadGoogleAnalytics(): Promise<void> {
    return new Promise((resolve, reject) => {
      const script1 = document.createElement('script');
      script1.async = true;
      script1.src = `https://www.googletagmanager.com/gtag/js?id=${this.googleAnalyticsId}`;
      
      script1.onload = () => {
        const script2 = document.createElement('script');
        script2.innerHTML = `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${this.googleAnalyticsId}', {
            page_title: document.title,
            page_location: window.location.href
          });
        `;
        document.head.appendChild(script2);
        resolve();
      };

      script1.onerror = () => {
        reject(new Error('Failed to load Google Analytics script'));
      };

      document.head.appendChild(script1);
    });
  }

  trackPageView(url?: string, title?: string): void {
    if (this.isInitialized && typeof gtag !== 'undefined') {
      gtag('config', this.googleAnalyticsId, {
        page_path: url || window.location.pathname,
        page_title: title || document.title
      });
    }
  }

  trackEvent(eventName: string, parameters?: any): void {
    if (this.isInitialized && typeof gtag !== 'undefined') {
      gtag('event', eventName, parameters);
    }
  }

  isEnabled(): boolean {
    return this.isInitialized;
  }
}
