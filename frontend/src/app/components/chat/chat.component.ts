import { CommonModule } from '@angular/common';
import { Component, OnInit, NgZone, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService, ChatMessage } from '../../services/chat.service';
import { lastValueFrom } from 'rxjs';
import { AuthService, User } from '../../services/auth.service';
import {
  NbBadgeModule,
  NbButtonModule,
  NbCardModule,
  NbChatModule,
  NbIconModule,
  NbLayoutModule,
  NbListModule
} from "@nebular/theme";
import { ChannelHeaderComponent } from "./channel-header/channel-header.component";
import { MessageComponent } from "./message/message.component";

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NbLayoutModule,
    NbChatModule,
    ChannelHeaderComponent,
    NbCardModule,
    NbIconModule,
    NbButtonModule,
    NbListModule,
    NbBadgeModule,
    MessageComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit, OnDestroy {
  private eventSource!: EventSource;

  @ViewChild('messagesList', { static: false, read: ElementRef })
  messagesList?: ElementRef;

  messages: ChatMessage[] = [];
  userInfo?: User;
  isLoading: boolean = false;
  offset: number = 0;
  limit: number = 20;
  hasMoreMessages: boolean = true;
  hasNewMessages: boolean = false;
  showScrollToBottom: boolean = false;

  constructor(
    private chatService: ChatService,
    private _authService: AuthService,
    private zone: NgZone,
  ) { }

  ngOnInit() {
    this.eventSource = this.chatService.sseListener();
    this.eventSource.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'new-message':
          this.zone.run(() => {
            this.messages.unshift(message.message);
            this.hasNewMessages = !(message.message.author === this.userInfo?.username);
          });
          break;
        case 'delete-message':
          if (this.userInfo && this.userInfo.isAdmin) {
            this.zone.run(() => {
              const index = this.messages.findIndex(m => m.id === message.message.id);
              if (index !== -1) {
                this.messages[index].deleted = true;
                this.messages[index].lastEdit = message.message.lastEdit;
              }
            })
            break;
          };
          this.zone.run(() => {
            this.messages = this.messages.filter(m => m.id !== message.message.id);
          });
          break;
        case 'edit-message':
          this.zone.run(() => {
            const index = this.messages.findIndex(m => m.id === message.message.id);
            if (index !== -1) {
              this.messages[index] = message.message;
            } else {
           //  const closestIndex = this.messages.reduce
            }
          });
          break;
      }
    };

    this._authService.loadUserInfo().then(res => this.userInfo = res);

    this.loadMessages().then(() => {
      this.scrollToBottom();
    });
  }

  ngOnDestroy() {
    this.chatService.sseClose();
  }

  onListScroll() {
    let position = this.messagesList?.nativeElement.scrollTop * -1;
    this.showScrollToBottom = position > 200;
    if (position < 10) {
      this.hasNewMessages = false;
    }
  }

  scrollToBottom() {
    this.messagesList?.nativeElement.scrollTo({ behavior: 'smooth', top: 0 });
    this.hasNewMessages = false;
  }

  async loadMessages() {
    if (this.isLoading || !this.hasMoreMessages) return;

    try {
      this.isLoading = true;
      const response = await lastValueFrom(this.chatService.getMessages(this.offset, this.limit))
      if (response?.messages) {
        this.hasMoreMessages = response.hasMore;
        this.messages.push(...response.messages);
        this.offset = Math.min(...this.messages.map(m => m.id!));
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
