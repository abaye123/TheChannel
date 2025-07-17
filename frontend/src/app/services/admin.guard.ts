import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, User } from './auth.service';

export const AdminGuard: CanActivateFn = async (Route, state) => {
  const route = inject(Router);
  const authService = inject(AuthService);
  let userInfo: User;
  const requiredPrivilege = Route.data['requiredPrivilege'];

  try {
    userInfo = await authService.loadUserInfo();
  } catch {
    route.navigate(['/']);
    return false;
  }

  if (userInfo?.privileges?.[requiredPrivilege]) return true;
  // TODO: Redirect users with semi-admin privileges to the admin interface home page

  route.navigate(['/']);
  return false;
};
