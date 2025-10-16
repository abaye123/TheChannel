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
  filteredPrivilegeUsersList: PrivilegeUser[] = [];
  addingNewUser: boolean = false;
  hasChanges: boolean = false;
  isSaving: boolean = false;
  searchTerm: string = '';

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
      this.filteredPrivilegeUsersList = [...this.privilegeUsersList];
      this.hasChanges = false;
    } catch (error) {
      this.tostService.danger('', 'שגיאה בטעינת רשימת המורשים');
    }
  }

  onSearchChange() {
    if (!this.searchTerm.trim()) {
      this.filteredPrivilegeUsersList = [...this.privilegeUsersList];
    } else {
      const searchTermLower = this.searchTerm.toLowerCase().trim();
      this.filteredPrivilegeUsersList = this.privilegeUsersList.filter(user =>
        (user.username?.toLowerCase().includes(searchTermLower)) ||
        (user.email?.toLowerCase().includes(searchTermLower)) ||
        (user.publicName?.toLowerCase().includes(searchTermLower))
      );
    }
  }

  clearSearch() {
    this.searchTerm = '';
    this.onSearchChange();
  }

  private saveTimeout: any;

  autoSaveDebounce() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveChanges();
    }, 2000);
  }

  async saveChanges() {
    if (!this.hasChanges) {
      return;
    }

    this.isSaving = true;
    try {
      await this.adminService.setPrivilegeUsers(this.privilegeUsersList);
      this.originalPrivilegeUsersList = JSON.parse(JSON.stringify(this.privilegeUsersList));
      this.hasChanges = false;
      this.onSearchChange();
      this.tostService.success('', 'השינויים נשמרו בהצלחה!');
    } catch (error) {
      this.tostService.danger('', 'שגיאה בשמירת השינויים');
    } finally {
      this.isSaving = false;
    }
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async saveNewUser() {
    if (!this.newUser.email?.trim()) {
      this.tostService.warning('', 'יש להזין כתובת מייל');
      return;
    }

    if (!this.isValidEmail(this.newUser.email)) {
      this.tostService.warning('', 'כתובת המייל אינה תקינה');
      return;
    }

    const existingUser = this.privilegeUsersList.find(
      user => user.email.toLowerCase() === this.newUser.email.toLowerCase()
    );

    if (existingUser) {
      this.tostService.warning('', 'משתמש עם מייל זה כבר קיים');
      return;
    }

    this.privilegeUsersList.push({ ...this.newUser });

    this.isSaving = true;
    try {
      await this.adminService.setPrivilegeUsers(this.privilegeUsersList);
      this.originalPrivilegeUsersList = JSON.parse(JSON.stringify(this.privilegeUsersList));
      this.hasChanges = false;
      this.tostService.success('', 'משתמש חדש נוסף ונשמר בהצלחה');
      this.resetNewUser();
      this.onSearchChange();
    } catch (error) {
      this.tostService.danger('', 'שגיאה בשמירת המשתמש החדש');
      this.privilegeUsersList = this.privilegeUsersList.filter(u => u.email !== this.newUser.email);
    } finally {
      this.isSaving = false;
    }
  }

  async deleteUser(index: number) {
    const userToDelete = this.filteredPrivilegeUsersList[index];
    const realIndex = this.privilegeUsersList.findIndex(user => user.email === userToDelete.email);

    if (realIndex === -1) return;

    const user = this.privilegeUsersList[realIndex];
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המשתמש ${user.publicName || user.email}?`)) {
      return;
    }

    this.privilegeUsersList[realIndex].deleted = true;

    this.isSaving = true;
    try {
      await this.adminService.setPrivilegeUsers(this.privilegeUsersList);
      this.originalPrivilegeUsersList = JSON.parse(JSON.stringify(this.privilegeUsersList));
      this.hasChanges = false;
      this.onSearchChange();
      this.tostService.success('', 'המשתמש נמחק בהצלחה');
    } catch (error) {
      this.tostService.danger('', 'שגיאה במחיקת המשתמש');
      this.privilegeUsersList[realIndex].deleted = false;
    } finally {
      this.isSaving = false;
    }
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
    this.onSearchChange();
    this.tostService.info('', 'השינויים בוטלו');
  }

  markAsChanged() {
    this.hasChanges = !this.areArraysEqual(this.privilegeUsersList, this.originalPrivilegeUsersList);

    if (this.hasChanges) {
      this.autoSaveDebounce();
    }
  }

  private areArraysEqual(arr1: PrivilegeUser[], arr2: PrivilegeUser[]): boolean {
    if (arr1.length !== arr2.length) return false;

    return arr1.every((user1, index) => {
      const user2 = arr2[index];
      return user1.email === user2.email &&
        user1.username === user2.username &&
        user1.publicName === user2.publicName &&
        user1.deleted === user2.deleted &&
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
    const userToCheck = this.filteredPrivilegeUsersList[index];
    const realIndex = this.privilegeUsersList.findIndex(user => user.email === userToCheck.email);

    if (realIndex === -1 || realIndex >= this.originalPrivilegeUsersList.length) return true;

    const current = this.privilegeUsersList[realIndex];
    const original = this.originalPrivilegeUsersList[realIndex];

    return current.publicName !== original.publicName ||
      current.deleted !== original.deleted ||
      JSON.stringify(current.privileges) !== JSON.stringify(original.privileges);
  }

  trackByIndex(index: number): number {
    return index;
  }
}