import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  id: string;
  username: string;
  isAdmin: boolean;
  picture: string;
}

export interface ResponseResult {
  success: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public userInfo?: User;

  state = crypto.randomUUID();
  params = new URLSearchParams({
    client_id: environment.googleClientId,
    redirect_uri: environment.googleRedirectUri,
    scope: environment.googleOauthScope,
    state: this.state,
    response_type: 'code',
    access_type: 'offline',
  });

  constructor(
    private _http: HttpClient,
  ) { }

  async loginWithGoogle() {
    window.location.href = `${environment.googleOauthUrl}?${this.params.toString()}`;
  }

  async login(code: string) {
    try {
      let res = await firstValueFrom(this._http.post<ResponseResult>('/auth/login', { code }));
      return res.success;
    } catch (err: any) {
      this.userInfo = undefined;
      throw err;
    }
  }

  async logout() {
    let res = await firstValueFrom(this._http.post<ResponseResult>('/auth/logout', {}));
    if (res.success) {
      this.userInfo = undefined;
    }
    return res.success;
  }

  async loadUserInfo() {
    try {
      this.userInfo = this.userInfo || await lastValueFrom(this._http.get<User>('/api/user-info'))
    } catch (err: any) {
      this.userInfo = undefined;
      throw err;
    }
    return this.userInfo;
  }
}
