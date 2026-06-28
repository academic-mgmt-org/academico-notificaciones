import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import getPool from '../db';
import {
  CountUnreadRequestDto,
  CountUnreadResponseDto,
  CreateNotificationRequestDto,
  GenericNotificationResponseDto,
  ListNotificationsRequestDto,
  ListNotificationsResponseDto,
  MarkAllReadRequestDto,
  MarkReadRequestDto,
  NotificationDto,
  NotificationRecipientDto,
  RecentNotificationsRequestDto,
  normalizeNotificationPriority,
  normalizeNotificationState,
  relativeNotificationTime,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor() {
    this.pool = getPool();
  }

  async onModuleInit() {
    await this.ensureSchema();
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE SCHEMA IF NOT EXISTS academico;

      CREATE TABLE IF NOT EXISTS academico.notificaciones (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        usuario_id BIGINT NOT NULL,
        titulo VARCHAR(150) NOT NULL,
        mensaje TEXT NOT NULL,
        tipo VARCHAR(50) NOT NULL DEFAULT 'sistema',
        canal VARCHAR(30) NOT NULL DEFAULT 'in_app',
        prioridad VARCHAR(20) NOT NULL DEFAULT 'normal',
        estado VARCHAR(20) NOT NULL DEFAULT 'no_leido',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        leido_en TIMESTAMP NULL,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_notificaciones_estado
          CHECK (estado IN ('no_leido', 'leido', 'archivado')),
        CONSTRAINT chk_notificaciones_prioridad
          CHECK (prioridad IN ('baja', 'normal', 'alta', 'critica'))
      );

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'academico'
            AND table_name = 'usuarios'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = 'academico'
            AND table_name = 'notificaciones'
            AND constraint_name = 'fk_notificaciones_usuario'
        ) THEN
          ALTER TABLE academico.notificaciones
            ADD CONSTRAINT fk_notificaciones_usuario
            FOREIGN KEY (usuario_id)
            REFERENCES academico.usuarios(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
        ON academico.notificaciones(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_estado
        ON academico.notificaciones(estado);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_estado
        ON academico.notificaciones(usuario_id, estado);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_creado_en
        ON academico.notificaciones(creado_en DESC);
    `);
  }

  async resolveUser(user, params = {}) {
    const recipient = NotificationRecipientDto.from(params, { user });
    if (recipient.usuarioId) {
      return Number(recipient.usuarioId);
    }

    if (!recipient.email && !recipient.identificacion) {
      throw new BadRequestException('No se pudo resolver el usuario autenticado');
    }

    const { rows } = await this.pool.query(
      `
      SELECT id
      FROM academico.usuarios
      WHERE ($1::text IS NOT NULL AND identificacion = $1)
         OR ($2::text IS NOT NULL AND lower(email) = lower($2))
      ORDER BY id
      LIMIT 1
      `,
      [recipient.identificacion || null, recipient.email || null],
    );

    if (!rows.length) {
      throw new NotFoundException('Usuario destinatario no encontrado');
    }

    return Number(rows[0].id);
  }

  async listForUser(user, query = {}) {
    const request = ListNotificationsRequestDto.from(query, { user });
    const usuarioId = await this.resolveUser(user, request);
    await this.ensureDemoNotifications(usuarioId);

    const params = [usuarioId, request.limit];
    let where = 'usuario_id = $1';

    if (request.estado) {
      params.push(request.estado);
      where += ` AND estado = $${params.length}`;
    }

    const [{ rows }, unread] = await Promise.all([
      this.pool.query(
        `
        SELECT *
        FROM academico.notificaciones
        WHERE ${where}
        ORDER BY creado_en DESC
        LIMIT $2
        `,
        params,
      ),
      this.countUnreadForUserId(usuarioId),
    ]);

    return ListNotificationsResponseDto.from({
      notifications: rows.map((row) => this.mapRow(row)),
      unreadCount: unread,
      usuarioId: String(usuarioId),
    });
  }

  async recentForUser(user, query = {}) {
    const request = RecentNotificationsRequestDto.from(query, { user });
    return this.listForUser(user, request);
  }

  async countUnread(user, query = {}) {
    const request = CountUnreadRequestDto.from(query, { user });
    const usuarioId = await this.resolveUser(user, request);
    await this.ensureDemoNotifications(usuarioId);
    return CountUnreadResponseDto.from({
      unreadCount: await this.countUnreadForUserId(usuarioId),
      usuarioId: String(usuarioId),
    });
  }

  async countUnreadForUserId(usuarioId) {
    const { rows } = await this.pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM academico.notificaciones
      WHERE usuario_id = $1
        AND estado = 'no_leido'
      `,
      [usuarioId],
    );
    return Number(rows[0]?.total || 0);
  }

  async createNotification(payload = {}, actor = null) {
    const request = CreateNotificationRequestDto.from(payload, { user: actor });
    const usuarioId = await this.resolveUser(actor, request);

    const { rows } = await this.pool.query(
      `
      INSERT INTO academico.notificaciones (
        usuario_id, titulo, mensaje, tipo, canal, prioridad, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
      `,
      [
        usuarioId,
        request.titulo,
        request.mensaje,
        request.tipo,
        request.canal,
        request.prioridad,
        JSON.stringify(request.metadata),
      ],
    );

    return this.mapRow(rows[0]);
  }

  async markAsRead(id, user, query = {}) {
    const request = MarkReadRequestDto.from(query, { id, user });
    const usuarioId = await this.resolveUser(user, request);
    const { rows } = await this.pool.query(
      `
      UPDATE academico.notificaciones
      SET estado = 'leido',
          leido_en = COALESCE(leido_en, CURRENT_TIMESTAMP),
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
        AND usuario_id = $2
      RETURNING *
      `,
      [request.id, usuarioId],
    );

    if (!rows.length) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    return this.mapRow(rows[0]);
  }

  async markAllAsRead(user, query = {}) {
    const request = MarkAllReadRequestDto.from(query, { user });
    const usuarioId = await this.resolveUser(user, request);
    const result = await this.pool.query(
      `
      UPDATE academico.notificaciones
      SET estado = 'leido',
          leido_en = COALESCE(leido_en, CURRENT_TIMESTAMP),
          actualizado_en = CURRENT_TIMESTAMP
      WHERE usuario_id = $1
        AND estado = 'no_leido'
      `,
      [usuarioId],
    );

    return GenericNotificationResponseDto.from({
      success: true,
      affected: result.rowCount,
      message: 'Notificaciones marcadas como leidas',
    });
  }

  normalizeState(state) {
    return normalizeNotificationState(state);
  }

  normalizePriority(priority) {
    return normalizeNotificationPriority(priority);
  }

  mapRow(row) {
    return NotificationDto.fromRow(row);
  }

  toIso(value) {
    return value ? new Date(value).toISOString() : null;
  }

  relativeTime(value) {
    return relativeNotificationTime(value);
  }

  async ensureDemoNotifications(usuarioId) {
    if ((process.env.NOTIFICACIONES_AUTO_SEED || 'true') !== 'true') {
      return;
    }

    const { rows } = await this.pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM academico.notificaciones
      WHERE usuario_id = $1
      `,
      [usuarioId],
    );

    if (Number(rows[0]?.total || 0) > 0) {
      return;
    }

    const demoRows = [
      {
        titulo: 'Nueva calificacion publicada',
        mensaje: 'Nueva calificacion publicada en Base de Datos',
        tipo: 'calificacion',
        iconId: 'i-list',
        offset: "2 hours",
      },
      {
        titulo: 'Solicitud aprobada',
        mensaje: 'Tu solicitud de revision fue aprobada',
        tipo: 'solicitud',
        iconId: 'i-list',
        offset: "1 day",
      },
      {
        titulo: 'Recordatorio academico',
        mensaje: 'Recordatorio: Examen Parcial - Programacion I',
        tipo: 'recordatorio',
        iconId: 'i-calendar',
        offset: "2 days",
      },
    ];

    for (const item of demoRows) {
      await this.pool.query(
        `
        INSERT INTO academico.notificaciones (
          usuario_id, titulo, mensaje, tipo, metadata, creado_en
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP - $6::interval)
        `,
        [
          usuarioId,
          item.titulo,
          item.mensaje,
          item.tipo,
          JSON.stringify({ iconId: item.iconId, source: 'demo-seed' }),
          item.offset,
        ],
      );
    }
  }
}
