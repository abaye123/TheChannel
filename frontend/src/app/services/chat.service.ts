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
  threadCount?: number;
}

export interface MessageMetadata {
  scannedRange: {
    minId: number;
    maxId: number;
  };
  requestedStart: number;
  direction: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  metadata: MessageMetadata;
}

export type ChatResponse = MessagesResponse;

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

  private threadVisible = new BehaviorSubject<boolean>(false);
  threadVisibleObservable = this.threadVisible.asObservable();

  private currentThreadMessage = new BehaviorSubject<ChatMessage | undefined>(undefined);
  currentThreadMessageObservable = this.currentThreadMessage.asObservable();

  private threadMessages = new BehaviorSubject<ChatMessage[]>([]);
  threadMessagesObservable = this.threadMessages.asObservable();

  private threadMessageEdit = new BehaviorSubject<ChatMessage | undefined>(undefined);
  threadMessageEditObservable = this.threadMessageEdit.asObservable();

  // Optimistic UI support
  private lastSentMessage: ChatMessage | null = null;
  private optimisticMessage = new Subject<ChatMessage>();
  optimisticMessageObservable = this.optimisticMessage.asObservable();

  // SSE connection status
  private sseConnected = new BehaviorSubject<boolean>(true);
  sseConnectedObservable = this.sseConnected.asObservable();
  private lastHeartbeatTime: number = Date.now();

  // Scroll to message request
  private scrollToMessageRequest = new Subject<{ messageId: number, highlight: boolean }>();
  scrollToMessageRequestObservable = this.scrollToMessageRequest.asObservable();

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
      this.sseConnected.next(true);
      this.lastHeartbeatTime = Date.now();
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      this.sseConnected.next(false);
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

  getThreadReplies(messageId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`/api/thread/${messageId}`);
  }

  openThread(message: ChatMessage) {
    console.log('ChatService: Opening thread for message', message);
    this.currentThreadMessage.next(message);
    this.threadVisible.next(true);
    console.log('ChatService: Thread visibility set to true');
    this.loadThreadMessages(message.id!);
  }

  closeThread() {
    this.threadVisible.next(false);
    this.currentThreadMessage.next(undefined);
    this.threadMessages.next([]);
    this.threadMessageEdit.next(undefined);
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

  setEditThreadMessage(message?: ChatMessage) {
    this.threadMessageEdit.next(message);
  }

  getEditThreadMessage(): ChatMessage | undefined {
    return this.threadMessageEdit.value;
  }

  clearEditThreadMessage() {
    this.threadMessageEdit.next(undefined);
  }

  updateThreadMessage(updatedMessage: ChatMessage) {
    const currentMessages = this.threadMessages.value;
    const messageIndex = currentMessages.findIndex(m => m.id === updatedMessage.id);

    if (messageIndex !== -1) {
      const newMessages = [...currentMessages];
      newMessages[messageIndex] = updatedMessage;
      this.threadMessages.next(newMessages);
    }
  }

  deleteThreadMessage(messageId: number) {
    const currentMessages = this.threadMessages.value;
    const updatedMessages = currentMessages.filter(m => m.id !== messageId);
    this.threadMessages.next(updatedMessages);
  }

  // Optimistic UI methods
  setLastSentMessage(message: ChatMessage) {
    this.lastSentMessage = message;
  }

  getLastSentMessage(): ChatMessage | null {
    return this.lastSentMessage;
  }

  addOptimisticMessage(message: ChatMessage) {
    this.optimisticMessage.next(message);
  }

  // SSE connection methods
  updateHeartbeat() {
    this.lastHeartbeatTime = Date.now();
    if (!this.sseConnected.value) {
      this.sseConnected.next(true);
    }
  }

  getLastHeartbeatTime(): number {
    return this.lastHeartbeatTime;
  }

  setConnectionStatus(connected: boolean) {
    this.sseConnected.next(connected);
  }

  isConnected(): boolean {
    return this.sseConnected.value;
  }

  requestScrollToMessage(messageId: number, highlight: boolean = false) {
    this.scrollToMessageRequest.next({ messageId, highlight });
  }
}
