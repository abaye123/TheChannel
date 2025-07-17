import { Routes } from "@angular/router";
import { UsersComponent } from "./users/users.component";
import { EmojisComponent } from "./emojis/emojis.component";
import { SettingsComponent } from "./settings/settings.component";
import { PrivilegDashboardComponent } from "./privileg-dashboard/privileg-dashboard.component";
import { AdminGuard } from "../../services/admin.guard";

export const adminRoutes: Routes = [
    {
        path: 'users', component: UsersComponent,
        data: { requiredPrivilege: 'moderator' },
        canActivate: [AdminGuard]
    },
    {
        path: 'dashboard', component: UsersComponent,
        data: { requiredPrivilege: 'moderator' },
        canActivate: [AdminGuard]
    },
    {
        path: 'emojis', component: EmojisComponent,
        data: { requiredPrivilege: 'moderator' },
        canActivate: [AdminGuard]
    },
    {
        path: 'settings', component: SettingsComponent,
        data: { requiredPrivilege: 'moderator' },
        canActivate: [AdminGuard]
    },
    {
        path: 'permissions', component: PrivilegDashboardComponent,
        data: { requiredPrivilege: 'admin' },
        canActivate: [AdminGuard]
    },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    { path: '**', redirectTo: 'dashboard' }
]