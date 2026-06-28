import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import getPool from '../db';

const VALID_STATES = new Set(['no_leido', 'leido', 'archivado']);
const TYPE_TO_ICON = {
  calificacion: 'i-list',
  solicitud: 'i-list',
  matricula: 'i-network',
  recordatorio: 'i-calendar',
  sistema: 'i-bell',
};

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
    const explicitUserId = params.usuarioId || params.usuario_id || params.usuarioID;
    if (explicitUserId && /^\d+$/.test(String(explicitUserId))) {
      return Number(explicitUserId);
    }

    const email = params.email || user?.email || user?.cuenta;
    const identifier = params.identificacion || params.identifier || user?.identifier || user?.cedula;

    if (!email && !identifier) {
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
      [identifier || null, email || null],
    );

    if (!rows.length) {
      throw new NotFoundException('Usuario destinatario no encontrado');
    }

    return Number(rows[0].id);
  }

  async listForUser(user, query = {}) {
    const usuarioId = await this.resolveUser(user, query);
    await this.ensureDemoNotifications(usuarioId);

    const state = this.normalizeState(query.estado);
    const limit = Math.min(Math.max(parseInt(query.limit || '5', 10) || 5, 1), 50);
    const params = [usuarioId, limit];
    let where = 'usuario_id = $1';

    if (state) {
      params.push(state);
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

    return {
      notifications: rows.map((row) => this.mapRow(row)),
      unreadCount: unread,
      usuarioId: String(usuarioId),
    };
  }

  async recentForUser(user, query = {}) {
    return this.listForUser(user, {
      ...query,
      limit: query.limit || 3,
    });
  }

  async countUnread(user, query = {}) {
    const usuarioId = await this.resolveUser(user, query);
    await this.ensureDemoNotifications(usuarioId);
    return {
      unreadCount: await this.countUnreadForUserId(usuarioId),
      usuarioId: String(usuarioId),
    };
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
    const usuarioId = await this.resolveUser(actor, payload);
    const title = String(payload.titulo || payload.title || '').trim();
    const message = String(payload.mensaje || payload.message || '').trim();

    if (!title || !message) {
      throw new BadRequestException('Titulo y mensaje son requeridos');
    }

    const type = String(payload.tipo || payload.type || 'sistema').trim() || 'sistema';
    const channel = String(payload.canal || payload.channel || 'in_app').trim() || 'in_app';
    const priority = this.normalizePriority(payload.prioridad || payload.priority);
    const iconId = payload.iconId || payload.icon_id || TYPE_TO_ICON[type] || TYPE_TO_ICON.sistema;
    const metadata = {
      ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
      iconId,
      source: payload.source || 'academico-notificaciones',
    };

    const { rows } = await this.pool.query(
      `
      INSERT INTO academico.notificaciones (
        usuario_id, titulo, mensaje, tipo, canal, prioridad, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
      `,
      [usuarioId, title, message, type, channel, priority, JSON.stringify(metadata)],
    );

    return this.mapRow(rows[0]);
  }

  async markAsRead(id, user, query = {}) {
    const usuarioId = await this.resolveUser(user, query);
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
      [id, usuarioId],
    );

    if (!rows.length) {
      throw new NotFoundException('Notificacion no encontrada');
    }

    return this.mapRow(rows[0]);
  }

  async markAllAsRead(user, query = {}) {
    const usuarioId = await this.resolveUser(user, query);
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

    return {
      success: true,
      affected: result.rowCount,
      message: 'Notificaciones marcadas como leidas',
    };
  }

  normalizeState(state) {
    if (!state) {
      return null;
    }
    const normalized = String(state).trim();
    if (!VALID_STATES.has(normalized)) {
      throw new BadRequestException('Estado de notificacion invalido');
    }
    return normalized;
  }

  normalizePriority(priority) {
    const normalized = String(priority || 'normal').trim();
    return ['baja', 'normal', 'alta', 'critica'].includes(normalized)
      ? normalized
      : 'normal';
  }

  mapRow(row) {
    const metadata = row.metadata || {};
    return {
      id: String(row.id),
      usuarioId: String(row.usuario_id),
      titulo: row.titulo,
      mensaje: row.mensaje,
      text: row.mensaje,
      tipo: row.tipo,
      canal: row.canal,
      prioridad: row.prioridad,
      estado: row.estado,
      leida: row.estado === 'leido',
      iconId: metadata.iconId || TYPE_TO_ICON[row.tipo] || TYPE_TO_ICON.sistema,
      icon_id: metadata.iconId || TYPE_TO_ICON[row.tipo] || TYPE_TO_ICON.sistema,
      creadoEn: this.toIso(row.creado_en),
      leidoEn: this.toIso(row.leido_en),
      actualizadoEn: this.toIso(row.actualizado_en),
      time: this.relativeTime(row.creado_en),
      metadata,
    };
  }

  toIso(value) {
    return value ? new Date(value).toISOString() : null;
  }

  relativeTime(value) {
    const date = value ? new Date(value) : new Date();
    const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));

    if (seconds < 60) {
      return 'Hace instantes';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `Hace ${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
    }

    const days = Math.floor(hours / 24);
    return `Hace ${days} dia${days === 1 ? '' : 's'}`;
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
