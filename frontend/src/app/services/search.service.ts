// src/app/services/search.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ChatMessage } from './chat.service';

export interface SearchRequest {
    query: string;
    mode: 'simple' | 'advanced';
    limit?: number;
    offset?: number;
}

export interface SearchResponse {
    results: ChatMessage[];
    total: number;
    query: string;
    hasMore: boolean;
    tookMs: number;
}

@Injectable({
    providedIn: 'root'
})
export class SearchService {
    private searchVisible = new BehaviorSubject<boolean>(false);
    searchVisibleObservable = this.searchVisible.asObservable();

    private searchResults = new BehaviorSubject<SearchResponse | null>(null);
    searchResultsObservable = this.searchResults.asObservable();

    private isSearching = new BehaviorSubject<boolean>(false);
    isSearchingObservable = this.isSearching.asObservable();

    constructor(private http: HttpClient) { }

    openSearch() {
        this.searchVisible.next(true);
    }

    closeSearch() {
        this.searchVisible.next(false);
        this.clearResults();
    }

    isSearchVisible(): boolean {
        return this.searchVisible.value;
    }

    async search(request: SearchRequest): Promise<SearchResponse> {
        this.isSearching.next(true);
        try {
            const response = await firstValueFrom(
                this.http.post<SearchResponse>('/api/search', {
                    query: request.query,
                    mode: request.mode || 'simple',
                    limit: request.limit || 20,
                    offset: request.offset || 0
                })
            );
            this.searchResults.next(response);
            return response;
        } catch (error: any) {
            if (error.status === 429) {
                throw new Error('חרגת ממגבלת החיפושים. אנא המתן מעט ונסה שוב');
            } else if (error.status === 400) {
                throw new Error('שאילתה לא תקינה: ' + error.error);
            } else if (error.status === 401) {
                throw new Error('נדרשת התחברות לביצוע חיפוש');
            }
            throw new Error('שגיאה בביצוע החיפוש');
        } finally {
            this.isSearching.next(false);
        }
    }

    clearResults() {
        this.searchResults.next(null);
    }

    getCurrentResults(): SearchResponse | null {
        return this.searchResults.value;
    }
}