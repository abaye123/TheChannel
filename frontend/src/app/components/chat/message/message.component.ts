import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ChatMessage, ChatService } from "../../../services/chat.service";
import { NgIf, CommonModule } from "@angular/common";
import {
  NbButtonModule,
  NbCardModule,
  NbContextMenuModule, NbDialogService,
  NbIconModule, NbMenuService,
  NbPopoverModule,
  NbPosition,
  NbToastrService
} from "@nebular/theme";
import { MessageTimePipe } from "../../../pipes/message-time.pipe";
import { filter } from "rxjs";
import { InputFormComponent } from "../input-form/input-form.component";
import { MarkdownComponent } from "ngx-markdown";
import Viewer from 'viewerjs';
import { YoutubePlayerComponent } from '../youtube-player/youtube-player.component';
import { AdminService } from '../../../services/admin.service';
import { NgbPopover, NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-message',
  imports: [
    NgIf,
    CommonModule,
    NbCardModule,
    NbIconModule,
    NbButtonModule,
    MessageTimePipe,
    NbContextMenuModule,
    MarkdownComponent,
    NbPopoverModule,
    NgbPopoverModule,
  ],
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss'
})

export class MessageComponent implements OnInit {

  private v!: Viewer;

  protected readonly NbPosition = NbPosition;

  @Input()
  message: ChatMessage | undefined;

  @Input()
  isAdmin: boolean = false;

  @ViewChild(NgbPopover) popover!: NgbPopover;

  optionsMenu = [ // TODO: hide when X time passed
    {
      title: 'עריכה',
      icon: 'edit',
      click: (message: ChatMessage) => this.editMessage(message),
      hidden: false
    },
    {
      title: 'מחיקה',
      icon: 'trash',
      click: (message: ChatMessage) => this.deleteMessage(message),
      hidden: false
    }
  ];

  constructor(
    private _adminService: AdminService,
    private menuService: NbMenuService,
    private dialogService: NbDialogService,
    private _chatService: ChatService,
    private toastrService: NbToastrService
  ) { }

  reacts: string[] = [
    '👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🔥', '🎉', '🙏', '👀', '💯', '💔', '🤔', '🙌', '👏', '💡', ''
  ]

  private closeEmojiMenuTimeout: any;


  ngOnInit() {
    this.menuService.onItemClick().pipe(
      filter(value => value.tag == this.message?.id?.toString())
    ).subscribe((event) => {
      let item = this.optionsMenu.find(value => {
        return value.title == event.item.title;
      });
      if (item && this.message) {
        item.click(this.message);
      }
    });
  }

  editMessage(message: ChatMessage) {
    this.dialogService.open(InputFormComponent, { closeOnBackdropClick: false, context: { message: message } }).onClose
      .subscribe((result: ChatMessage | undefined) => {
        if (result && this.message?.id == result.id) {
          this.message = result;
        }
      });
  }

  deleteMessage(message: ChatMessage) {
    const confirm = window.confirm('האם אתה בטוח שברצונך למחוק את ההודעה?');
    if (confirm)
      this._adminService.deleteMessage(message.id).subscribe();
  }

  viewLargeImage(event: MouseEvent) {
    const target = event.target as HTMLElement;

    if (target.tagName === 'IMG' || target.tagName === 'I') {
      const youtubeId = target.getAttribute('youtubeid');
      if (youtubeId) {
        this.dialogService.open(YoutubePlayerComponent, { closeOnBackdropClick: true, context: { videoId: youtubeId } })
        return;
      }
      if (!this.v) {
        this.v = new Viewer(target, {
          toolbar: false,
          transition: true,
          navbar: false,
          title: false
        });
      }
      this.v.show();
    }
  }

  setReact(id: number | undefined, react: string) {
    if (id && react)
      this._chatService.setReact(id, react).catch(() => this.toastrService.danger('', "יש להתחבר לחשבון בכדי להוסיף אימוג'ים"));
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
}
