import { Injectable } from '@angular/core';

export interface ThreadReadStatus {
  messageId: number;
  lastReadCount: number;
  lastReadTimestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class ThreadReadStatusService {
  private readonly STORAGE_KEY = 'thread_read_status';
  private threadStatusMap: Map<number, ThreadReadStatus> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored) as ThreadReadStatus[];
        data.forEach(status => {
          this.threadStatusMap.set(status.messageId, status);
        });
      }
    } catch (error) {
      console.error('Failed to load thread read status from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.threadStatusMap.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save thread read status to storage:', error);
    }
  }

  markThreadAsRead(messageId: number, currentCount: number): void {
    const status: ThreadReadStatus = {
      messageId,
      lastReadCount: currentCount,
      lastReadTimestamp: Date.now()
    };
    this.threadStatusMap.set(messageId, status);
    this.saveToStorage();
  }

  hasUnreadMessages(messageId: number, currentCount: number): boolean {
    const status = this.threadStatusMap.get(messageId);
    if (!status) {
      return currentCount > 0;
    }
    return currentCount > status.lastReadCount;
  }

  getUnreadCount(messageId: number, currentCount: number): number {
    const status = this.threadStatusMap.get(messageId);
    if (!status) {
      return currentCount;
    }
    const unread = currentCount - status.lastReadCount;
    return unread > 0 ? unread : 0;
  }

  getThreadStatus(messageId: number): ThreadReadStatus | undefined {
    return this.threadStatusMap.get(messageId);
  }

  cleanupOldStatuses(daysToKeep: number = 30): void {
    const now = Date.now();
    const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
    
    let hasChanges = false;
    this.threadStatusMap.forEach((status, messageId) => {
      if (now - status.lastReadTimestamp > maxAge) {
        this.threadStatusMap.delete(messageId);
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      this.saveToStorage();
    }
  }

  clearAll(): void {
    this.threadStatusMap.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
