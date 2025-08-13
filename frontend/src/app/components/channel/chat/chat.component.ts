import { CommonModule } from '@angular/common';
import { Component, OnInit, NgZone, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NbBadgeModule,
  NbButtonModule,
  NbCardModule,
  NbChatModule,
  NbIconModule,
  NbLayoutModule,
  NbListModule
} from "@nebular/theme";
import { MessageComponent } from "./message/message.component";
import { ThreadPanelComponent } from "../thread-panel/thread-panel.component";
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { ChatMessage, ChatService } from '../../../services/chat.service';
import { AuthService } from '../../../services/auth.service';
import { SoundService } from '../../../services/sound.service';
import { ActivatedRoute } from '@angular/router';
import { NotificationsService } from '../../../services/notifications.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NbLayoutModule,
    NbChatModule,
    NbCardModule,
    NbIconModule,
    NbButtonModule,
    NbListModule,
    NbBadgeModule,
    MessageComponent,
    ThreadPanelComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  private eventSource!: EventSource;
  messages: ChatMessage[] = [];
  userInfo?: User;
  isLoading: boolean = false;
  offset: number = 0;
  limit: number = 20;
  hasOldMessages: boolean = true;
  hasNewMessages: boolean = false;
  thereNewMessages: boolean = false;
  showScrollToBottom: boolean = false;
  private lastHeartbeat: number = Date.now();
  private subLastHeartbeat: any;
  private subscriptions: Subscription[] = [];
  public isLoadingOlder: boolean = false;
  public isLoadingNewer: boolean = false;

  constructor(
    public chatService: ChatService,
    private _authService: AuthService,
    private notificationService: NotificationsService,
    private zone: NgZone,
    private soundService: SoundService,
    private router: ActivatedRoute,
  ) { }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    if (!this.chatService.isThreadVisible()) {
      this.onListScroll();
    }
  }

  @HostListener('document:keydown')
  @HostListener('document:click')
  onUserAction() {
    this.removeMsgMarked();
  }

  async scrollToId(messageId: number) {
    const element = document.getElementById(messageId.toString());
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.removeMsgMarked();
      element.classList.add('mark_message');
    }
  }

  private removeMsgMarked() {
    document.querySelectorAll('.mark_message').forEach((el) => {
      el.classList.remove('mark_message');
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.router.fragment.subscribe(fragment => {
        if (fragment) {
          const messageId = Number(fragment);
          if (!Number.isInteger(messageId)) return;
          const findId = this.messages.some(m => m.id === messageId);
          findId ? this.scrollToId(messageId) : this.loadMessages(false, messageId);
        }
      });
    }, 800);
  }

  ngOnInit() {
    this.chatService.getEmojisList(true);

    this.initializeMessageListener();
    this.keepAliveSSE();

    this._authService.loadUserInfo().then((res) => {
      this.userInfo = res;
      this.notificationService.init();
    });

    this.loadMessages().then(() => {
      this.scrollToBottom(false);
    });

    this.subscribeToThreadMessages();
  }

  private subscribeToThreadMessages() {
    this.subscriptions.push(
      this.chatService.threadMessagesObservable.subscribe((threadMessages: ChatMessage[]) => {
        const currentThread = this.chatService.getCurrentThreadMessage();
        if (currentThread) {
          const mainMessage = this.messages.find(m => m.id === currentThread.id);
          if (mainMessage) {
            mainMessage.threadCount = threadMessages.length;
          }
        }
      })
    );

    this.subscriptions.push(
      this.chatService.threadVisibleObservable.subscribe((visible: boolean) => {
        if (!visible) {
          setTimeout(() => {
            this.onListScroll();
          }, 100);
        }
      })
    );
  }

  private async initializeMessageListener() {
    this.eventSource = this.chatService.sseListener();
    this.eventSource.onmessage = (event) => {

      this.lastHeartbeat = Date.now();

      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'new-message':
          this.zone.run(() => {
            if (message.message.isThread && message.message.replyTo) {
              const currentThread = this.chatService.getCurrentThreadMessage();
              if (currentThread && currentThread.id === message.message.replyTo) {
                this.chatService.addThreadMessage(message.message);

                const mainMessage = this.messages.find(m => m.id === message.message.replyTo);
                if (mainMessage) {
                  mainMessage.threadCount = (mainMessage.threadCount || 0) + 1;
                }
              }
            } else if (!message.message.isThread) {
              if (this.hasNewMessages) return;
              this.messages.unshift(message.message);
              const isMyMessage = message.message.author === this.userInfo?.username;
              this.thereNewMessages = !isMyMessage;

              if (!isMyMessage) {
                if (this.soundService.isInitialized()) {
                  this.soundService.playNotificationSound();
                }
              }
            }
          });
          break;
        case 'delete-message':
          if (this.userInfo?.privileges?.['writer']) {
            this.zone.run(() => {
              const index = this.messages.findIndex(m => m.id === message.message.id);
              if (index !== -1) {
                this.messages[index].deleted = true;
                this.messages[index].last_edit = message.message.last_edit;
              }
            });
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
            }
          });
          break;
        case 'reaction':
          this.zone.run(() => {
            const index = this.messages.findIndex(m => m.id === message.message.id);
            if (index !== -1) this.messages[index].reactions = message.message.reactions;
          });
          break;
        case 'heartbeat':
          this.lastHeartbeat = Date.now();
          break;
      }
    };
  }

  ngOnDestroy() {
    this.chatService.sseClose();
    clearInterval(this.subLastHeartbeat);
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  async keepAliveSSE() {
    clearInterval(this.subLastHeartbeat);
    this.subLastHeartbeat = interval(15000)
      .subscribe(() => {
        if (Date.now() - this.lastHeartbeat > 60000) {
          this.lastHeartbeat = Date.now();
          this.initializeMessageListener();
        };
      });
  }

  onChatContainerScroll(event: Event) {
    if (this.chatService.isThreadVisible()) {
      this.onListScroll();
    }
  }

  onListScroll() {
    const chatContainer = document.querySelector('.main-chat .messages-container');
    if (!chatContainer) return;

    let distanceFromBottom: number;
    let distanceFromTop: number;

    if (this.chatService.isThreadVisible()) {
      distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
      distanceFromTop = chatContainer.scrollTop;
    } else {
      distanceFromBottom = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      distanceFromTop = window.scrollY;
    }

    this.showScrollToBottom = distanceFromBottom > 100;
    if (distanceFromBottom < 10) {
      this.thereNewMessages = false;
    }

    // טעינת הודעות ישנות יותר כשמגיעים לראש הרשימה
    if (distanceFromTop < 300 && !this.isLoadingOlder && this.hasOldMessages) {
      this.loadOlderMessages();
    }

    // טעינת הודעות חדשות יותר כשמגיעים לתחתית הרשימה
    if (distanceFromBottom < 300 && !this.isLoadingNewer && this.hasNewMessages) {
      this.loadNewerMessages();
    }
  }

  scrollToBottom(smooth: boolean = true) {
    setTimeout(() => {
      if (this.chatService.isThreadVisible()) {
        const mainChatContainer = document.querySelector('.main-chat .messages-container');
        if (mainChatContainer) {
          mainChatContainer.scrollTo({
            top: mainChatContainer.scrollHeight,
            behavior: smooth ? 'smooth' : 'instant'
          });
        }
      } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
      }
    }, 0);
    this.thereNewMessages = false;
  }

  async loadOlderMessages() {
    if (this.isLoadingOlder || !this.hasOldMessages) return;

    this.isLoadingOlder = true;
    const oldestId = Math.min(...this.messages.map(m => m.id!));

    try {
      const response = await firstValueFrom(this.chatService.getMessages(oldestId, this.limit, "desc"));
      if (response && response.length > 0) {
        this.messages.push(...response);
        this.hasOldMessages = response.length >= this.limit;
        this.offset = Math.min(...this.messages.map(m => m.id!));
      } else {
        this.hasOldMessages = false;
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות ישנות:', error);
    } finally {
      this.isLoadingOlder = false;
    }
  }

  async loadNewerMessages() {
    if (this.isLoadingNewer || !this.hasNewMessages) return;

    this.isLoadingNewer = true;
    const newestId = Math.max(...this.messages.map(m => m.id!));

    try {
      const response = await firstValueFrom(this.chatService.getMessages(newestId, this.limit, "asc"));
      if (response && response.length > 0) {
        this.messages.unshift(...response.reverse());
        this.hasNewMessages = response.length >= this.limit;
      } else {
        this.hasNewMessages = false;
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות חדשות:', error);
    } finally {
      this.isLoadingNewer = false;
    }
  }

  async loadMessages(scrollDown?: boolean, messageId?: number) {
    if (this.isLoading || (scrollDown && !this.hasNewMessages) || (!scrollDown && !this.hasOldMessages)) return;

    let startId: number;
    let resetList: boolean = false;
    let direction: string = "desc";

    const maxId = Math.max(...this.messages.map(m => m.id!));
    if (scrollDown) {
      direction = "asc";
      startId = maxId;
    } else {
      if (messageId) {
        if (messageId > maxId + this.limit) {
          resetList = true;
          this.hasNewMessages = true;
          this.hasOldMessages = true;
          startId = messageId + 10;
          direction = "asc";
          scrollDown = true;
        } else if (messageId > maxId) {
          startId = maxId;
          direction = "asc";
          scrollDown = true;
        } else {
          if (messageId < this.offset - this.limit) {
            resetList = true;
            this.hasNewMessages = true;
            this.hasOldMessages = true;
            startId = messageId + 10;
          } else {
            startId = this.offset;
          }
        }
      } else {
        startId = this.offset;
      }
    }

    try {
      this.isLoading = true;
      const response = await firstValueFrom(this.chatService.getMessages(startId, this.limit, direction))
      if (response) {
        if (scrollDown) {
          resetList ? this.messages = response.reverse() : this.messages.unshift(...response.reverse());
          this.hasNewMessages = response.length >= this.limit;
        } else {
          resetList ? this.messages = response : this.messages.push(...response);
          this.hasOldMessages = response.length >= this.limit;
        }
        this.offset = Math.min(...this.messages.map(m => m.id!));
        setTimeout(() => {
          messageId && this.scrollToId(messageId);
        }, 300);
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות:', error);
    } finally {
      this.isLoading = false;
    }
  }

  toggleSound() {
    if (this.soundService.isEnabled()) {
      this.soundService.disableSound();
    } else {
      this.soundService.enableSound();
    }
  }

  isSoundEnabled(): boolean {
    return this.soundService.isEnabled();
  }

  isThreadOpen(): boolean {
    return this.chatService.isThreadVisible();
  }

  getCurrentThreadMessage() {
    return this.chatService.getCurrentThreadMessage();
  }

  getChatContainerClass(): string {
    return this.isThreadOpen() ? 'chat-container thread-open' : 'chat-container';
  }

  getMainChatClass(): string {
    return this.isThreadOpen() ? 'main-chat with-thread' : 'main-chat';
  }
}