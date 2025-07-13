import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const AdminGuard: CanActivateChildFn = async (childRoute, state) => {
  const navigate = inject(Router);
  const authService = inject(AuthService);

  try {
    let userInfo = await authService.loadUserInfo();
    if (userInfo && userInfo.isAdmin) return true;

  } catch {
    navigate.navigate(['']);
    return false;
  }

  navigate.navigate(['']);
  return false;
};
