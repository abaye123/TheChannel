import { Component } from '@angular/core';
import { ChatComponent } from "../chat/chat.component";
import { AdvertisingComponent } from "../advertising/advertising.component";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-channel',
  imports: [
    ChatComponent,
    AdvertisingComponent,
    CommonModule
  ],
  templateUrl: './channel.component.html',
  styleUrl: './channel.component.scss'
})
export class ChannelComponent {

  constructor() { }
  advertisingEnabled: boolean = true;

}
