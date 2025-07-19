import { Component } from '@angular/core';
import { ChatComponent } from "../chat/chat.component";
import { AdvertisingComponent } from "../advertising/advertising.component";

@Component({
  selector: 'app-channel',
  imports: [
    ChatComponent,
    AdvertisingComponent
  ],
  templateUrl: './channel.component.html',
  styleUrl: './channel.component.scss'
})
export class ChannelComponent {

}
