import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { NgIf } from "@angular/common";
import { AuthService, User } from "../../../services/auth.service";
import {
  NbButtonModule,
  NbContextMenuModule,
  NbDialogService,
  NbIconModule,
  NbMenuItem,
  NbMenuService,
  NbToastrService,
  NbUserModule
} from "@nebular/theme";
import { InputFormComponent } from "../input-form/input-form.component";
import { Channel } from "../../../models/channel.model";
import { filter } from "rxjs";
import { ChatService } from '../../../services/chat.service';
import { ChannelInfoFormComponent } from '../channel-info-form/channel-info-form.component';
import Viewer from 'viewerjs';
import { UsersComponent } from '../../admin/users/users.component';
import { Router } from '@angular/router';
import { NotificationsService } from '../../../services/notifications.service';

@Component({
  selector: 'app-channel-header',
  imports: [
    NgIf,
    NbButtonModule,
    NbIconModule,
    NbUserModule,
    NbContextMenuModule
  ],
  templateUrl: './channel-header.component.html',
  styleUrl: './channel-header.component.scss'
})
export class ChannelHeaderComponent implements OnInit {

  @Input()
  set userInfo(user: User | undefined) {
    this._userInfo = user;
    this.userMenu = [
      ...(user?.isAdmin ? [{
        title: 'ערוך פרטי ערוץ',
        icon: 'edit-2-outline',
      },
      {
        title: 'ניהול משתמשים',
        icon: 'people-outline',

      }] : []),
      {
        title: 'התנתק',
        icon: 'log-out',
      }
    ];
  }
  get userInfo() {
    return this._userInfo;
  }
  private _userInfo?: User;

  @Output()
  userInfoChange: EventEmitter<User> = new EventEmitter<User>();

  userMenuTag = 'user-menu';
  userMenu: NbMenuItem[] = [];

  constructor(
    private chatService: ChatService,
    private _authService: AuthService,
    private dialogService: NbDialogService,
    private contextMenuService: NbMenuService,
    private toastrService: NbToastrService,
    private router: Router,
    public notificationsService: NotificationsService
  ) {
  }

  channel?: Channel;

  ngOnInit() {
    this.chatService.getChannelInfo().subscribe(channel => {
      this.channel = channel;
      if (this.channel.logoUrl === "") {
        this.channel.logoUrl = "/assets/favicon.ico";
      }
    });

    this.contextMenuService.onItemClick()
      .pipe(filter(({ tag }) => tag === this.userMenuTag))
      .subscribe(value => {
        switch (value.item.icon) {
          case 'log-out':
            this.logout();
            break;
          case 'edit-2-outline':
            this.openChannelEditerDialog();
            break;
          case 'people-outline':
            this.openUsersManagementDialog();
            break;
        }
      });
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

    } else {
      this.toastrService.danger("", "שגיאה בהתנתקות");
    }
  }

  openMessageFormDialog() {
    this.dialogService.open(InputFormComponent, { closeOnBackdropClick: false })
  }

  openChannelEditerDialog() {
    this.dialogService.open(ChannelInfoFormComponent, { closeOnBackdropClick: true, context: { channel: this.channel } });
  }

  openUsersManagementDialog() {
    this.dialogService.open(UsersComponent, { closeOnBackdropClick: true });
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
}
