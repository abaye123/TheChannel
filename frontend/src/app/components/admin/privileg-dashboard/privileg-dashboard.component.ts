import { Component, OnInit } from '@angular/core';
import { AdminService, PrivilegeUser } from '../../../services/admin.service';
import { NbButtonModule, NbCardModule, NbInputModule, NbToastrService, NbIconModule, NbCheckboxModule } from "@nebular/theme";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-privileg-dashboard',
  imports: [
    NbCardModule,
    NbButtonModule,
    NbInputModule,
    FormsModule,
    CommonModule,
    NbIconModule,
    NbCheckboxModule
  ],
  templateUrl: './privileg-dashboard.component.html',
  styleUrl: './privileg-dashboard.component.scss'
})
export class PrivilegDashboardComponent implements OnInit {

  constructor(
    private adminService: AdminService,
    private tostService: NbToastrService,
    public authService: AuthService,
  ) { }

  privilegeUsersList: PrivilegeUser[] = [];
  addingNewUser: boolean = false;
  newUser: PrivilegeUser = {
    username: '',
    publicName: '',
    email: '',
    privileges: {
      admin: false,
      moderator: false,
      writer: false
    }
  };

  ngOnInit(): void {
    this.adminService.getPrivilegeUsersList()
      .then(list => {
        this.privilegeUsersList = list;
        console.log('privilegeUsersList', this.privilegeUsersList[0].privileges);
      })
  }

  saveChanges() {
    this.adminService.setPrivilegeUsers(this.privilegeUsersList)
      .then(() => this.tostService.success('', 'השינוים נשמרו בהצלחה!'));
  }

  deleteUser(index: number) {
    if (!confirm('האם אתה בטוח שברצונך למחוק את המשתמש הזה?')) return;
    this.privilegeUsersList.splice(index, 1);
  }

  saveNewUser() {
    if (!this.newUser.email) return;
    this.privilegeUsersList.push(this.newUser);
    this.newUser = this.nullUser;
    this.addingNewUser = false;
  }

  resetNewUser() {
    this.newUser = this.nullUser;
    this.addingNewUser = false;
  }

  nullUser: PrivilegeUser = {
    username: '',
    publicName: '',
    email: '',
    privileges: {
      admin: false,
      moderator: false,
      writer: false
    }
  };

}
