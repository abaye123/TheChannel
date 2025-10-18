import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { NgIf } from "@angular/common";
import {
  NbButtonModule,
  NbContextMenuModule, NbDialogService,
  NbIconModule,
  NbMenuItem,
  NbMenuService,
  NbToastrService,
  NbUserModule
} from "@nebular/theme";
import { filter } from "rxjs";
import Viewer from 'viewerjs';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { AuthService } from '../../../services/auth.service';
import { ChatService } from '../../../services/chat.service';
import { NotificationsService } from '../../../services/notifications.service';
import { SoundService } from '../../../services/sound.service';
import { AdminPanelComponent } from "../../admin/admin-panel.component";
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-channel-header',
  imports: [
    NgIf,
    NbButtonModule,
    NbIconModule,
    NbUserModule,
    NbContextMenuModule,
  ],
  templateUrl: './channel-header.component.html',
  styleUrl: './channel-header.component.scss'
})
export class ChannelHeaderComponent implements OnInit {

  @Input()
  set userInfo(user: User | undefined) {
    this._userInfo = user;
    this.updateUserMenu();
  }

  get userInfo() {
    return this._userInfo;
  }

  private _userInfo?: User;

  @Output()
  userInfoChange: EventEmitter<User> = new EventEmitter<User>();

  userMenuTag = 'user-menu';
  userMenu: NbMenuItem[] = [];
  isSmallScreen = false;

  constructor(
    public chatService: ChatService,
    public _authService: AuthService,
    private contextMenuService: NbMenuService,
    private toastrService: NbToastrService,
    private router: Router,
    public notificationsService: NotificationsService,
    private titleService: Title,
    public soundService: SoundService,
    private dialogService: NbDialogService,
  ) {
  }

  @HostListener('window:resize')
  onResize() {
    this.updateScreenSize();
    this.updateUserMenu();
  }

  ngOnInit() {
    this.chatService.updateChannelInfo()
      .then(() => this.titleService.setTitle(this.chatService.channelInfo?.name || 'TheChannel'));

    this.contextMenuService.onItemClick()
      .pipe(filter(({ tag }) => tag === this.userMenuTag))
      .subscribe(value => {
        this.handleMenuClick(value.item);
      });

    this.updateScreenSize();
    this.updateUserMenu();
  }

  private updateUserMenu() {
    const user = this._userInfo;
    const baseMenu: NbMenuItem[] = [];

    // במובייל - הוסף את כל הכפתורים לתפריט (מלבד חיפוש שתמיד נראה)
    if (this.isSmallScreen && user) {
      // כפתור צליל
      baseMenu.push({
        title: this.soundService.isEnabled() ? 'השתק צלילים' : 'הפעל צלילים',
        icon: this.soundService.isEnabled() ? 'volume-up' : 'volume-off',
        data: { action: 'toggle-sound' }
      });

      // כפתור התראות
      if (this.notificationsService.initialized) {
        baseMenu.push({
          title: 'הגדרות התראות',
          icon: 'bell',
          data: { action: 'notifications' }
        });
      }

      // כפתור צור קשר
      if (this.chatService.channelInfo?.contact_us) {
        baseMenu.push({
          title: 'צור קשר',
          icon: 'email-outline',
          data: { action: 'contact-us' }
        });
      }

      // מפריד
      if (baseMenu.length > 0) {
        baseMenu.push({
          title: '',
          icon: '',
          data: { separator: true }
        });
      }
    }

    // ניהול ערוץ (רק למנהלים/מודים)
    if (user?.privileges?.['admin'] || user?.privileges?.['moderator']) {
      baseMenu.push({
        title: 'ניהול ערוץ',
        icon: 'people-outline',
        data: { action: 'admin' }
      });
    }

    // התנתק
    if (user) {
      baseMenu.push({
        title: 'התנתק',
        icon: 'log-out',
        data: { action: 'logout' }
      });
    }

    this.userMenu = baseMenu;
  }

  private handleMenuClick(item: NbMenuItem) {
    const action = item.data?.action;

    switch (action) {
      case 'logout':
        this.logout();
        break;
      case 'admin':
        this.dialogService.open(AdminPanelComponent, { closeOnBackdropClick: true });
        break;
      case 'toggle-sound':
        this.toggleSound();
        this.updateUserMenu(); // עדכן את התפריט אחרי שינוי
        break;
      case 'notifications':
        this.notificationsService.requestPermission();
        break;
      case 'contact-us':
        this.openContactUs();
        break;
    }
  }

  googleLogin() {
    this._authService.loginWithGoogle();
  }

  async logout() {
    if (await this._authService.logout()) {
      this.userInfo = undefined;
      this.userInfoChange.emit(undefined);
      try {
        await this._authService.loadUserInfo();
      } catch (err: any) {
        if (err.status === 401) {
          this.router.navigate(['/login']);
        }
      }

      const path = this.router.url;
      if (path !== '/') {
        this.router.navigate(['/']);
      }

    } else {
      this.toastrService.danger("", "שגיאה בהתנתקות");
    }
  }

  private v!: Viewer;

  viewLargeImage(event: MouseEvent) {
    const target = event.target as HTMLImageElement;
    if (target.tagName === 'IMG') {
      if (!this.v) {
        this.v = new Viewer(target, {
          toolbar: false,
          transition: true,
          navbar: false,
          title: false
        });
      }
      this.v.show();
    }
  }

  updateScreenSize() {
    this.isSmallScreen = window.innerWidth < 768;
  }

  async toggleSound() {
    if (this.soundService.isEnabled()) {
      this.soundService.disableSound();
      this.toastrService.success("", "צלילי התראה הושתקו");
    } else {
      this.soundService.enableSound();

      if (!this.soundService.isInitialized()) {
        await this.soundService.initializeAudioContext();
      }

      this.toastrService.success("", "צלילי התראה הופעלו");
      this.soundService.playNotificationSound();
    }
  }

  openContactUs() {
    window.open(this.chatService.channelInfo?.contact_us, '_blank');
  }

  openSearch() {
    // TODO: פתח את תיבת החיפוש
    // כאן נוסיף לוגיקה לפתיחת קומפוננט החיפוש
    console.log('פתיחת חיפוש');
    this.toastrService.info("", "חיפוש - בקרוב");
  }
}