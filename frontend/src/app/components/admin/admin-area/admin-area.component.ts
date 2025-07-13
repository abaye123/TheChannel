import { Component, OnInit } from '@angular/core';
import { UsersComponent } from "../users/users.component";
import { ChannelHeaderComponent } from "../../chat/channel-header/channel-header.component";
import { AuthService, User } from '../../../services/auth.service';
import { NbLayoutModule } from "@nebular/theme";

@Component({
  selector: 'app-admin-area',
  imports: [
    UsersComponent,
    ChannelHeaderComponent,
    NbLayoutModule
],
  templateUrl: './admin-area.component.html',
  styleUrl: './admin-area.component.scss'
})
export class AdminAreaComponent implements OnInit {
  constructor(
    private authService: AuthService,
  ) { }

  userInfo: User | undefined;
  ngOnInit(): void {
    this.authService.loadUserInfo()
      .then(user =>
        this.userInfo = user
      );
  }

}
