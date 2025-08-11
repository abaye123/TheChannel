import { Component, ElementRef, OnInit, Renderer2, RendererStyleFlags2, ViewChild } from '@angular/core';
import { AdvertisingComponent } from "./advertising/advertising.component";
import { CommonModule } from '@angular/common';
import { Ad, AdsService } from '../../services/ads.service';
import {
  NbButtonModule,
  NbIconModule,
  NbLayoutModule,
  NbListModule,
  NbMenuModule,
  NbSidebarModule,
} from "@nebular/theme";
import { InputFormComponent } from "./chat/input-form/input-form.component";
import { AuthService } from "../../services/auth.service";
import { ChannelHeaderComponent } from "./channel-header/channel-header.component";
import { ChatComponent } from "./chat/chat.component";
import { User } from '../../models/user.model';

@Component({
  selector: 'app-channel',
  imports: [
    AdvertisingComponent,
    CommonModule,
    NbLayoutModule,
    InputFormComponent,
    ChannelHeaderComponent,
    NbButtonModule,
    NbIconModule,
    NbMenuModule,
    NbSidebarModule,
    NbListModule,
    ChatComponent,
  ],
  templateUrl: './channel.component.html',
  styleUrl: './channel.component.scss'
})
export class ChannelComponent implements OnInit {

  @ViewChild('inputForm', { static: false })
  set inputForm(element: ElementRef) {
    if (element) {
      setTimeout(() => {
        this.updateInputBottomOffset();
      }, 0);
    }
  }

  constructor(
    private adsService: AdsService,
    private _authService: AuthService,
    private renderer: Renderer2,
    private el: ElementRef
  ) { }


  ad: Ad = { src: '', width: 0 };
  userInfo?: User;

  ngOnInit(): void {
    this.adsService.getAds().then(ad => {
      this.ad = ad;
    });
    this._authService.loadUserInfo().then(res => {
      this.userInfo = res
    });
  }

  onInputHeightChanged() {
    this.updateInputBottomOffset();
  }

  updateInputBottomOffset() {
    let inputForm = document.getElementById('inputForm');
    let h = inputForm?.clientHeight;
    this.renderer.setStyle(this.el.nativeElement, '--input-height', `${h}px`, RendererStyleFlags2.DashCase);
  }
}
