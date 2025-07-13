import { Routes } from "@angular/router";
import { AdminAreaComponent } from "./admin-area/admin-area.component";

export const routes: Routes = [
    {
        path: '',
        children: [
            { path: 'dashboard', component: AdminAreaComponent },
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
        ],
    }
]