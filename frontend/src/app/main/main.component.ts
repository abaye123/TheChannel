import { Component, OnInit } from '@angular/core';
import { NbLayoutModule, NbSidebarModule, NbMenuModule, NbMenuItem } from "@nebular/theme";
import { RouterOutlet } from "@angular/router";
import { AuthService, User } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { ChannelHeaderComponent } from '../components/channel/chat/channel-header/channel-header.component';

@Component({
  selector: 'app-main',
  imports: [
    NbLayoutModule,
    RouterOutlet,
    NbSidebarModule,
    NbMenuModule,
    CommonModule,
    ChannelHeaderComponent
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent implements OnInit {

  userInfo?: User;
  navigationMenu: NbMenuItem[] = [
    {
      title: 'מעבר לערוץ',
      icon: 'arrow-back-outline',
      link: '/',
    },
    {
      title: 'הגדרות ערוץ',
      icon: 'settings-2-outline',
      link: '/admin/settings',
      badge: {
        text: 'בקרוב',
        status: 'warning'
      }
    },
    {
      title: 'ניהול הרשאות',
      icon: 'shield-outline',
      link: '/admin/permissions',
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

  constructor(
    private _authService: AuthService,
  ) { }

  ngOnInit(): void {
    this._authService.loadUserInfo().then(res => this.userInfo = res);
  }

}
