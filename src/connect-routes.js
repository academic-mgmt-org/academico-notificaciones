import { ConnectError, Code } from '@connectrpc/connect';
import {
  EmailService,
  HealthService,
  NotificationService,
} from './gen/notificaciones/v1/notificaciones_pb.js';
import { NotificationsService } from './notifications/notifications.service.js';
import {
  CountUnreadRequestDto,
  CountUnreadResponseDto,
  CreateNotificationRequestDto,
  ListNotificationsRequestDto,
  ListNotificationsResponseDto,
  MarkAllReadRequestDto,
  MarkReadRequestDto,
  NotificationResponseDto,
  RecentNotificationsRequestDto,
  SendEmailRequestDto,
  SendEmailResponseDto,
} from './notifications/dto/notifications.dto.js';

/**
 * ConnectRPC routes definitions for this service.
 * @param {import('@connectrpc/connect').ConnectRouter} router
 * @param {import('@nestjs/common').INestApplication} app
 */
export default (router, app) => {
  const notificationsService = app.get(NotificationsService);

  router.service(NotificationService, {
    async listNotifications(req) {
      return withConnectErrors(async () => {
        const request = ListNotificationsRequestDto.from(req);
        const result = await notificationsService.listForUser(null, request);

        return ListNotificationsResponseDto.from(result).toConnect();
      });
    },

    async recentNotifications(req) {
      return withConnectErrors(async () => {
        const request = RecentNotificationsRequestDto.from(req);
        const result = await notificationsService.recentForUser(null, request);

        return ListNotificationsResponseDto.from(result).toConnect();
      });
    },

    async countUnread(req) {
      return withConnectErrors(async () => {
        const request = CountUnreadRequestDto.from(req);
        const result = await notificationsService.countUnread(null, request);
        return CountUnreadResponseDto.from(result).toConnect();
      });
    },

    async createNotification(req) {
      return withConnectErrors(async () => {
        const request = CreateNotificationRequestDto.from(req);
        const notification = await notificationsService.createNotification(request);

        return NotificationResponseDto.from({ success: true, notification }).toConnect();
      });
    },

    async markAsRead(req) {
      return withConnectErrors(async () => {
        const request = MarkReadRequestDto.from(req);
        const notification = await notificationsService.markAsRead(
          request.id,
          null,
          request,
        );

        return NotificationResponseDto.from({ success: true, notification }).toConnect();
      });
    },

    async markAllAsRead(req) {
      return withConnectErrors(async () => {
        const request = MarkAllReadRequestDto.from(req);
        const result = await notificationsService.markAllAsRead(null, request);
        return result.toConnect();
      });
    },

  });

  router.service(EmailService, {
    async sendEmail(req) {
      return withConnectErrors(async () => {
        const request = SendEmailRequestDto.from(req);
        const result = await notificationsService.sendEmail(request);
        return SendEmailResponseDto.from(result).toConnect();
      });
    },
  });

  router.service(HealthService, {
    async health() {
      return {
        status: 'healthy',
        service: 'academico-notificaciones',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },

    async ready() {
      return {
        ready: true,
        timestamp: new Date().toISOString(),
      };
    },

    async live() {
      return {
        alive: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },
  });

  return router;
};

async function withConnectErrors(handler) {
  try {
    return await handler();
  } catch (err) {
    let code = Code.Internal;
    if (typeof err.getStatus === 'function') {
      const status = err.getStatus();
      if (status === 400) {
        code = Code.InvalidArgument;
      } else if (status === 401) {
        code = Code.Unauthenticated;
      } else if (status === 403) {
        code = Code.PermissionDenied;
      } else if (status === 404) {
        code = Code.NotFound;
      }
    }

    const message = err?.response?.message || err?.message || 'Error interno del servidor';
    throw new ConnectError(Array.isArray(message) ? message.join(', ') : message, code);
  }
}
