import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './services/chat-guard.guard';
import { MainComponent } from './main/main.component';
import { ChatComponent } from './components/channel/chat/chat.component';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    {
        path: '',
        component: MainComponent,
        children: [
            {
                path: 'admin',
                loadChildren: () => import('./components/admin/admin.routes').then(m => m.adminRoutes)
            },
            { path: '', component: ChatComponent, pathMatch: 'full', canActivate: [AuthGuard] },
            { path: '**', redirectTo: '' }
        ]
    },
];