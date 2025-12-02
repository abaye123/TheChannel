import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NbButtonModule, NbIconModule, NbSpinnerModule } from '@nebular/theme';

@Component({
  selector: 'app-message-gap-indicator',
  standalone: true,
  imports: [CommonModule, NbButtonModule, NbIconModule, NbSpinnerModule],
  template: `
    <div class="message-gap-indicator">
      <div class="gap-line"></div>
      <div class="gap-content">
        <span class="gap-text">{{ messageCount }} הודעות חסרות</span>
        <button 
          nbButton 
          size="tiny" 
          status="primary" 
          [disabled]="isLoading"
          (click)="onLoadClick()">
          <nb-icon *ngIf="!isLoading" icon="download-outline"></nb-icon>
          <nb-spinner *ngIf="isLoading" size="tiny" status="primary"></nb-spinner>
          <span *ngIf="!isLoading">טען הודעות</span>
        </button>
      </div>
      <div class="gap-line"></div>
    </div>
  `,
  styles: [`
    .message-gap-indicator {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 0;
      margin: 8px 0;
    }

    .gap-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--color-primary-500), transparent);
      opacity: 0.3;
    }

    .gap-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .gap-text {
      font-size: 0.85rem;
      color: var(--text-hint-color);
      font-weight: 500;
    }

    button {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  `]
})
export class MessageGapIndicatorComponent {
  @Input() messageCount: number = 0;
  @Input() isLoading: boolean = false;
  @Output() loadMessages = new EventEmitter<void>();

  onLoadClick() {
    this.loadMessages.emit();
  }
}
