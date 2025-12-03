import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../services/admin.service';
import { NbButtonModule, NbCardModule, NbToastrService, NbIconModule, NbInputModule, NbSpinnerModule } from "@nebular/theme";
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Setting } from '../../../models/setting.model';

@Component({
  selector: 'app-settings',
  imports: [
    NbCardModule,
    NbButtonModule,
    NbIconModule,
    NbInputModule,
    NbSpinnerModule,
    CommonModule,
    FormsModule
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {

  settings: Setting[] = [];
  isLoading: boolean = true;
  setInProgress: boolean = false;

  constructor(
    private adminService: AdminService,
    private tostService: NbToastrService,
  ) { }

  ngOnInit(): void {
    this.isLoading = true;
    this.adminService.getSettings()
      .then(settings => {
        this.settings = settings || [];
        this.isLoading = false;
      })
      .catch(() => {
        this.isLoading = false;
        this.tostService.danger('', 'שגיאה בטעינת ההגדרות');
      });
  }

  saveSettings() {
    this.setInProgress = true;
    this.adminService.setSettings(this.settings)
      .then(() => {
        this.tostService.success('', 'השינוים נשמרו בהצלחה!');
        this.setInProgress = false;
      })
      .catch(() => {
        this.tostService.danger('', 'שגיאה בשמירת השינוים');
        this.setInProgress = false;
      });
  }

  removeSetting(index: number) {
    // if (!confirm('האם אתה בטוח שברצונך למחוק את ההגדרה הזו?')) return;
    this.settings.splice(index, 1);
  }
}
