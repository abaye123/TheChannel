import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NgIf, CommonModule } from "@angular/common";
import {
  NbButtonModule,
  NbCardModule, NbChatModule,
  NbDialogService,
  NbIconModule,
  NbPopoverModule,
  NbPosition,
  NbToastrService, NbUserModule
} from "@nebular/theme";
import { MarkdownComponent } from "ngx-markdown";
import Viewer from 'viewerjs';
import { YoutubePlayerComponent } from '../youtube-player/youtube-player.component';
import { NgbPopover, NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';
import { MessageTimePipe } from '../../../../pipes/message-time.pipe';
import { ChatMessage, ChatService } from '../../../../services/chat.service';
import { AdminService } from '../../../../services/admin.service';
import { AuthService } from '../../../../services/auth.service';
import { User } from '../../../../models/user.model';
import { ReportComponent } from './report/report.component';

@Component({
  selector: 'app-message',
  imports: [
    NgIf,
    CommonModule,
    NbCardModule,
    NbIconModule,
    NbButtonModule,
    MessageTimePipe,
    MarkdownComponent,
    NbPopoverModule,
    NgbPopoverModule,
    NbChatModule,
    NbUserModule,
  ],
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss'
})

export class MessageComponent implements OnInit, AfterViewInit {

  private v!: Viewer;

  protected readonly NbPosition = NbPosition;

  @Input()
  message: ChatMessage | undefined;

  @Input()
  userInfo?: User;

  @Input()
  allMessages: ChatMessage[] = [];

  @Input()
  isInThread: boolean = false;

  @Input()
  isLastMessage: boolean = false;

  @Input()
  onDialogStateChange?: (isOpen: boolean) => void;

  @ViewChild(NgbPopover) popover!: NgbPopover;
  @ViewChild('media') mediaContainer!: ElementRef;

  constructor(
    private _adminService: AdminService,
    private dialogService: NbDialogService,
    protected chatService: ChatService,
    private toastrService: NbToastrService,
    public _authService: AuthService,
  ) { }

  reacts: string[] = [];
  private closeEmojiMenuTimeout: any;
  replyToMessage?: ChatMessage;
  editTimeLimit: number = 120;

  get userPrivilege() {
    return this._authService.userInfo?.privileges || this.userInfo?.privileges;
  }

  ngOnInit() {
    this.chatService.getEmojisList()
      .then(emojis => this.reacts = emojis)
      .catch(() => this.toastrService.danger('', 'שגיאה בהגדרת אימוג\'יים'));

    if (this.message?.originalMessage) {
      this.replyToMessage = this.message.originalMessage;
    } else if (this.message?.replyTo) {
      this.replyToMessage = this.allMessages.find(m => m.id === this.message?.replyTo);
    }

    this.loadEditTimeLimit();
  }

  async loadEditTimeLimit() {
    try {
      this.editTimeLimit = 120;
    } catch (error) {
      console.error('Failed to load edit time limit:', error);
      this.editTimeLimit = 120;
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      const media = this.mediaContainer?.nativeElement.querySelectorAll('img, video');
      media?.forEach((item: HTMLMediaElement) => {
        if (this.chatService.channelInfo?.require_auth_for_view_files && !this._authService.userInfo) {
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.display = 'inline-block';
          wrapper.style.width = item.offsetWidth + 'px';
          wrapper.style.height = item.offsetHeight + 'px';

          const overlay = document.createElement('div');
          overlay.style.position = 'absolute';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100%';
          overlay.style.height = '100%';
          overlay.style.background = 'rgba(0,0,0,0.5)';
          overlay.style.backdropFilter = 'blur(4px)';
          overlay.style.display = 'flex';
          overlay.style.alignItems = 'center';
          overlay.style.justifyContent = 'center';
          overlay.style.color = 'white';
          overlay.style.fontSize = '14px';
          overlay.style.cursor = 'pointer';
          overlay.style.zIndex = '1';
          overlay.innerHTML = '<div style="text-align: center;">יש להתחבר כדי לצפות בקבצים <br>לחצו כאן להתחברות</div>';

          overlay.addEventListener('click', () => {
            this._authService.loginWithGoogle();
          });

          const parent = item.parentElement;
          if (parent) {
            parent.replaceChild(wrapper, item);
            wrapper.appendChild(item);
            wrapper.appendChild(overlay);
          }
        }
      });
    }, 1000);
  }

  editMessage(message: ChatMessage) {
    if (!this.canUserEditMessage(message)) {
      if (message.authorId !== this.userInfo?.id) {
        this.toastrService.warning('', 'ניתן לערוך רק הודעות שכתבת בעצמך');
      } else {
        this.toastrService.warning('', 'חלף הזמן המותר לעריכת ההודעה');
      }
      return;
    }

    this.chatService.setEditMessage(message);
  }

  deleteMessage(message: ChatMessage) {
    if (!this.canUserDeleteMessage(message)) {
      this.toastrService.warning('', 'אין לך הרשאה למחוק הודעה זו');
      return;
    }

    const confirm = window.confirm('האם אתה בטוח שברצונך למחוק את ההודעה?');
    if (confirm)
      this._adminService.deleteMessage(message.id).subscribe();
  }

  canUserEditMessage(message: ChatMessage): boolean {
    if (this.userPrivilege?.['admin'] || this.userPrivilege?.['moderator']) {
      return true;
    }

    if (!this.userPrivilege?.['writer']) {
      return false;
    }

    if (message.authorId !== this.userInfo?.id) {
      return false;
    }

    if (message.deleted) {
      return false;
    }

    if (!message.timestamp) {
      return false;
    }

    const messageTime = new Date(message.timestamp);
    const currentTime = new Date();
    const elapsedSeconds = (currentTime.getTime() - messageTime.getTime()) / 1000;

    return elapsedSeconds <= this.editTimeLimit;
  }

  canUserDeleteMessage(message: ChatMessage): boolean {
    if (this.userPrivilege?.['admin'] || this.userPrivilege?.['moderator']) {
      return true;
    }

    if (this.userPrivilege?.['writer'] && message.authorId === this.userInfo?.id) {
      return this.canUserEditMessage(message);
    }

    return false;
  }

  openReportDialog(messageId?: number) {
    if (!messageId) return;
    this.dialogService.open(ReportComponent, { closeOnBackdropClick: true, context: { messageId } });
  }

  viewLargeImage(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === 'IMG' || target.tagName === 'I') {
      const youtubeId = target.getAttribute('youtubeid');
      const isShorts = target.getAttribute('isshorts') === 'true';

      if (youtubeId) {
        // עדכון שהדיאלוג פתוח
        if (this.onDialogStateChange) {
          this.onDialogStateChange(true);
        }

        const dialogRef = this.dialogService.open(YoutubePlayerComponent, {
          closeOnBackdropClick: true,
          context: {
            videoId: youtubeId,
            isShorts: isShorts
          }
        });

        // עדכון שהדיאלוג נסגר
        dialogRef.onClose.subscribe(() => {
          if (this.onDialogStateChange) {
            this.onDialogStateChange(false);
          }
        });

        return;
      }

      if (this.v) {
        this.v.destroy();
      }

      this.v = new Viewer(target, {
        toolbar: false,
        transition: true,
        navbar: false,
        title: false
      });

      this.v.show();
    }
  }

  setReact(id: number | undefined, react: string) {
    if (id && react)
      this.chatService.setReact(id, react).catch(() => this.toastrService.danger('', "יש להתחבר לחשבון בכדי להוסיף אימוג'ים"));
  }

  showEmojiMenu() {
    this.cancelEmojiMenuClose();
    this.popover.open()
  }

  scheduleEmojiMenuClose() {
    this.closeEmojiMenuTimeout = setTimeout(() => {
      this.popover.close();
    }, 150);
  }

  cancelEmojiMenuClose() {
    if (this.closeEmojiMenuTimeout) {
      clearTimeout(this.closeEmojiMenuTimeout);
      this.closeEmojiMenuTimeout = undefined;
    }
  }

  getPopoverPlacement(): string {
    if (this.isLastMessage) {
      return 'top';
    }

    const messageElement = document.getElementById(this.message?.id?.toString() || '');
    if (messageElement) {
      const rect = messageElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < 150 && spaceAbove > 150) {
        return 'top';
      }
    }

    return 'bottom';
  }

  isEdited(message: ChatMessage): boolean {
    if (!message.last_edit) return false;

    if (typeof message.last_edit === 'string' && (message.last_edit as string).trim() === '') {
      return false;
    }

    const date = new Date(message.last_edit).getFullYear();
    if (isNaN(date)) return false;

    return date !== 1;
  }

  copyLink(messageId?: number) {
    if (!messageId) return;
    const url = `${window.location.origin}/#${messageId}`;
    navigator.clipboard.writeText(url).then(() => {
      this.toastrService.success('', 'הקישור הועתק ללוח');
    });
  }

  replyToThisMessage(message: ChatMessage) {
    if (this.isInThread) {
      // אם אנחנו בשרשור, הגב בשרשור
      this.replyInThread(message);
    } else {
      this.chatService.setReplyToMessage(message);
    }
  }

  navigateToOriginalMessage(messageId: number) {
    const element = document.getElementById(messageId.toString());
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlighted-message');
      setTimeout(() => {
        element.classList.remove('highlighted-message');
      }, 3000);
    }
  }

  truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  // פונקציות שרשור חדשות
  openThread(message: ChatMessage) {
    console.log('Opening thread for message:', message);
    if (message.id) {
      this.chatService.openThread(message);
    } else {
      console.warn('Cannot open thread: message has no ID');
    }
  }

  startThread(message: ChatMessage) {
    console.log('Starting thread for message:', message);
    if (message.id) {
      // פתח את הפאנל גם אם אין תגובות
      this.chatService.openThread(message);
    } else {
      console.warn('Cannot start thread: message has no ID');
    }
  }

  replyInThread(message: ChatMessage) {
    const threadReply: ChatMessage = {
      replyTo: message.id,
      isThread: true
    };
    this.chatService.setReplyToMessage(threadReply);
  }

  hasThreadReplies(message: ChatMessage): boolean {
    return !!(message.threadCount && message.threadCount > 0);
  }
}
