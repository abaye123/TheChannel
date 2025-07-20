import { Component, OnInit } from '@angular/core';
import { NbLayoutModule, NbSidebarModule, NbMenuModule, NbMenuItem, NbIconModule, NbSidebarService, NbButtonModule, NbUserModule, NbContextMenuModule, NbMenuService, NbToastrService } from "@nebular/theme";
import { Router, RouterOutlet } from "@angular/router";
import { AuthService, User } from '../services/auth.service';
import { CommonModule } from '@angular/common';
import { ChannelHeaderComponent } from '../components/channel/chat/channel-header/channel-header.component';
import { filter } from 'rxjs';

@Component({
  selector: 'app-main',
  imports: [
    NbLayoutModule,
    RouterOutlet,
    NbSidebarModule,
    NbMenuModule,
    CommonModule,
    ChannelHeaderComponent,
    NbIconModule,
    NbButtonModule,
    NbUserModule,
    NbContextMenuModule
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent implements OnInit {

  userInfo!: User;
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

  userMenuTag: string = 'user-menu';
  userMenu: NbMenuItem[] = [
    // {
    //   title: 'ערוך פרטי ערוץ',
    //   icon: 'edit-2-outline',
    // },
    // {
    //   title: 'ניהול ערוץ',
    //   icon: 'people-outline',
    //   link: '/admin/dashboard',
    // },
    {
      title: 'התנתק',
      icon: 'log-out',
    }
  ];


  constructor(
    private _authService: AuthService,
    public sidebarService: NbSidebarService,
    private menuService: NbMenuService,
    private router: Router,
    private toastrService: NbToastrService,
  ) { }

  ngOnInit(): void {
    this._authService.loadUserInfo().then(res => this.userInfo = res);
    this.menuService.onItemClick()
      .pipe(filter(({ tag }) => tag === this.userMenuTag))
      .subscribe(item => {
        switch (item.item.icon) {
          case 'log-out':
            this.logout();
            break;
        }
      }
      )
  }

  async logout() {
    if (await this._authService.logout()) {
      this.userInfo = null!;
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

}
