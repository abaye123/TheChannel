import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { ChatComponent } from "./chat/chat.component";
import { AdvertisingComponent } from "./advertising/advertising.component";
import { CommonModule } from '@angular/common';
import { Ad, AdsService } from '../../services/ads.service';
@Component({
  selector: 'app-channel',
  imports: [
    ChatComponent,
    AdvertisingComponent,
    CommonModule,
  ],
  templateUrl: './channel.component.html',
  styleUrl: './channel.component.scss'
})
export class ChannelComponent implements OnInit {

  @ViewChild('container', { static: false }) containerRef!: ElementRef<HTMLDivElement>;

  @HostListener('window:resize')
  onResize() {
    this.updateChatWidth();
  }

  constructor(
    private adsService: AdsService,
  ) { }

  advertisingWidth = 0;
  chatWidth: number = 0;
  ads: Ad = { src: '', width: 0 };

  ngOnInit(): void {
    this.adsService.getAds()
      .then(ad => {
        this.ads = ad
        this.advertisingWidth = ad.width;
      }).then(() => this.updateChatWidth());
    setTimeout(() => {
      this.updateChatWidth();
    }, 200);
  }

  updateChatWidth() {
    const containerWidth = this.containerRef.nativeElement.clientWidth;
    this.chatWidth = this.isScreenSmall() ? containerWidth : containerWidth - this.advertisingWidth - 20;
  }

  isScreenSmall(): boolean {
    return window.innerWidth < 768;
  }
}
