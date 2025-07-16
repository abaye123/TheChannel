import { Routes } from "@angular/router";
import { AdminAreaComponent } from "./admin-area/admin-area.component";
import { UsersComponent } from "./users/users.component";
import { EmojisComponent } from "./emojis/emojis.component";
import { SettingsComponent } from "./settings/settings.component";

export const adminRoutes: Routes = [
    {
        path: '',
        component: AdminAreaComponent,
        children: [
            { path: 'users', component: UsersComponent },
            { path: 'dashboard', component: UsersComponent },
            { path: 'emojis', component: EmojisComponent },
            { path: 'settings', component: SettingsComponent },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: '**', redirectTo: 'dashboard' }
        ],
    },

]