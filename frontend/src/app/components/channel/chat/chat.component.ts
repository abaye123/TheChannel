import { CommonModule } from '@angular/common';
import { Component, OnInit, NgZone, OnDestroy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NbAlertModule,
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
import { ConnectionBannerComponent } from "./connection-banner/connection-banner.component";
import { MessageGapIndicatorComponent } from "./message-gap-indicator/message-gap-indicator.component";
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { ChatMessage, ChatService } from '../../../services/chat.service';
import { AuthService } from '../../../services/auth.service';
import { SoundService } from '../../../services/sound.service';
import { ActivatedRoute } from '@angular/router';
import { NotificationsService } from '../../../services/notifications.service';
import { User } from '../../../models/user.model';

type LoadMsgOpt = {
  scrollDown?: boolean;
  messageId?: number;
  mark?: boolean;
}

type ScrollOpt = {
  messageId: number;
  smooth?: boolean;
  mark?: boolean;
}

interface MessageRange {
  start: number;  // First message ID in range
  end: number;    // Last message ID in range
}

interface MessageGap {
  id: string;
  startId: number;  // Message ID before gap
  endId: number;    // Message ID after gap
  estimatedCount: number;
  isLoading: boolean;
}

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
    NbAlertModule,
    MessageComponent,
    ThreadPanelComponent,
    ConnectionBannerComponent,
    MessageGapIndicatorComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})

