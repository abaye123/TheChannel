import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NbButtonModule, NbIconModule } from '@nebular/theme';

@Component({
  selector: 'app-connection-banner',
  standalone: true,
  imports: [
    CommonModule,
    NbButtonModule,
    NbIconModule
  ],
  templateUrl: './connection-banner.component.html',
  styleUrl: './connection-banner.component.scss'
})
export class ConnectionBannerComponent {
  @Input() isConnected: boolean = true;
  @Output() reconnect = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  onReconnect() {
    this.reconnect.emit();
  }

  onRefresh() {
    this.refresh.emit();
  }

  onClose() {
    this.close.emit();
  }
}
