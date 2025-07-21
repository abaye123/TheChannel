import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-advertising',
  imports: [],
  templateUrl: './advertising.component.html',
  styleUrl: './advertising.component.scss'
})
export class AdvertisingComponent implements OnInit {

  @Input() src: string = '';
  sayfeUrl: SafeResourceUrl = '';

  constructor(
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit(): void {
    this.sayfeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.src);
  }
}
