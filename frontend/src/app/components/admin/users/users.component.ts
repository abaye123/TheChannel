import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  NbCardModule, 
  NbButtonModule, 
  NbToastrService,
  NbIconModule,
  NbInputModule,
  NbBadgeModule,
  NbListModule,
  NbUserModule,
  NbSpinnerModule,
  NbAlertModule
} from '@nebular/theme';
import { AdminService, Users } from '../../../services/admin.service';

@Component({
  selector: 'app-users',
  imports: [
    CommonModule,
    FormsModule,
    NbCardModule,
    NbButtonModule,
    NbIconModule,
    NbInputModule,
    NbBadgeModule,
    NbListModule,
    NbUserModule,
    NbSpinnerModule,
    NbAlertModule
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {
  users: Users[] = [];
  filteredUsers: Users[] = [];
  loading = false;
  searchTerm = '';
  showOnlyBlocked = false;
  actionInProgress = new Set<string>();
  usersAmount: number = 0;

  constructor(
    private adminService: AdminService,
    private toastrService: NbToastrService
  ) { }

  ngOnInit(): void {
    this.loadUsersAmount();
    this.loadUsers();
  }

  get totalUsers(): number {
    return this.users.length;
  }

  get blockedCount(): number {
    return this.users.filter(user => user.blocked).length;
  }

  async loadUsersAmount(): Promise<void> {
    try {
      this.usersAmount = await this.adminService.getUsersAmount();
    } catch (error) {
      console.error('Error loading users amount:', error);
    }
  }

  async loadUsers(): Promise<void> {
    this.loading = true;
    try {
      this.users = await this.adminService.getAllUsers();
      this.filterUsers();
      this.toastrService.success('', 'רשימת המשתמשים נטענה בהצלחה');
    } catch (error) {
      this.toastrService.danger('', 'שגיאה בטעינת רשימת המשתמשים');
      console.error('Error loading users:', error);
    } finally {
      this.loading = false;
    }
  }

  filterUsers(): void {
    let filtered = [...this.users];

    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase().trim();
      filtered = filtered.filter(user => 
        user.username?.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.publicName?.toLowerCase().includes(search)
      );
    }

    if (this.showOnlyBlocked) {
      filtered = filtered.filter(user => user.blocked);
    }

    this.filteredUsers = filtered;
  }

  toggleBlockedFilter(): void {
    this.showOnlyBlocked = !this.showOnlyBlocked;
    this.filterUsers();
  }

  exportToCSV(): void {
    try {
      const headers = ['שם משתמש', 'אימייל', 'שם ציבורי', 'מנהל ראשי', 'חסום', 'הרשאות'];
      
      const rows = this.filteredUsers.map(user => {
        const privileges = [];
        if (user.privileges?.['moderator']) privileges.push('מנהל');
        if (user.privileges?.['writer']) privileges.push('כותב');
        
        return [
          user.username || '',
          user.email,
          user.publicName || '',
          user.isAdmin ? 'כן' : 'לא',
          user.blocked ? 'כן' : 'לא',
          privileges.join(', ')
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;

      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `users_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      this.toastrService.success('', 'הקובץ הורד בהצלחה');
    } catch (error) {
      this.toastrService.danger('', 'שגיאה בהורדת הקובץ');
      console.error('Error exporting CSV:', error);
    }
  }

  async blockUser(user: Users): Promise<void> {
    if (user.isAdmin) {
      this.toastrService.warning('', 'לא ניתן לחסום משתמש מנהל');
      return;
    }

    const confirmed = confirm(`האם אתה בטוח שברצונך לחסום את ${user.username || user.email}?`);
    if (!confirmed) return;

    this.actionInProgress.add(user.email);
    try {
      await this.adminService.blockUser(user.email);
      user.blocked = true;
      this.filterUsers();
      this.toastrService.success('', `${user.username || user.email} נחסם בהצלחה`);
    } catch (error) {
      this.toastrService.danger('', 'שגיאה בחסימת המשתמש');
      console.error('Error blocking user:', error);
    } finally {
      this.actionInProgress.delete(user.email);
    }
  }

  async unblockUser(user: Users): Promise<void> {
    const confirmed = confirm(`האם אתה בטוח שברצונך לשחרר את ${user.username || user.email} מחסימה?`);
    if (!confirmed) return;

    this.actionInProgress.add(user.email);
    try {
      await this.adminService.unblockUser(user.email);
      user.blocked = false;
      this.filterUsers();
      this.toastrService.success('', `החסימה של ${user.username || user.email} הוסרה בהצלחה`);
    } catch (error) {
      this.toastrService.danger('', 'שגיאה בהסרת החסימה');
      console.error('Error unblocking user:', error);
    } finally {
      this.actionInProgress.delete(user.email);
    }
  }

  trackByEmail(index: number, user: Users): string {
    return user.email;
  }
}