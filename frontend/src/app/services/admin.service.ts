import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { lastValueFrom, Observable } from 'rxjs';
import { ChatFile, ChatMessage } from './chat.service';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(
    private http: HttpClient,
  ) { }

  async getUsersAmount(): Promise<number> {
    try {
      const response = await lastValueFrom(this.http.get<{ amount: number }>('/api/admin/users-amount'));
      return response.amount;
    } catch (error) {
      throw error;
    }
  }

  addMessage(message: ChatMessage): Observable<ChatMessage> {
    return this.http.post<ChatMessage>('/api/admin/new', message);
  }

  editMessage(message: ChatMessage): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`/api/admin/edit-message`, message);
  }

  deleteMessage(id: number | undefined): Observable<ChatMessage> {
    return this.http.get<ChatMessage>(`/api/admin/delete-message/${id}`);
  }

  uploadFile(formData: FormData) {
    return this.http.post<ChatFile>('/api/admin/upload', formData, {
      reportProgress: true,
      observe: 'events',
      responseType: 'json'
    });
  }
}
