import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [
    FormsModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  username: string = '';
  password: string = '';

  constructor(
    private _authService: AuthService,
    private router: Router
  ) { }

  async login() {
    if (await this._authService.login(this.username, this.password)) {
      this.router.navigate(['/']);
    } else {
      alert('שגיאה');
    }
  }
}
