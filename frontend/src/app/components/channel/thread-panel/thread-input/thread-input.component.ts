import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpEventType } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { firstValueFrom, Subscription } from "rxjs";
import {
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbFormFieldModule,
    NbIconModule,
    NbInputModule,
    NbProgressBarModule,
    NbSpinnerModule,
    NbTagModule,
    NbToastrService,
    NbToggleModule
} from "@nebular/theme";
import { MarkdownComponent } from "ngx-markdown";
import { NgIconsModule } from "@ng-icons/core";
import { Attachment, ChatFile, ChatMessage, ChatService } from '../../../../services/chat.service';
import { AdminService } from '../../../../services/admin.service';
import { AutosizeModule } from "ngx-autosize";

@Component({
    selector: 'app-thread-input',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        NbInputModule,
        NbIconModule,
        NbButtonModule,
        NbProgressBarModule,
        NbCardModule,
        NbFormFieldModule,
        NbToggleModule,
        NbSpinnerModule,
        MarkdownComponent,
        NbTagModule,
        NbAlertModule,
        NgIconsModule,
        AutosizeModule,
    ],
    templateUrl: './thread-input.component.html',
    styleUrl: './thread-input.component.scss'
})
export class ThreadInputComponent implements OnInit, OnDestroy {

    protected readonly maxMessageLength: number = 4096;

    @Input() threadMessage?: ChatMessage;

    attachments: Attachment[] = [];
    input: string = '';
    isSending: boolean = false;
    showMarkdownPreview: boolean = false;
    hasScrollbar: boolean = false;

    editingMessage?: ChatMessage;
    isEditing: boolean = false;

    @ViewChild('inputTextArea') inputTextArea!: ElementRef<HTMLTextAreaElement>;

    @Output() messageSent = new EventEmitter<void>();

    private subscriptions: Subscription[] = [];

    constructor(
        private adminService: AdminService,
        private toastrService: NbToastrService,
        private chatService: ChatService,
    ) { }

