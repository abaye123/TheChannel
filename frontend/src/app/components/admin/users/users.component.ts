import { Component, OnInit } from '@angular/core';
import { NbCardModule } from '@nebular/theme';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-users',
  imports: [
    NbCardModule,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {

  constructor(
    private _adminService: AdminService
  ) { }

  usersAmount: number = 0;

  ngOnInit(): void {
    this._adminService.getUsersAmount().then(amount => {
      this.usersAmount = amount;
    })
  }

}
