import { Component, OnInit, OnDestroy, ChangeDetectorRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NbCardModule,
  NbButtonModule,
  NbIconModule,
  NbListModule,
  NbSpinnerModule,
  NbLayoutModule
} from '@nebular/theme';
import { ChatService, ChatMessage } from '../../../services/chat.service';
import { MessageComponent } from '../chat/message/message.component';
import { ThreadMessageComponent } from './thread-message/thread-message.component';
import { ThreadInputComponent } from './thread-input/thread-input.component';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ThreadReadStatusService } from '../../../services/thread-read-status.service';

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
    NbLayoutModule,
    MessageComponent,
    ThreadMessageComponent,
    ThreadInputComponent
  ],
  templateUrl: './thread-panel.component.html',
  styleUrls: ['./thread-panel.component.scss']
})
export class ThreadPanelComponent implements OnInit, OnDestroy {
  @Input() isInChatArea: boolean = false;

  isVisible = false;
  threadMessage?: ChatMessage;
  threadReplies: ChatMessage[] = [];
  isLoading = false;
  private subscriptions: Subscription[] = [];

  constructor(
    public chatService: ChatService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef,
    private threadReadStatusService: ThreadReadStatusService
  ) { }

  ngOnInit() {
    this.subscriptions.push(
      this.chatService.threadVisibleObservable.subscribe((visible: boolean) => {
        console.log('Thread visibility changed:', visible);
        this.isVisible = visible;
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.chatService.currentThreadMessageObservable.subscribe((message: ChatMessage | undefined) => {
        console.log('Thread message changed:', message);
        this.threadMessage = message;
        if (message?.id) {
          this.loadThreadReplies(message.id);
        } else {
          this.threadReplies = [];
        }
        this.cdr.detectChanges();
      })
    );

    this.subscriptions.push(
      this.chatService.threadMessagesObservable.subscribe((messages: ChatMessage[]) => {
        console.log('Thread replies updated:', messages);
        this.threadReplies = messages;
        this.markThreadAsReadIfVisible();
        this.cdr.detectChanges();
      })
    );
  }

  private markThreadAsReadIfVisible(): void {
    if (this.isVisible && this.threadMessage?.id && this.threadReplies.length > 0) {
      this.threadReadStatusService.markThreadAsRead(this.threadMessage.id, this.threadReplies.length);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  closeThread() {
    console.log('Closing thread');
    this.chatService.closeThread();
  }

  replyToThread() {
    if (this.threadMessage) {
      this.chatService.setReplyToThreadMessage(this.threadMessage);
    }
  }

  onMessageSent() {
    setTimeout(() => {
      this.scrollToBottomOfReplies();
    }, 100);
  }

  private scrollToBottomOfReplies() {
    const repliesContainer = document.querySelector('.thread-replies');
    if (repliesContainer) {
      repliesContainer.scrollTop = repliesContainer.scrollHeight;
    }
  }

  private async loadThreadReplies(messageId: number) {
    this.isLoading = true;
    try {
      await this.chatService.loadThreadMessages(messageId);
    } catch (error) {
      console.error('Failed to load thread replies:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  trackByMessageId(index: number, message: ChatMessage): number | undefined {
    return message.id;
  }
}
