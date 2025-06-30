import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

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
  status!: 'failed';

  constructor(
    private _authService: AuthService,
    private _route: ActivatedRoute
  ) { }

  async ngOnInit() {
    this.checkUserInfo = true;

    try {
      await this._authService.loadUserInfo();
      if (this._authService.userInfo) {
        window.location.href = '/';
        return;
      }
    } catch {
      this._route.queryParams.subscribe(params => {
        if (Object.keys(params).length > 0) {
          if (params['code']) {
            this.code = params['code'];
            this._authService.login(this.code).then(() => {
              window.location.href = '/';
            }).catch(() => {
              this.code = '';
              this.status = 'failed';
              alert('התחברות נכשלה, נסה שוב');
            });
          }
        }
      });
    } finally {
      this.checkUserInfo = false;
    }
  }

  login() {
    this._authService.loginWithGoogle();
  }
}
