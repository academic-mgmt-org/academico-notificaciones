import { Module } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [],
  providers: [EmailSenderService, NotificationsService],
  exports: [EmailSenderService, NotificationsService],
})
export class NotificationsModule {}
