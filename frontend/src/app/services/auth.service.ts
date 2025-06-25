import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, lastValueFrom } from 'rxjs';

export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface ResponseResult {
  success: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  public userInfo?: User;

  constructor(
    private _http: HttpClient,
    private router: Router
  ) { }

  async login(username: string, password: string) {
    let body = { username, password };
    try {
      let res = await firstValueFrom(this._http.post<ResponseResult>('/auth/login', body));
      return res.success;
    } catch {
      this.userInfo = undefined;
      return false;
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
