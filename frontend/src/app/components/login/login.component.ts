import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Channel } from '../../models/channel.model';
import { firstValueFrom } from 'rxjs';

type ErrorStatus = 'failed' | 'not-registered' | 'blocked' | null;

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
    CommonModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  code: string = '';
  checkUserInfo: boolean = false;
  status: ErrorStatus = null;
  channelInfo?: Channel;
  loadingChannelInfo: boolean = true;

  constructor(
    private _authService: AuthService,
    private _route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) { }

  async ngOnInit() {
    this.checkUserInfo = true;

    this.loadChannelInfo();

    try {
      await this._authService.loadUserInfo();
      if (this._authService.userInfo) {
        this.router.navigate(['/']);
        return;
      }
    } catch (error: any) {
      this._route.queryParams.subscribe(params => {
        if (Object.keys(params).length > 0) {
          if (params['code'] && params['state'] === localStorage.getItem('google_oauth_state')) {
            this.code = params['code'];
            this._authService.login(this.code).then(() => {
              this.router.navigate(['/']);
            }).catch((error) => {
              this.code = '';

              if (error.status === 403) {
                const errorMessage = error.error?.toLowerCase() || '';

                if (errorMessage.includes('blocked')) {
                  this.status = 'blocked';
                } else if (errorMessage.includes('not registered') ||
                  errorMessage.includes('access denied') ||
                  errorMessage.includes('not allowed')) {
                  this.status = 'not-registered';
                } else {
                  this.status = 'failed';
                }
              } else {
                this.status = 'failed';
              }
            });
          }
        }
      });
    } finally {
      this.checkUserInfo = false;
    }
  }

  async loadChannelInfo() {
    try {
      this.channelInfo = await firstValueFrom(
        this.http.get<Channel>('/api/channel/info-public')
      );
    } catch (error) {
      console.error('שגיאה בטעינת מידע הערוץ:', error);
    } finally {
      this.loadingChannelInfo = false;
    }
  }

  login() {
    this._authService.loginWithGoogle();
  }
}