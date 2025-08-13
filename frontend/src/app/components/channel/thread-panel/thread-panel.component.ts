import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  NbCardModule, 
  NbButtonModule, 
  NbIconModule,
  NbListModule,
  NbSpinnerModule
} from '@nebular/theme';
import { ChatService, ChatMessage } from '../../../services/chat.service';
import { MessageComponent } from '../chat/message/message.component';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-thread-panel',
  standalone: true,
  imports: [
    CommonModule,
    NbCardModule,
    NbButtonModule,
    NbIconModule,
    NbListModule,
    NbSpinnerModule,
    MessageComponent
  ],
  template: `
    <div class="thread-panel" [class.visible]="isVisible">
      <nb-card class="h-100">
        <nb-card-header class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-1">שרשור</h6>
            <small class="text-muted" *ngIf="threadMessage">
              בתגובה להודעה של {{ threadMessage.author }}
            </small>
          </div>
          <button nbButton ghost shape="round" size="small" (click)="closeThread()">
            <nb-icon icon="close"></nb-icon>
          </button>
        </nb-card-header>

        <nb-card-body class="thread-messages">
          <!-- הודעה מקורית -->
          <div *ngIf="threadMessage" class="original-message mb-3">
            <div class="original-message-header">
              <small class="text-muted">הודעה מקורית:</small>
            </div>
            <app-message 
              [message]="threadMessage" 
              [userInfo]="authService.userInfo"
              [allMessages]="[]"
              [isInThread]="true">
            </app-message>
          </div>

          <!-- הודעות שרשור -->
          <div class="thread-replies">
            <div *ngIf="isLoading" class="text-center p-3">
              <nb-spinner size="medium"></nb-spinner>
              <p class="mt-2">טוען הודעות...</p>
            </div>

            <div *ngIf="!isLoading && threadReplies.length === 0" class="text-center text-muted p-3">
              <nb-icon icon="message-circle-outline" class="mb-2"></nb-icon>
              <p>אין תגובות בשרשור זה עדיין</p>
              <small>היה הראשון להגיב!</small>
            </div>

            <nb-list *ngIf="!isLoading && threadReplies.length > 0">
              <nb-list-item *ngFor="let reply of threadReplies; trackBy: trackByMessageId">
                <app-message 
                  [message]="reply" 
                  [userInfo]="authService.userInfo"
                  [allMessages]="threadReplies"
                  [isInThread]="true">
                </app-message>
              </nb-list-item>
            </nb-list>
          </div>
        </nb-card-body>

        <nb-card-footer *ngIf="authService.userInfo?.privileges?.['writer'] && chatService.channelInfo?.threads_enabled">
          <button 
            nbButton 
            status="primary" 
            size="small" 
            fullWidth
            (click)="replyToThread()"
            [disabled]="!threadMessage">
            <nb-icon icon="plus"></nb-icon>
            הגב בשרשור
          </button>
        </nb-card-footer>
      </nb-card>
    </div>
  `,
  styles: [`
    .thread-panel {
      position: fixed;
      top: 80px;
      left: -400px;
      width: 380px;
      height: calc(100vh - 80px);
      z-index: 1000;
      transition: left 0.3s ease;
      box-shadow: 2px 0 10px rgba(0,0,0,0.1);
    }

    .thread-panel.visible {
      left: 0;
    }

    .thread-messages {
      overflow-y: auto;
      max-height: calc(100vh - 200px);
      padding: 0;
    }

    .original-message {
      border-bottom: 1px solid #e5e5e5;
      padding-bottom: 1rem;
    }

    .original-message-header {
      padding: 0.5rem 1rem;
      background: #f8f9fa;
      border-radius: 0.25rem;
      margin-bottom: 0.5rem;
    }

    .thread-replies {
      padding: 1rem;
    }

    nb-list-item {
      border-bottom: 0 !important;
      padding: 0.5rem 0 !important;
    }

    @media (max-width: 768px) {
      .thread-panel {
        width: 100vw;
        left: -100vw;
      }
      
      .thread-panel.visible {
        left: 0;
      }
    }
  `]
})
export class ThreadPanelComponent implements OnInit, OnDestroy {
  isVisible = false;
  threadMessage?: ChatMessage;
  threadReplies: ChatMessage[] = [];
  isLoading = false;
  private subscriptions: Subscription[] = [];

  constructor(
    public chatService: ChatService,
    public authService: AuthService
  ) {}

  ngOnInit() {
    this.subscriptions.push(
      this.chatService.threadVisibleObservable.subscribe((visible: boolean) => {
        this.isVisible = visible;
      }),

      this.chatService.currentThreadMessageObservable.subscribe((message: ChatMessage | undefined) => {
        this.threadMessage = message;
        if (message) {
          this.loadThreadReplies(message.id!);
        }
      }),

      this.chatService.threadMessagesObservable.subscribe((messages: ChatMessage[]) => {
        this.threadReplies = messages;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  closeThread() {
    this.chatService.closeThread();
  }

  replyToThread() {
    if (this.threadMessage) {
      const threadReply: ChatMessage = {
        replyTo: this.threadMessage.id,
        isThread: true
      };
      this.chatService.setReplyToMessage(threadReply);
    }
  }

  trackByMessageId(index: number, message: ChatMessage): number | undefined {
    return message.id;
  }

  private async loadThreadReplies(messageId: number) {
    this.isLoading = true;
    try {
      await this.chatService.loadThreadMessages(messageId);
    } catch (error) {
      console.error('Failed to load thread replies:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