    @HostListener('keydown', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            this.sendMessage();
        }
    }

    ngOnInit() {
        this.subscriptions.push(
            this.chatService.threadMessageEditObservable.subscribe((message?: ChatMessage) => {
                if (message) {
                    this.startEditingMessage(message);
                } else {
                    this.cancelEditing();
                }
            })
        );

        this.subscriptions.push(
            this.chatService.replyToMessageObservable.subscribe((replyMessage?: ChatMessage) => {
                if (replyMessage?.isThread) {
                    setTimeout(() => {
                        this.inputTextArea?.nativeElement.focus();
                    }, 100);
                }
            })
        );

        setTimeout(() => {
            this.inputTextArea?.nativeElement.focus();
        }, 100);
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    startEditingMessage(message: ChatMessage) {
        this.editingMessage = message;
        this.isEditing = true;
        this.input = message.text || '';
        this.showMarkdownPreview = false;

        setTimeout(() => {
            this.inputTextArea?.nativeElement.focus();
        }, 100);
    }

    cancelEditing() {
        this.editingMessage = undefined;
        this.isEditing = false;
        this.input = '';
        this.attachments = [];
        this.showMarkdownPreview = false;

        this.chatService.clearEditThreadMessage();
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

            this.adminService.uploadFile(formData).subscribe({
                next: (event) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        attachment.uploadProgress = Math.round((event.loaded / (event.total || 1)) * 100);
                    } else if (event.type === HttpEventType.Response) {
                        const uploadedFile: ChatFile | null = event.body || null;
                        let embedded = '';

                        if (!uploadedFile) return;
                        if (uploadedFile?.filetype === 'image') {
                            embedded = `[image-embedded#](${uploadedFile.url})`;
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

            if (!this.input.trim() && !this.attachments.length) {
                this.isSending = false;
                return;
            }

            if (this.isEditing) {
                await this.updateMessage();
            } else {
                await this.sendNewMessage();
            }

        } catch (error) {
            this.toastrService.danger("", this.isEditing ? "שגיאה בעריכת הודעה" : "שגיאה בשליחת תגובה");
        } finally {
            this.isSending = false;
        }
    }

    async updateMessage(): Promise<void> {
        if (!this.editingMessage) return;

        this.editingMessage.text = this.input;
        this.editingMessage.deleted = false;

        await firstValueFrom(this.adminService.editMessage(this.editingMessage));

        this.toastrService.success("", "הודעה נערכה בהצלחה");
        this.clearInputs();
        this.cancelEditing();
        this.messageSent.emit();
    }

    async sendNewMessage(): Promise<void> {
        if (!this.threadMessage?.id) {
            this.toastrService.danger("", "שגיאה: לא נמצא שרשור פתוח");
            return;
        }

        let newMessage: ChatMessage = {
            type: 'md',
            text: this.input,
            file: undefined,
            replyTo: this.threadMessage.id,
            isThread: true
        };

        const result = await firstValueFrom(this.adminService.addMessage(newMessage));

        if (!result) {
            throw new Error();
        }

        this.toastrService.success("", "תגובה נשלחה בהצלחה");
        this.clearInputs();
        this.messageSent.emit();
    }

    async clearInputs() {
        this.input = '';
        this.attachments = [];
        this.showMarkdownPreview = false;

        setTimeout(() => {
            this.inputTextArea?.nativeElement.focus();
        }, 100);
    }

    removeAttachment(attachment: Attachment) {
        this.attachments = this.attachments.filter((file) => file !== attachment);
        this.input = this.input.replaceAll(attachment.embedded ?? '', '');
    }

    openMarkdownDocs() {
        let markdownDocsUrl = 'https://www.markdownguide.org/basic-syntax/';
        window.open(markdownDocsUrl, '_blank');
    }

    checkScrollbar() {
        if (this.inputTextArea?.nativeElement) {
            const textarea = this.inputTextArea.nativeElement;
            this.hasScrollbar = textarea.scrollHeight > textarea.clientHeight;
        }
    }

    applyFormat(format: 'bold' | 'italic' | 'underline' | 'code') {
        const textArea = this.inputTextArea.nativeElement;
        const start = textArea.selectionStart;
        const end = textArea.selectionEnd;
        const selectedText = this.input.substring(start, end);

        let prefix = '';
        let suffix = '';
        let placeholder = '';

        switch (format) {
            case 'bold':
                prefix = '**';
                suffix = '**';
                placeholder = 'טקסט מודגש';
                break;
            case 'italic':
                prefix = '*';
                suffix = '*';
                placeholder = 'טקסט נטוי';
                break;
            case 'underline':
                prefix = '<u>';
                suffix = '</u>';
                placeholder = 'טקסט עם קו תחתון';
                break;
            case 'code':
                prefix = '```\n';
                suffix = '\n```';
                placeholder = 'קוד';
                const before = this.input.substring(0, start);
                const after = this.input.substring(end);
                if (start > 0 && before.charAt(start - 1) !== '\n') {
                    prefix = '\n' + prefix;
                }
                if (end < this.input.length && after.charAt(0) !== '\n') {
                    suffix = suffix + '\n';
                }
                break;
        }

        let newText = '';
        let cursorPos = start + prefix.length;

        if (selectedText) {
            newText = prefix + selectedText + suffix;
            this.input = this.input.substring(0, start) + newText + this.input.substring(end);
            setTimeout(() => {
                textArea.selectionStart = start;
                textArea.selectionEnd = start + newText.length;
                textArea.focus();
            });
        } else {
            newText = prefix + placeholder + suffix;
            this.input = this.input.substring(0, start) + newText + this.input.substring(end);
            setTimeout(() => {
                if (format === 'code') {
                    cursorPos = start + prefix.length;
                } else {
                    cursorPos = start + prefix.length;
                }
                textArea.selectionStart = cursorPos;
                textArea.selectionEnd = cursorPos + placeholder.length;
                textArea.focus();
            });
        }
    }

    getButtonText(): string {
        return this.isEditing ? 'עדכן הודעה' : 'שלח תגובה';
    }

    getPlaceholderText(): string {
        return this.isEditing ? 'ערוך הודעה...' : 'הקלד תגובה לשרשור... (Ctrl+Enter לשליחה)';
    }
}