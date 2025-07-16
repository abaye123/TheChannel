import { Component, OnInit } from '@angular/core';
import { ChannelHeaderComponent } from "../../chat/channel-header/channel-header.component";
import { AuthService, User } from '../../../services/auth.service';
import {
  NbLayoutModule,
  NbSidebarModule,
  NbIconModule,
  NbSidebarService,
  NbButtonModule,
  NbMenuModule,
  NbMenuItem
} from "@nebular/theme";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: 'app-admin-area',
  imports: [
    ChannelHeaderComponent,
    NbLayoutModule,
    NbSidebarModule,
    NbIconModule,
    NbButtonModule,
    NbMenuModule,
    RouterOutlet
  ],
  templateUrl: './admin-area.component.html',
  styleUrl: './admin-area.component.scss'
})
export class AdminAreaComponent implements OnInit {
  constructor(
    private authService: AuthService,
    public sidebarService: NbSidebarService,
  ) { }

  userInfo: User | undefined;

  navigationMenu: NbMenuItem[] = [
    {
      title: 'מעבר לערוץ',
      icon: 'arrow-back-outline',
      url: '/',
      target: '_blank'
    },
    {
      title: 'הגדרות ערוץ',
      icon: 'settings-2-outline',
      link: '/admin/settings',
    },
    {
      title: 'ניהול משתמשים',
      icon: 'people-outline',
      link: '/admin/users',
      badge: {
        text: 'בקרוב',
        status: 'warning'
      }
    },
    {
      title: 'הגדרת התראות',
      icon: 'bell-outline',
      link: '/admin/notifications',
      badge: {
        text: 'בקרוב',
        status: 'warning'
      }
    },
    {
      title: 'ניהול הרשאות',
      icon: 'shield-outline',
      link: '/admin/permissions',
      badge: {
        text: 'בקרוב',
        status: 'warning'
      }
    },
    {
      title: "אימוג'ים",
      icon: 'smiling-face-outline',
      link: '/admin/emojis',
    },
    {
      title: 'ניהול פרסומת',
      icon: 'pie-chart-outline',
      link: '/admin/ads',
      badge: {
        text: 'בקרוב',
        status: 'warning'
      }
    },
  ]

  ngOnInit(): void {
    this.authService.loadUserInfo()
      .then(user =>
        this.userInfo = user
      );
  }

}
