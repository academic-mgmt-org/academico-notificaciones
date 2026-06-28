import { ConnectError, Code } from '@connectrpc/connect';
import { NotificationService } from './gen/notificaciones/v1/notificaciones_pb.js';
import { NotificationsService } from './notifications/notifications.service.js';

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
        const result = await notificationsService.listForUser(null, {
          usuarioId: req.usuarioId,
          estado: req.estado,
          limit: req.limit || 5,
        });

        return {
          notifications: result.notifications,
          unreadCount: result.unreadCount,
        };
      });
    },

    async countUnread(req) {
      return withConnectErrors(async () => {
        return notificationsService.countUnread(null, {
          usuarioId: req.usuarioId,
        });
      });
    },

    async createNotification(req) {
      return withConnectErrors(async () => {
        const notification = await notificationsService.createNotification({
          usuarioId: req.usuarioId,
          email: req.email,
          identificacion: req.identificacion,
          titulo: req.titulo,
          mensaje: req.mensaje,
          tipo: req.tipo,
          canal: req.canal,
          prioridad: req.prioridad,
          iconId: req.iconId,
        });

        return {
          success: true,
          notification,
        };
      });
    },

    async markAsRead(req) {
      return withConnectErrors(async () => {
        const notification = await notificationsService.markAsRead(req.id, null, {
          usuarioId: req.usuarioId,
        });

        return {
          success: true,
          notification,
        };
      });
    },

    async markAllAsRead(req) {
      return withConnectErrors(async () => {
        return notificationsService.markAllAsRead(null, {
          usuarioId: req.usuarioId,
        });
      });
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
