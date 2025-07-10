import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { Channel } from '../models/channel.model';
import { ResponseResult } from './auth.service';

export type MessageType = 'md' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'other';
export type Reactions = { [key: string]: number }
export interface ChatMessage {
  id?: number;
  type?: MessageType;
  text?: string;
  timestamp?: Date;
  userId?: number | null;
  author?: string;
  lastEdit?: boolean;
  deleted?: boolean;
  file?: ChatFile;
  views?: number;
  reactions?: Reactions;
}
export interface ChatResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

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

  constructor(private http: HttpClient) { }

  getChannelInfo() {
    return this.http.get<Channel>('/api/channel/info');
  }

  editChannelInfo(name: string, description: string, logoUrl: string): Observable<ResponseResult> {
    return this.http.post<ResponseResult>('/api/admin/edit-channel-info', { name, description, logoUrl });
  }

  getMessages(offset: number, limit: number): Observable<ChatResponse> {
    return this.http.get<ChatResponse>('/api/messages', {
      params: {
        offset: offset.toString(),
        limit: limit.toString()
      }
    });
  }

  setReact(messageId: number, react: string) {
    return firstValueFrom(this.http.post<ResponseResult>('/api/reactions/set-reactions', { messageId, emoji: react }));
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
}
