import { Component, OnInit } from '@angular/core';
import { AdminService, PrivilegeUser } from '../../../services/admin.service';
import { 
  NbButtonModule, 
  NbCardModule, 
  NbInputModule, 
  NbToastrService, 
  NbIconModule, 
  NbCheckboxModule,
  NbAlertModule,
  NbSpinnerModule
} from "@nebular/theme";
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
    NbCheckboxModule,
    NbAlertModule,
    NbSpinnerModule
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
  originalPrivilegeUsersList: PrivilegeUser[] = [];
  addingNewUser: boolean = false;
  hasChanges: boolean = false;
  isSaving: boolean = false;
  
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
    this.loadPrivilegeUsers();
  }

  async loadPrivilegeUsers() {
    try {
      this.privilegeUsersList = await this.adminService.getPrivilegeUsersList();
      this.originalPrivilegeUsersList = JSON.parse(JSON.stringify(this.privilegeUsersList));
      this.hasChanges = false;
    } catch (error) {
      this.tostService.danger('', 'שגיאה בטעינת רשימת המורשים');
    }
  }

  async saveChanges() {
    if (!this.hasChanges) {
      this.tostService.info('', 'אין שינויים לשמירה');
      return;
    }

    this.isSaving = true;
    try {
      await this.adminService.setPrivilegeUsers(this.privilegeUsersList);
      this.originalPrivilegeUsersList = JSON.parse(JSON.stringify(this.privilegeUsersList));
      this.hasChanges = false;
      this.tostService.success('', 'השינויים נשמרו בהצלחה!');
    } catch (error) {
      this.tostService.danger('', 'שגיאה בשמירת השינויים');
    } finally {
      this.isSaving = false;
    }
  }

  deleteUser(index: number) {
    const user = this.privilegeUsersList[index];
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המשתמש ${user.publicName || user.email}?`)) {
      return;
    }
    this.privilegeUsersList.splice(index, 1);
    this.markAsChanged();
  }

  saveNewUser() {
    if (!this.newUser.email) {
      this.tostService.warning('', 'יש להזין כתובת מייל');
      return;
    }

    // בדיקת מייל כפול
    const existingUser = this.privilegeUsersList.find(user => user.email === this.newUser.email);
    if (existingUser) {
      this.tostService.warning('', 'משתמש עם מייל זה כבר קיים');
      return;
    }

    this.privilegeUsersList.push({...this.newUser});
    this.resetNewUser();
    this.markAsChanged();
    this.tostService.success('', 'משתמש חדש נוסף בהצלחה');
  }

  resetNewUser() {
    this.newUser = {
      username: '',
      publicName: '',
      email: '',
      privileges: {
        admin: false,
        moderator: false,
        writer: false
      }
    };
    this.addingNewUser = false;
  }

  resetChanges() {
    if (!confirm('האם אתה בטוח שברצונך לבטל את כל השינויים?')) {
      return;
    }
    this.privilegeUsersList = JSON.parse(JSON.stringify(this.originalPrivilegeUsersList));
    this.hasChanges = false;
    this.addingNewUser = false;
    this.resetNewUser();
    this.tostService.info('', 'השינויים בוטלו');
  }

  markAsChanged() {
    this.hasChanges = !this.areArraysEqual(this.privilegeUsersList, this.originalPrivilegeUsersList);
  }

  private areArraysEqual(arr1: PrivilegeUser[], arr2: PrivilegeUser[]): boolean {
    if (arr1.length !== arr2.length) return false;
    
    return arr1.every((user1, index) => {
      const user2 = arr2[index];
      return user1.email === user2.email &&
             user1.username === user2.username &&
             user1.publicName === user2.publicName &&
             JSON.stringify(user1.privileges) === JSON.stringify(user2.privileges);
    });
  }

  getIconStatus(user: PrivilegeUser): string {
    if (user.privileges['admin']) return 'success';
    if (user.privileges['moderator']) return 'warning';
    if (user.privileges['writer']) return 'info';
    return 'basic';
  }

  getUserIcon(user: PrivilegeUser): string {
    if (user.privileges['admin']) return 'shield-outline';
    if (user.privileges['moderator']) return 'settings-outline';
    if (user.privileges['writer']) return 'edit-outline';
    return 'person-outline';
  }

  hasUserChanged(index: number): boolean {
    if (index >= this.originalPrivilegeUsersList.length) return true;
    
    const current = this.privilegeUsersList[index];
    const original = this.originalPrivilegeUsersList[index];
    
    return current.publicName !== original.publicName ||
           JSON.stringify(current.privileges) !== JSON.stringify(original.privileges);
  }

  trackByIndex(index: number): number {
    return index;
  }
}