import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    NbCardModule,
    NbButtonModule,
    NbIconModule,
    NbSpinnerModule,
    NbAlertModule,
    NbListModule,
    NbUserModule
} from '@nebular/theme';
import { SearchService, SearchResponse } from '../../../services/search.service';
import { MessageComponent } from '../../channel/chat/message/message.component';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ChatService } from '../../../services/chat.service';

@Component({
    selector: 'app-search-results',
    standalone: true,
    imports: [
        CommonModule,
        NbCardModule,
        NbButtonModule,
        NbIconModule,
        NbSpinnerModule,
        NbAlertModule,
        NbListModule,
        NbUserModule,
        MessageComponent
    ],
    templateUrl: './search-results.component.html',
    styleUrls: ['./search-results.component.scss']
})
export class SearchResultsComponent implements OnInit, OnDestroy {
    searchResults: SearchResponse | null = null;
    isSearching = false;
    loadingMore = false;
    currentPage = 1;
    pageSize = 20;

    private subscriptions: Subscription[] = [];

    constructor(
        private searchService: SearchService,
        public authService: AuthService,
        public chatService: ChatService
    ) { }

    ngOnInit() {
        this.subscriptions.push(
            this.searchService.searchResultsObservable.subscribe(
                (results: SearchResponse | null) => {
                    this.searchResults = results;
                    if (results) {
                        this.currentPage = Math.floor((results.results.length - 1) / this.pageSize) + 1 || 1;
                    }
                }
            )
        );

        this.subscriptions.push(
            this.searchService.isSearchingObservable.subscribe(
                (isSearching: boolean) => this.isSearching = isSearching
            )
        );
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    get totalPages(): number {
        if (!this.searchResults) return 0;
        return Math.ceil(this.searchResults.total / this.pageSize);
    }

    async nextPage() {
        if (!this.searchResults || !this.searchResults.hasMore) return;

        this.loadingMore = true;
        try {
            const offset = this.currentPage * this.pageSize;
            await this.searchService.search({
                query: this.searchResults.query,
                mode: 'simple',
                limit: this.pageSize,
                offset
            });
            this.currentPage++;
            this.scrollToTop();
        } catch (error) {
            console.error('Failed to load next page:', error);
        } finally {
            this.loadingMore = false;
        }
    }

    async previousPage() {
        if (this.currentPage <= 1) return;

        this.loadingMore = true;
        try {
            const offset = (this.currentPage - 2) * this.pageSize;
            await this.searchService.search({
                query: this.searchResults!.query,
                mode: 'simple',
                limit: this.pageSize,
                offset
            });
            this.currentPage--;
            this.scrollToTop();
        } catch (error) {
            console.error('Failed to load previous page:', error);
        } finally {
            this.loadingMore = false;
        }
    }

    private scrollToTop() {
        const container = document.querySelector('.search-results-container');
        if (container) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    trackByMessageId(index: number, message: any): number {
        return message.id;
    }
}