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
import { ChatService } from '../../services/chat.service';
import { User } from '../../models/user.model';
import { SearchService } from '../../services/search.service';
import { SearchHeaderComponent } from '../search/search-header/search-header.component';
import { SearchResultsComponent } from '../search/search-results/search-results.component';

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
    SearchHeaderComponent,
    SearchResultsComponent
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
        this.updateInputFormClass();
      }, 0);
    }
  }

  isSearchVisible = false;

  constructor(
    private adsService: AdsService,
    private _authService: AuthService,
    private renderer: Renderer2,
    private el: ElementRef,
    public chatService: ChatService,
    private searchService: SearchService
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

    this.chatService.threadVisibleObservable.subscribe(() => {
      setTimeout(() => {
        this.updateInputFormClass();
        this.updateLayoutClasses();
      }, 0);
    });

    this.searchService.searchVisibleObservable.subscribe(
      visible => this.isSearchVisible = visible
    );
  }

  onInputHeightChanged() {
    this.updateInputBottomOffset();
  }

  updateInputBottomOffset() {
    let inputForm = document.getElementById('inputForm');
    let h = inputForm?.clientHeight;
    this.renderer.setStyle(this.el.nativeElement, '--input-height', `${h}px`, RendererStyleFlags2.DashCase);
  }

  private updateInputFormClass() {
    const inputForm = document.getElementById('inputForm');
    if (inputForm) {
      if (this.chatService.isThreadVisible()) {
        inputForm.classList.add('with-thread');
      } else {
        inputForm.classList.remove('with-thread');
      }
    }
  }

  private updateLayoutClasses() {
    const chatColumn = document.querySelector('.chat-column');
    const adColumn = document.querySelector('.ad-column');

    if (chatColumn) {
      if (this.chatService.isThreadVisible()) {
        chatColumn.classList.add('with-thread');
      } else {
        chatColumn.classList.remove('with-thread');
      }
    }

    if (adColumn) {
      if (this.chatService.isThreadVisible()) {
        adColumn.classList.add('with-thread');
      } else {
        adColumn.classList.remove('with-thread');
      }
    }
  }
}