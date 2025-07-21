import { Injectable } from '@angular/core';

export interface Ad {
  src: string;
  width: number; // Width in pixels
}

@Injectable({
  providedIn: 'root'
})
export class AdsService {

  constructor() { }
  private ads: Ad = {
    src: '',
    width: 0,
  };

  async getAds(): Promise<Ad> {
    return this.ads;
  }
}
