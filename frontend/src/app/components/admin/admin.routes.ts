import { Routes } from "@angular/router";
import { AdminAreaComponent } from "./admin-area/admin-area.component";
import { UsersComponent } from "./users/users.component";

export const adminRoutes: Routes = [
    {
        path: '',
        component: AdminAreaComponent,
        children: [
            { path: 'users', component: UsersComponent },
            { path: 'dashboard', component: UsersComponent },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
            { path: '**', redirectTo: '' }
        ],
    }
]