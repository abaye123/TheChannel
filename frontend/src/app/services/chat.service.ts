import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, Subject } from 'rxjs';
import { Channel } from '../models/channel.model';
import { ResponseResult } from '../models/response-result.model';

export type MessageType = 'md' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'other';
export type Reactions = { [key: string]: number }
export interface ChatMessage {
  id?: number;
  type?: MessageType;
  text?: string;
  timestamp?: Date;
  userId?: number | null;
  author?: string;
  authorId?: string;
  last_edit?: Date;
  deleted?: boolean;
  file?: ChatFile;
  views?: number;
  reactions?: Reactions;
  replyTo?: number;
  isThread?: boolean;
  originalMessage?: ChatMessage;
  threadCount?: number; // הוספה חדשה
}

export type ChatResponse = ChatMessage[];

export interface ChatFile {
  url: string;
  filename: string;
  filetype: string;
}

export interface Attachment {
  file: File;
  url?: string;
  uploadProgress?: number;
  uploading?: boolean;
  embedded?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private eventSource!: EventSource;
  private emojis: string[] = [];
  public channelInfo?: Channel;

  private messageEdit = new BehaviorSubject<ChatMessage | undefined>(undefined);
  messageEditObservable = this.messageEdit.asObservable();

  private replyToMessage = new BehaviorSubject<ChatMessage | undefined>(undefined);
  replyToMessageObservable = this.replyToMessage.asObservable();

  // הוספת BehaviorSubjects לשרשורים
  private threadVisible = new BehaviorSubject<boolean>(false);
  threadVisibleObservable = this.threadVisible.asObservable();

  private currentThreadMessage = new BehaviorSubject<ChatMessage | undefined>(undefined);
  currentThreadMessageObservable = this.currentThreadMessage.asObservable();

  private threadMessages = new BehaviorSubject<ChatMessage[]>([]);
  threadMessagesObservable = this.threadMessages.asObservable();

  constructor(private http: HttpClient) { }

  async updateChannelInfo() {
    this.channelInfo = await firstValueFrom(this.http.get<Channel>('/api/channel/info'));
    return;
  }

  editChannelInfo(name: string, description: string, loginDescription: string, logoUrl: string): Observable<ResponseResult> {
    return this.http.post<ResponseResult>('/api/admin/edit-channel-info', {
      name,
      description,
      login_description: loginDescription,
      logoUrl
    });
  }

  getMessages(offset: number, limit: number, direction: string): Observable<ChatResponse> {
    return this.http.get<ChatResponse>('/api/messages', {
      params: {
        offset: offset.toString(),
        limit: limit.toString(),
        direction: direction
      }
    });
  }

  setReact(messageId: number, react: string) {
    return firstValueFrom(this.http.post<ResponseResult>('/api/reactions/set-reactions', { messageId, emoji: react }));
  }

  async getEmojisList(reload: boolean = false): Promise<string[]> {
    if (this.emojis && !reload) return Promise.resolve(this.emojis);
    this.emojis = await firstValueFrom(this.http.get<string[]>('/api/emojis/list'));
    return this.emojis;
  }

  reportMessage(messageId: number, reason: string): Promise<ResponseResult> {
    return firstValueFrom(this.http.post<ResponseResult>('/api/messages/report', { messageId, reason }));
  }

  sseListener(): EventSource {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/events');

    this.eventSource.onopen = () => {
      console.log('Connection opened');
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
    };

    return this.eventSource;
  }

  sseClose() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }

  setEditMessage(message?: ChatMessage) {
    this.messageEdit.next(message);
  }

  setReplyToMessage(message?: ChatMessage) {
    this.replyToMessage.next(message);
  }

  getReplyToMessage(): ChatMessage | undefined {
    return this.replyToMessage.value;
  }

  clearReplyToMessage() {
    this.replyToMessage.next(undefined);
  }

  findMessageById(messages: ChatMessage[], messageId: number): ChatMessage | undefined {
    return messages.find(m => m.id === messageId);
  }

  canEditMessage(message: ChatMessage, userId: string, editTimeLimit: number = 120): boolean {
    if (message.authorId !== userId) {
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

    return elapsedSeconds <= editTimeLimit;
  }

  // פונקציות שרשורים
  getThreadReplies(messageId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`/api/thread/${messageId}`);
  }

  openThread(message: ChatMessage) {
    this.currentThreadMessage.next(message);
    this.threadVisible.next(true);
    this.loadThreadMessages(message.id!);
  }

  closeThread() {
    this.threadVisible.next(false);
    this.currentThreadMessage.next(undefined);
    this.threadMessages.next([]);
  }

  isThreadVisible(): boolean {
    return this.threadVisible.value;
  }

  getCurrentThreadMessage(): ChatMessage | undefined {
    return this.currentThreadMessage.value;
  }

  async loadThreadMessages(messageId: number) {
    try {
      const messages = await firstValueFrom(this.getThreadReplies(messageId));
      this.threadMessages.next(messages);
    } catch (error) {
      console.error('Failed to load thread messages:', error);
    }
  }

  addThreadMessage(message: ChatMessage) {
    const currentMessages = this.threadMessages.value;
    this.threadMessages.next([...currentMessages, message]);
  }

  setReplyToThreadMessage(message?: ChatMessage) {
    const currentThread = this.getCurrentThreadMessage();
    if (currentThread && message) {
      const threadReply: ChatMessage = {
        ...message,
        replyTo: currentThread.id,
        isThread: true
      };
      this.setReplyToMessage(threadReply);
    } else {
      this.setReplyToMessage(message);
    }
  }
}