export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  private eventSource!: EventSource;
  private messageIds = new Set<number>();
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
  private initialLoadComplete: boolean = false;
  private isDialogOpen: boolean = false;
  lastReadMessageId: number = 0;
  private intersectionObserver?: IntersectionObserver;
  public isSSEConnected: boolean = true;
  public showReconnectBanner: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private loadMessageAttempts: Map<number, number> = new Map();
  private readonly maxLoadAttempts: number = 3;
  private messageRanges: MessageRange[] = [];
  public messageGaps: MessageGap[] = [];
  private gapLoadingStates: Map<string, boolean> = new Map();
  public isLoadingSpecificMessage: boolean = false;
  public loadingMessageId?: number;

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

  scrollToId(opt: ScrollOpt) {
    const element = document.getElementById(opt.messageId.toString());
    if (element) {
      element.scrollIntoView({ behavior: opt.smooth ? 'smooth' : 'instant', block: 'center' });
      this.removeMsgMarked();
      opt.mark && element.classList.add('mark_message');
      // Reset attempts counter on success
      this.loadMessageAttempts.delete(opt.messageId);
    } else {
      // Check if we've exceeded max attempts for this message
      const attempts = this.loadMessageAttempts.get(opt.messageId) || 0;
      if (attempts >= this.maxLoadAttempts) {
        console.warn(`Max attempts reached for loading message ${opt.messageId}. Scrolling to bottom instead.`);
        this.loadMessageAttempts.delete(opt.messageId);
        this.scrollToBottom(false);
        // Update lastReadMessage to the latest message
        const latestMsgId = this.messages[0]?.id;
        if (latestMsgId) {
          this.lastReadMessageId = latestMsgId;
          this.setLastReadMessage(latestMsgId.toString());
        }
        return;
      }
      
      // Increment attempts counter
      this.loadMessageAttempts.set(opt.messageId, attempts + 1);
      this.loadMessages({ scrollDown: false, messageId: opt.messageId, mark: opt.mark });
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
          this.scrollToId({ messageId: messageId, mark: true });
        }
      });
    }, 800);
  }

  ngOnInit() {
    this.chatService.getEmojisList(true);

    this.initializeMessageListener();
    this.keepAliveSSE();
    this.setupIntersectionObserver();
    this.subscribeToOptimisticMessages();
    this.subscribeToConnectionStatus();

    this._authService.loadUserInfo()
      .then((res) => {
        this.userInfo = res;
        this.notificationService.init();
      })
      .catch(() => {
        this.userInfo = undefined;
      });

    this.loadMessages().then(() => {
      const lastReadMsg = Number(localStorage.getItem('lastReadMessage'));
      const lastMsgId = this.messages[0]?.id;
      
      if (this.messages.length === 0) {
        console.warn('No messages loaded on initial load');
        this.initialLoadComplete = true;
        return;
      }
      
      if (lastReadMsg && lastMsgId && lastReadMsg < lastMsgId) {
        const oldestMsgId = this.messages[this.messages.length - 1]?.id || 0;
        
        if (lastReadMsg >= oldestMsgId && lastReadMsg < lastMsgId) {
          // Message is in the loaded range
          setTimeout(() => {
            this.scrollToId({ messageId: lastReadMsg, smooth: false, mark: false });
            this.lastReadMessageId = lastReadMsg;
          }, 200);
        } else if (lastReadMsg < oldestMsgId) {
          // Message is older than the loaded range - attempt to load it
          console.log(`Last read message ${lastReadMsg} is older than loaded range. Attempting to load...`);
          setTimeout(() => {
            this.scrollToId({ messageId: lastReadMsg, smooth: false, mark: false });
            this.lastReadMessageId = lastReadMsg;
          }, 200);
        } else {
          // Message is newer (shouldn't happen, but handle gracefully)
          this.scrollToBottom(false);
          if (lastReadMsg) {
            this.lastReadMessageId = lastReadMsg;
          }
        }
      } else {
        this.scrollToBottom(false);
        if (lastReadMsg) {
          this.lastReadMessageId = lastReadMsg;
        }
      }

      this.initialLoadComplete = true;
      setTimeout(() => this.observeMessages(), 500);
    });

    this.subscribeToThreadMessages();
    this.subscribeToScrollRequests();
  }

  private subscribeToScrollRequests() {
    this.subscriptions.push(
      this.chatService.scrollToMessageRequestObservable.subscribe(({ messageId, highlight }) => {
        this.zone.run(() => {
          this.scrollToId({ messageId, smooth: true, mark: highlight });
        });
      })
    );
  }

  private subscribeToOptimisticMessages() {
    this.subscriptions.push(
      this.chatService.optimisticMessageObservable.subscribe((message: ChatMessage) => {
        this.zone.run(() => {
          if (message.id && !this.messageIds.has(message.id)) {
            this.messages.unshift(message);
            this.messageIds.add(message.id);
            
            if (!this.showScrollToBottom && message.id) {
              this.lastReadMessageId = message.id;
              this.setLastReadMessage(message.id.toString());
            }

            setTimeout(() => this.observeMessage(message.id!), 100);
            
            // Always scroll to bottom for own optimistic messages
            this.scrollToBottom(true);

            // Verify message was received via SSE after 3 seconds
            setTimeout(() => {
              this.verifyMessageReceived(message.id!);
            }, 3000);
          }
        });
      })
    );
  }

  private subscribeToConnectionStatus() {
    this.subscriptions.push(
      this.chatService.sseConnectedObservable.subscribe((connected: boolean) => {
        this.zone.run(() => {
          this.isSSEConnected = connected;
          this.showReconnectBanner = !connected;
          
          if (!connected) {
            console.warn('SSE connection lost');
          } else {
            console.log('SSE connection restored');
            this.reconnectAttempts = 0;
          }
        });
      })
    );
  }

  private verifyMessageReceived(messageId: number) {
    // Check if message with this ID exists in the list (it would be updated by SSE)
    const messageExists = this.messages.some(m => m.id === messageId);
    if (!messageExists && !this.isSSEConnected) {
      // Message was not received via SSE, show warning
      console.warn('Message may not have been broadcasted due to SSE disconnection');
    }
  }

  reconnectSSE() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect SSE (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    this.chatService.sseClose();
    setTimeout(() => {
      this.initializeMessageListener();
    }, 1000 * this.reconnectAttempts); // Exponential backoff
  }

  refreshPage() {
    window.location.reload();
  }

  async setLastReadMessage(id: string) {
    localStorage.setItem('lastReadMessage', id);
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
              }
              
              const mainMessage = this.messages.find(m => m.id === message.message.replyTo);
              if (mainMessage) {
                mainMessage.threadCount = (mainMessage.threadCount || 0) + 1;
              }
            } else if (!message.message.isThread) {
              if (this.hasNewMessages) return;
              if (message.message.id && !this.messageIds.has(message.message.id)) {
                this.messages.unshift(message.message);
                this.messageIds.add(message.message.id);
                const isMyMessage = message.message.author === this.userInfo?.username;
                const wasAtBottom = !this.showScrollToBottom;
                
                this.thereNewMessages = !isMyMessage;

                if (!this.showScrollToBottom && message.message.id) {
                  this.lastReadMessageId = message.message.id;
                  this.setLastReadMessage(message.message.id.toString());
                }

                setTimeout(() => this.observeMessage(message.message.id!), 100);

                if (!isMyMessage) {
                  if (this.soundService.isInitialized()) {
                    this.soundService.playNotificationSound();
                  }
                }

                // Scroll behavior based on message author and current scroll position
                if (isMyMessage) {
                  // Always scroll to bottom for own messages
                  this.scrollToBottom(true);
                } else if (wasAtBottom) {
                  // Scroll to bottom for other messages only if already at bottom
                  this.scrollToBottom(true);
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
            if (message.message.id) {
              this.messageIds.delete(message.message.id);
            }
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
          this.chatService.updateHeartbeat();
          break;
      }
    };
  }

  ngOnDestroy() {
    this.chatService.sseClose();
    clearInterval(this.subLastHeartbeat);
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.intersectionObserver?.disconnect();
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

    // מניעת טעינת הודעות כשדיאלוג פתוח
    if (this.isDialogOpen) {
      return;
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

  setDialogOpen(isOpen: boolean) {
    this.isDialogOpen = isOpen;
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
    const validIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
    if (validIds.length === 0) {
      this.isLoadingOlder = false;
      return;
    }
    const oldestId = Math.min(...validIds);

    let previousScrollHeight: number;
    let previousScrollTop: number;
    let chatContainer: Element | null = null;

    if (this.chatService.isThreadVisible()) {
      chatContainer = document.querySelector('.main-chat .messages-container');
      if (chatContainer) {
        previousScrollHeight = chatContainer.scrollHeight;
        previousScrollTop = chatContainer.scrollTop;
      }
    } else {
      previousScrollHeight = document.documentElement.scrollHeight;
      previousScrollTop = window.scrollY;
    }

    try {
      const response = await firstValueFrom(this.chatService.getMessages(oldestId, this.limit, "desc"));
      if (response && response.messages && response.messages.length > 0) {
        const newMessages = response.messages.filter(msg => {
          if (msg.id && !this.messageIds.has(msg.id)) {
            this.messageIds.add(msg.id);
            return true;
          }
          return false;
        });

        this.messages.push(...newMessages);
        this.hasOldMessages = response.messages.length >= this.limit;

        const updatedValidIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
        if (updatedValidIds.length > 0) {
          this.offset = Math.min(...updatedValidIds);
        }

        setTimeout(() => {
          if (this.chatService.isThreadVisible() && chatContainer) {
            const newScrollHeight = chatContainer.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeight;
            chatContainer.scrollTop = previousScrollTop + scrollDiff;
          } else {
            const newScrollHeight = document.documentElement.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeight;
            window.scrollTo(0, previousScrollTop + scrollDiff);
          }

          newMessages.forEach(msg => {
            if (msg.id) this.observeMessage(msg.id);
          });
        }, 0);
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
    const validIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
    if (validIds.length === 0) {
      this.isLoadingNewer = false;
      return;
    }
    const newestId = Math.max(...validIds);

    try {
      const response = await firstValueFrom(this.chatService.getMessages(newestId, this.limit, "asc"));
      if (response && response.messages && response.messages.length > 0) {
        const newMessages = response.messages.filter(msg => {
          if (msg.id && !this.messageIds.has(msg.id)) {
            this.messageIds.add(msg.id);
            return true;
          }
          return false;
        });

        this.messages.unshift(...newMessages.reverse());
        this.hasNewMessages = response.messages.length >= this.limit;

        setTimeout(() => {
          newMessages.forEach(msg => {
            if (msg.id) this.observeMessage(msg.id);
          });
        }, 200);
      } else {
        this.hasNewMessages = false;
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות חדשות:', error);
    } finally {
      this.isLoadingNewer = false;
    }
  }

  async loadMessages(opt: LoadMsgOpt = {}) {
    if (!this.initialLoadComplete && this.isLoading) return;

    // Load centered around specific message
    if (opt.messageId && !this.isMessageInLoadedRanges(opt.messageId)) {
      return this.loadMessagesCentered(opt.messageId, opt.mark);
    }

    // Regular loading (top/bottom)
    if (this.isLoading || (opt.scrollDown && !this.hasNewMessages) || (!opt.scrollDown && !this.hasOldMessages)) return;

    let startId: number;
    let direction: string = "desc";

    const validIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
    const maxId = validIds.length > 0 ? Math.max(...validIds) : 0;

    if (opt.scrollDown) {
      direction = "asc";
      startId = maxId;
    } else {
      startId = this.messages.length === 0 ? 0 : this.offset;
    }

    try {
      this.isLoading = true;
      const response = await firstValueFrom(this.chatService.getMessages(startId, this.limit, direction));
      
      if (response && response.messages && response.messages.length > 0) {
        const newMessages = response.messages.filter(msg => {
          if (msg.id && !this.messageIds.has(msg.id)) {
            this.messageIds.add(msg.id);
            return true;
          }
          return false;
        });

        if (opt.scrollDown) {
          this.messages.unshift(...newMessages.reverse());
          this.hasNewMessages = response.messages.length >= this.limit;
        } else {
          if (this.messages.length === 0 && response.messages.length > 0) {
            // Initial load
            this.messages = newMessages;
          } else {
            this.messages.push(...newMessages);
          }
          this.hasOldMessages = response.messages.length >= this.limit;
        }

        const updatedValidIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
        if (updatedValidIds.length > 0) {
          this.offset = Math.min(...updatedValidIds);
        }

        this.updateMessageRanges();
        this.detectAndCreateGaps();
      } else if (this.messages.length === 0) {
        // Fallback for empty initial load
        const fallbackResponse = await firstValueFrom(this.chatService.getMessages(0, this.limit, 'desc'));
        if (fallbackResponse && fallbackResponse.messages && fallbackResponse.messages.length > 0) {
          this.messageIds.clear();
          fallbackResponse.messages.forEach(msg => {
            if (msg.id) this.messageIds.add(msg.id);
          });
          this.messages = fallbackResponse.messages;
          const validIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
          if (validIds.length > 0) {
            this.offset = Math.min(...validIds);
          }
          this.hasOldMessages = fallbackResponse.messages.length >= this.limit;
          this.hasNewMessages = false;
          this.updateMessageRanges();
        }
      } else {
        if (opt.scrollDown) {
          this.hasNewMessages = false;
        } else {
          this.hasOldMessages = false;
        }
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadMessagesCentered(messageId: number, mark?: boolean) {
    const attempts = this.loadMessageAttempts.get(messageId) || 0;
    if (attempts >= this.maxLoadAttempts) {
      console.warn(`Max attempts reached for loading message ${messageId}. Scrolling to bottom instead.`);
      this.loadMessageAttempts.delete(messageId);
      this.isLoadingSpecificMessage = false;
      this.loadingMessageId = undefined;
      this.scrollToBottom(false);
      const latestMsgId = this.messages[0]?.id;
      if (latestMsgId) {
        this.lastReadMessageId = latestMsgId;
        this.setLastReadMessage(latestMsgId.toString());
      }
      return;
    }

    this.loadMessageAttempts.set(messageId, attempts + 1);
    this.isLoading = true;
    this.isLoadingSpecificMessage = true;
    this.loadingMessageId = messageId;

    try {
      // Load messages centered around the target message
      // Request from messageId + 10 to get messages around it
      const response = await firstValueFrom(
        this.chatService.getMessages(messageId + Math.floor(this.limit / 2), this.limit, "asc")
      );

      if (response && response.messages && response.messages.length > 0) {
        // Clear existing messages if loading a completely new range
        const shouldReset = this.messages.length === 0 || 
                           !this.isMessageInLoadedRanges(messageId);

        if (shouldReset) {
          this.messageIds.clear();
          this.messages = [];
        }

        // Add new messages
        response.messages.forEach(msg => {
          if (msg.id && !this.messageIds.has(msg.id)) {
            this.messageIds.add(msg.id);
            this.messages.push(msg);
          }
        });

        // Sort messages by ID (descending - newest first)
        this.messages.sort((a, b) => (b.id || 0) - (a.id || 0));

        const validIds = this.messages.map(m => m.id).filter(id => id !== undefined) as number[];
        if (validIds.length > 0) {
          this.offset = Math.min(...validIds);
        }

        // Set flags for infinite scroll
        this.hasNewMessages = true;
        this.hasOldMessages = true;

        this.updateMessageRanges();
        this.detectAndCreateGaps();

        setTimeout(() => {
          const messageLoaded = this.messages.some(m => m.id === messageId);
          if (messageLoaded) {
            this.scrollToId({ messageId: messageId, smooth: false, mark: mark });
            this.loadMessageAttempts.delete(messageId);
            // Hide loading overlay after successful scroll
            setTimeout(() => {
              this.isLoadingSpecificMessage = false;
              this.loadingMessageId = undefined;
            }, 500);
          } else {
            console.warn(`Message ${messageId} still not found after centered load`);
            // Try again with adjusted range
            this.loadMessagesCentered(messageId, mark);
          }
        }, 300);
      } else {
        console.warn(`No messages returned for centered load around ${messageId}`);
        this.isLoadingSpecificMessage = false;
        this.loadingMessageId = undefined;
        this.scrollToBottom(false);
      }
    } catch (error) {
      console.error('שגיאה בטעינה ממוקדת:', error);
      this.isLoadingSpecificMessage = false;
      this.loadingMessageId = undefined;
      this.scrollToBottom(false);
    } finally {
      this.isLoading = false;
    }
  }

  private isMessageInLoadedRanges(messageId: number): boolean {
    return this.messageRanges.some(range => 
      messageId >= range.end && messageId <= range.start
    );
  }

  private updateMessageRanges() {
    if (this.messages.length === 0) {
      this.messageRanges = [];
      return;
    }

    const validIds = this.messages
      .map(m => m.id)
      .filter(id => id !== undefined) as number[];
    
    if (validIds.length === 0) return;

    validIds.sort((a, b) => b - a); // Sort descending

    // Create ranges from consecutive IDs
    const ranges: MessageRange[] = [];
    let currentRange: MessageRange | null = null;

    for (let i = 0; i < validIds.length; i++) {
      const id = validIds[i];
      
      if (!currentRange) {
        currentRange = { start: id, end: id };
      } else if (currentRange.end - id === 1) {
        // Consecutive ID
        currentRange.end = id;
      } else {
        // Gap found, save current range and start new one
        ranges.push(currentRange);
        currentRange = { start: id, end: id };
      }
    }

    if (currentRange) {
      ranges.push(currentRange);
    }

    this.messageRanges = ranges;
  }

  private detectAndCreateGaps() {
    this.messageGaps = [];

    if (this.messageRanges.length <= 1) return;

    // Sort ranges by start (descending)
    const sortedRanges = [...this.messageRanges].sort((a, b) => b.start - a.start);

    for (let i = 0; i < sortedRanges.length - 1; i++) {
      const currentRange = sortedRanges[i];
      const nextRange = sortedRanges[i + 1];

      const gapSize = currentRange.end - nextRange.start - 1;

      if (gapSize > 0) {
        const gapId = `gap-${nextRange.start}-${currentRange.end}`;
        this.messageGaps.push({
          id: gapId,
          startId: nextRange.start,
          endId: currentRange.end,
          estimatedCount: gapSize,
          isLoading: this.gapLoadingStates.get(gapId) || false
        });
      }
    }
  }

  hasGapAfterMessage(messageId: number | undefined): MessageGap | null {
    if (!messageId) return null;
    return this.messageGaps.find(gap => gap.startId === messageId) || null;
  }

  async loadGapMessages(gap: MessageGap) {
    if (gap.isLoading) return;

    this.gapLoadingStates.set(gap.id, true);
    gap.isLoading = true;

    try {
      // Load messages in the gap
      const middlePoint = gap.startId + Math.floor((gap.endId - gap.startId) / 2);
      const response = await firstValueFrom(
        this.chatService.getMessages(middlePoint + Math.floor(this.limit / 2), this.limit, "asc")
      );

      if (response && response.messages && response.messages.length > 0) {
        response.messages.forEach(msg => {
          if (msg.id && !this.messageIds.has(msg.id)) {
            this.messageIds.add(msg.id);
            this.messages.push(msg);
          }
        });

        // Sort messages
        this.messages.sort((a, b) => (b.id || 0) - (a.id || 0));

        this.updateMessageRanges();
        this.detectAndCreateGaps();

        setTimeout(() => this.observeMessages(), 300);
      }
    } catch (error) {
      console.error('שגיאה בטעינת הודעות בפער:', error);
    } finally {
      this.gapLoadingStates.set(gap.id, false);
      gap.isLoading = false;
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

  private setupIntersectionObserver() {
    const options = {
      root: null, // viewport
      rootMargin: '0px',
      threshold: 0.5
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageId = Number(entry.target.id);
          if (messageId) {
            const currentLastRead = Number(localStorage.getItem('lastReadMessage')) || 0;
            if (messageId > currentLastRead) {
              this.setLastReadMessage(messageId.toString());
            }
          }
        }
      });
    }, options);
  }

  private observeMessages() {
    if (!this.intersectionObserver) return;
    
    this.messages.forEach(message => {
      if (message.id) {
        this.observeMessage(message.id);
      }
    });
  }

  private observeMessage(messageId: number) {
    if (!this.intersectionObserver) return;
    
    setTimeout(() => {
      const element = document.getElementById(messageId.toString());
      if (element) {
        this.intersectionObserver!.observe(element);
      }
    }, 100);
  }
}
