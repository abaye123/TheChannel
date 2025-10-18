import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    NbButtonModule,
    NbIconModule,
    NbInputModule,
    NbSelectModule,
    NbToastrService,
    NbSpinnerModule
} from '@nebular/theme';
import { SearchService } from '../../../services/search.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-search-header',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        NbButtonModule,
        NbIconModule,
        NbInputModule,
        NbSelectModule,
        NbSpinnerModule
    ],
    templateUrl: './search-header.component.html',
    styleUrls: ['./search-header.component.scss']
})
export class SearchHeaderComponent implements OnInit, OnDestroy {
    searchQuery = '';
    searchMode: 'simple' | 'advanced' = 'simple';
    isSearching = false;

    private subscriptions: Subscription[] = [];

    constructor(
        private searchService: SearchService,
        private toastrService: NbToastrService
    ) { }

    ngOnInit() {
        this.subscriptions.push(
            this.searchService.isSearchingObservable.subscribe(
                isSearching => this.isSearching = isSearching
            )
        );

        // פוקוס אוטומטי על שדה החיפוש
        setTimeout(() => {
            const input = document.querySelector('.search-input') as HTMLInputElement;
            if (input) {
                input.focus();
            }
        }, 100);
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    getPlaceholder(): string {
        if (this.searchMode === 'advanced') {
            return 'הזן ביטוי רגולרי (Regex)...';
        }
        return 'חפש הודעות...';
    }

    async performSearch() {
        if (!this.searchQuery.trim()) {
            return;
        }

        try {
            await this.searchService.search({
                query: this.searchQuery,
                mode: this.searchMode,
                limit: 20,
                offset: 0
            });
        } catch (error: any) {
            this.toastrService.danger('', error.message || 'שגיאה בביצוע החיפוש');
        }
    }

    clearSearch() {
        this.searchQuery = '';
        this.searchService.clearResults();
    }

    closeSearch() {
        this.searchService.closeSearch();
    }
}