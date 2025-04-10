import { Component, OnInit } from '@angular/core';
import { ChatMessage, ChatService, ChatFile , Attachment} from "../../../services/chat.service";
import { HttpClient, HttpEventType } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule, NbDialogRef,
  NbFormFieldModule,
  NbIconModule,
  NbInputModule,
  NbProgressBarModule, NbSpinnerModule, NbTagModule, NbToastrService, NbToggleModule
} from "@nebular/theme";
import { AngularMarkdownEditorModule } from "angular-markdown-editor";
import { MarkdownComponent } from "ngx-markdown";

@Component({
  selector: 'app-input-form',
  imports: [
    FormsModule,
    NbInputModule,
    NbIconModule,
    NbButtonModule,
    NbProgressBarModule,
    NbCardModule,
    NbFormFieldModule,
    AngularMarkdownEditorModule,
    NbToggleModule,
    NbSpinnerModule,
    MarkdownComponent,
    NbTagModule,
    NbAlertModule,
  ],
  templateUrl: './input-form.component.html',
  styleUrl: './input-form.component.scss'
})
export class InputFormComponent implements OnInit {

  protected readonly maxMessageLength: number = 2048;

  message?: ChatMessage;

  attachments: Attachment[] = [];

  input: string = '';
  isSending: boolean = false;
  showMarkdownPreview: boolean = false;

  constructor(private http: HttpClient, private chatService: ChatService, private toastrService: NbToastrService, protected dialogRef: NbDialogRef<InputFormComponent>) { }

  ngOnInit() {
    if (this.message) {
      this.input = this.message.text || '';
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      let newAttachment: Attachment = { file: input.files[0] };
      let i = this.attachments.push(newAttachment) - 1;

      let reader = new FileReader();
      reader.readAsDataURL(newAttachment.file);
      reader.onload = (event) => {
        if (event.target) {
          this.attachments[i].url = event.target.result as string;
        }
      }

      this.uploadFile(this.attachments[i]);
    }
  }

  async uploadFile(attachment: Attachment) {
    try {
      const formData = new FormData();
      if (!attachment.file) return;
      formData.append('file', attachment.file);

      attachment.uploading = true;

      this.chatService.uploadFile(formData).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            attachment.uploadProgress = Math.round((event.loaded / (event.total || 1)) * 100);
          } else if (event.type === HttpEventType.Response) {
            const uploadedFile: ChatFile | null = event.body || null;
            let embedded = '';

            if (!uploadedFile) return;
            if (uploadedFile?.filetype === 'image') {
              embedded = `[image-embedded#](${uploadedFile.url})`; //`![${uploadedFile.filename}](${uploadedFile.url})`;

            } else if (uploadedFile?.filetype === 'video') {
              embedded = `[video-embedded#](${uploadedFile.url})`;

            } else if (uploadedFile?.filetype === 'audio') {
              embedded = `[audio-embedded#](${uploadedFile.url})`;

            } else {
              embedded = `[${uploadedFile.filename}](${uploadedFile.url})`;
            }
            this.input += (this.input ? '\n' : '') + embedded;
            attachment.embedded = embedded;
            attachment.uploading = false;
          }
        },
        error: (error) => {
          if (error.status === 413) {
            this.toastrService.danger("", "קובץ גדול מדי");
          } else {
            this.toastrService.danger("", "שגיאה בהעלאת קובץ");
          }
          attachment.uploading = false;
          this.removeAttachment(attachment);
        }
      });
    } catch (error) {
      this.toastrService.danger("", "שגיאה בהעלאת קובץ");
    }
  }

  async sendMessage() {
    try {
      this.isSending = true;

      const hasPendingFiles = this.attachments.some((attachment) => attachment.uploading);
      if (hasPendingFiles) {
        this.toastrService.danger("", "יש קבצים בהעלאה");
        this.isSending = false;
        return;
      }

      let result = this.message ? await this.updateMessage() : await this.sendNewMessage();
      if (!result) {
        throw new Error();
      }

      this.toastrService.success("", "הודעה פורסמה בהצלחה");
      this.dialogRef.close(this.message);
    } catch (error) {
      this.toastrService.danger("", "שגיאה בפרסום הודעה");
    } finally {
      this.isSending = false
    }
  }

  async updateMessage(): Promise<boolean> {
    if (!this.message) return false;
    this.message.text = this.input;
    this.message.deleted = false;
    await firstValueFrom(this.chatService.editMessage(this.message));
    return true;
  }

  async sendNewMessage(): Promise<boolean> {
    if (!this.input.trim() && !this.attachments.length) return false;

    let newMessage: ChatMessage = {
      type: 'md',
      text: this.input,
      file: undefined,
    };

    this.message = await firstValueFrom(this.chatService.addMessage(newMessage));

    if (!this.message) {
      throw new Error();
    }

    return true;
  }

  closeDialog() {
    this.dialogRef.close();
  }

  removeAttachment(attachment: Attachment) {
    this.attachments = this.attachments.filter((file) => file !== attachment);
    this.input = this.input.replaceAll(attachment.embedded ?? '', '');
  }
}
