import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../config/auth/guard/auth_guard';
import { ApiKeyGuard } from '../config/auth/guard/api_key_guard';
import { User } from '../config/auth/decorators/user';
import {
  CountUnreadRequestDto,
  CreateNotificationRequestDto,
  ListNotificationsRequestDto,
  MarkAllReadRequestDto,
  MarkReadRequestDto,
  NotificationResponseDto,
  RecentNotificationsRequestDto,
} from './dto/notifications.dto';

@Controller('api/v1/notificaciones')
@UseGuards(ApiKeyGuard, AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) notificationsService) {
    this.notificationsService = notificationsService;
  }

  @Get()
  async list(@User() user, @Query() query) {
    const request = ListNotificationsRequestDto.from(query, { user });
    return this.notificationsService.listForUser(user, request);
  }

  @Get('recientes')
  async recent(@User() user, @Query() query) {
    const request = RecentNotificationsRequestDto.from(query, { user });
    return this.notificationsService.recentForUser(user, request);
  }

  @Get('contador')
  async count(@User() user, @Query() query) {
    const request = CountUnreadRequestDto.from(query, { user });
    return this.notificationsService.countUnread(user, request);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() payload, @User() user) {
    const request = CreateNotificationRequestDto.from(payload, { user });
    const notification = await this.notificationsService.createNotification(request, user);
    return NotificationResponseDto.from({ success: true, notification });
  }

  @Patch('leer-todas')
  async markAllAsRead(@User() user, @Query() query) {
    const request = MarkAllReadRequestDto.from(query, { user });
    return this.notificationsService.markAllAsRead(user, request);
  }

  @Patch(':id/leer')
  async markAsRead(@Param('id') id, @User() user, @Query() query) {
    const request = MarkReadRequestDto.from(query, { id, user });
    const notification = await this.notificationsService.markAsRead(
      request.id,
      user,
      request,
    );
    return NotificationResponseDto.from({ success: true, notification });
  }
}
