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

@Controller('api/v1/notificaciones')
@UseGuards(ApiKeyGuard, AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) notificationsService) {
    this.notificationsService = notificationsService;
  }

  @Get()
  async list(@User() user, @Query() query) {
    return this.notificationsService.listForUser(user, query);
  }

  @Get('recientes')
  async recent(@User() user, @Query() query) {
    return this.notificationsService.recentForUser(user, query);
  }

  @Get('contador')
  async count(@User() user, @Query() query) {
    return this.notificationsService.countUnread(user, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() payload, @User() user) {
    const notification = await this.notificationsService.createNotification(payload, user);
    return {
      success: true,
      notification,
    };
  }

  @Patch('leer-todas')
  async markAllAsRead(@User() user, @Query() query) {
    return this.notificationsService.markAllAsRead(user, query);
  }

  @Patch(':id/leer')
  async markAsRead(@Param('id') id, @User() user, @Query() query) {
    const notification = await this.notificationsService.markAsRead(id, user, query);
    return {
      success: true,
      notification,
    };
  }
}
