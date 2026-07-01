import { BadRequestException } from '@nestjs/common';

export const NOTIFICATION_STATES = Object.freeze([
  'no_leido',
  'leido',
  'archivado',
]);

export const NOTIFICATION_PRIORITIES = Object.freeze([
  'baja',
  'normal',
  'alta',
  'critica',
]);

export const NOTIFICATION_TYPE_ICONS = Object.freeze({
  calificacion: 'i-list',
  solicitud: 'i-list',
  matricula: 'i-network',
  recordatorio: 'i-calendar',
  sistema: 'i-bell',
});

function pickFirst(source, fields) {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      return source[field];
    }
  }

  return undefined;
}

function assignIfDefined(target, key, value) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeRequiredString(value, message) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new BadRequestException(message);
  }
  return normalized;
}

function normalizeRequiredEmail(value, message) {
  const normalized = normalizeRequiredString(value, message).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new BadRequestException(message);
  }
  return normalized;
}

function normalizeNumericString(value, message) {
  const normalized = normalizeRequiredString(value, message);
  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException(message);
  }
  return normalized;
}

export function normalizeNotificationState(state) {
  const normalized = normalizeOptionalString(state);
  if (!normalized) {
    return null;
  }

  if (!NOTIFICATION_STATES.includes(normalized)) {
    throw new BadRequestException('Estado de notificacion invalido');
  }

  return normalized;
}

export function normalizeNotificationPriority(priority) {
  const normalized = normalizeOptionalString(priority) || 'normal';
  return NOTIFICATION_PRIORITIES.includes(normalized) ? normalized : 'normal';
}

function normalizeLimit(limit, defaultLimit = 5) {
  const parsed = parseInt(limit ?? String(defaultLimit), 10);
  const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultLimit;
  return Math.min(Math.max(normalized, 1), 50);
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata }
    : {};
}

function normalizeEmailMetadata(metadata) {
  if (Array.isArray(metadata)) {
    return metadata.reduce((acc, item) => {
      const key = normalizeOptionalString(item?.key);
      if (key) {
        acc[key] = item?.value === undefined ? '' : String(item.value);
      }
      return acc;
    }, {});
  }

  return normalizeMetadata(metadata);
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function relativeNotificationTime(value, now = Date.now()) {
  const date = value ? new Date(value) : new Date(now);
  const seconds = Math.max(1, Math.floor((now - date.getTime()) / 1000));

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

export function defaultIconForType(type) {
  return NOTIFICATION_TYPE_ICONS[type] || NOTIFICATION_TYPE_ICONS.sistema;
}

export class NotificationRecipientDto {
  constructor({ usuarioId, email, identificacion }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
  }

  static from(value = {}, { user = null, preferUser = false } = {}) {
    if (value instanceof NotificationRecipientDto) {
      return value;
    }

    const requestUsuarioId = pickFirst(value, [
      'usuarioId',
      'usuario_id',
      'usuarioID',
      'userId',
      'user_id',
    ]);
    const authenticatedUsuarioId =
      user?.usuarioId ||
      user?.usuario_id ||
      user?.userId ||
      user?.user_id ||
      user?.sub;
    const rawUsuarioId = preferUser
      ? authenticatedUsuarioId || requestUsuarioId
      : requestUsuarioId || authenticatedUsuarioId;
    const usuarioId = rawUsuarioId
      ? normalizeNumericString(rawUsuarioId, 'Usuario destinatario invalido')
      : undefined;

    const rawEmail =
      pickFirst(value, ['email', 'correo', 'cuenta']) || user?.email || user?.cuenta;
    const email = normalizeOptionalString(rawEmail)?.toLowerCase();

    const rawIdentificacion =
      pickFirst(value, [
        'identificacion',
        'identifier',
        'cedula',
        'documento',
        'documentNumber',
        'document_number',
      ]) ||
      user?.identifier ||
      user?.identificacion ||
      user?.cedula;
    const identificacion = normalizeOptionalString(rawIdentificacion);

    return new NotificationRecipientDto({
      usuarioId,
      email,
      identificacion,
    });
  }
}

export class ListNotificationsRequestDto {
  constructor({ usuarioId, email, identificacion, estado, limit }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
    assignIfDefined(this, 'estado', estado);
    this.limit = limit;
  }

  static from(value = {}, { user = null, defaultLimit = 5 } = {}) {
    if (value instanceof ListNotificationsRequestDto) {
      return value;
    }

    const recipient = NotificationRecipientDto.from(value, {
      user,
      preferUser: Boolean(user),
    });

    return new ListNotificationsRequestDto({
      usuarioId: recipient.usuarioId,
      email: recipient.email,
      identificacion: recipient.identificacion,
      estado: normalizeNotificationState(
        pickFirst(value, ['estado', 'state', 'status']),
      ),
      limit: normalizeLimit(
        pickFirst(value, ['limit', 'limite', 'pageSize', 'page_size']),
        defaultLimit,
      ),
    });
  }
}

export class RecentNotificationsRequestDto extends ListNotificationsRequestDto {
  static from(value = {}, { user = null } = {}) {
    if (value instanceof RecentNotificationsRequestDto) {
      return value;
    }

    const request = ListNotificationsRequestDto.from(value, {
      user,
      defaultLimit: 3,
    });

    return new RecentNotificationsRequestDto(request);
  }
}

export class CountUnreadRequestDto {
  constructor({ usuarioId, email, identificacion }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
  }

  static from(value = {}, { user = null } = {}) {
    if (value instanceof CountUnreadRequestDto) {
      return value;
    }

    const recipient = NotificationRecipientDto.from(value, {
      user,
      preferUser: Boolean(user),
    });
    return new CountUnreadRequestDto(recipient);
  }
}

export class CreateNotificationRequestDto {
  constructor({
    usuarioId,
    email,
    identificacion,
    titulo,
    mensaje,
    tipo,
    canal,
    prioridad,
    iconId,
    metadata,
    source,
  }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
    this.titulo = titulo;
    this.mensaje = mensaje;
    this.tipo = tipo;
    this.canal = canal;
    this.prioridad = prioridad;
    this.iconId = iconId;
    this.metadata = metadata;
    this.source = source;
  }

  static from(value = {}, { user = null } = {}) {
    if (value instanceof CreateNotificationRequestDto) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Titulo y mensaje son requeridos');
    }

    const recipient = NotificationRecipientDto.from(value, { user });
    const titulo = normalizeRequiredString(
      pickFirst(value, ['titulo', 'title']),
      'Titulo y mensaje son requeridos',
    );
    const mensaje = normalizeRequiredString(
      pickFirst(value, ['mensaje', 'message', 'text']),
      'Titulo y mensaje son requeridos',
    );

    if (titulo.length > 150) {
      throw new BadRequestException('Titulo de notificacion supera 150 caracteres');
    }

    const tipo =
      normalizeOptionalString(pickFirst(value, ['tipo', 'type'])) || 'sistema';
    const canal =
      normalizeOptionalString(pickFirst(value, ['canal', 'channel'])) || 'in_app';
    const prioridad = normalizeNotificationPriority(
      pickFirst(value, ['prioridad', 'priority']),
    );
    const iconId =
      normalizeOptionalString(pickFirst(value, ['iconId', 'icon_id'])) ||
      defaultIconForType(tipo);
    const source =
      normalizeOptionalString(pickFirst(value, ['source', 'origen'])) ||
      'academico-notificaciones';
    const metadata = {
      ...normalizeMetadata(pickFirst(value, ['metadata', 'meta'])),
      iconId,
      source,
    };

    return new CreateNotificationRequestDto({
      usuarioId: recipient.usuarioId,
      email: recipient.email,
      identificacion: recipient.identificacion,
      titulo,
      mensaje,
      tipo,
      canal,
      prioridad,
      iconId,
      metadata,
      source,
    });
  }
}

export class MarkReadRequestDto {
  constructor({ id, usuarioId, email, identificacion }) {
    this.id = id;
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
  }

  static from(value = {}, { id = undefined, user = null } = {}) {
    if (value instanceof MarkReadRequestDto) {
      return value;
    }

    const notificationId = normalizeNumericString(
      id ?? pickFirst(value, ['id', 'notificationId', 'notification_id']),
      'Id de notificacion invalido',
    );
    const recipient = NotificationRecipientDto.from(value, {
      user,
      preferUser: Boolean(user),
    });

    return new MarkReadRequestDto({
      id: notificationId,
      usuarioId: recipient.usuarioId,
      email: recipient.email,
      identificacion: recipient.identificacion,
    });
  }
}

export class MarkAllReadRequestDto {
  constructor({ usuarioId, email, identificacion }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    assignIfDefined(this, 'email', email);
    assignIfDefined(this, 'identificacion', identificacion);
  }

  static from(value = {}, { user = null } = {}) {
    if (value instanceof MarkAllReadRequestDto) {
      return value;
    }

    const recipient = NotificationRecipientDto.from(value, {
      user,
      preferUser: Boolean(user),
    });
    return new MarkAllReadRequestDto(recipient);
  }
}

export class NotificationDto {
  constructor({
    id,
    usuarioId,
    titulo,
    mensaje,
    tipo,
    canal,
    prioridad,
    estado,
    leida,
    iconId,
    creadoEn,
    leidoEn,
    actualizadoEn,
    time,
    metadata,
  }) {
    this.id = String(id);
    this.usuarioId = String(usuarioId);
    this.titulo = titulo;
    this.mensaje = mensaje;
    this.text = mensaje;
    this.tipo = tipo;
    this.canal = canal;
    this.prioridad = prioridad;
    this.estado = estado;
    this.leida = Boolean(leida);
    this.iconId = iconId;
    this.icon_id = iconId;
    this.creadoEn = creadoEn;
    this.leidoEn = leidoEn;
    this.actualizadoEn = actualizadoEn;
    this.time = time;
    this.metadata = metadata || {};
  }

  static fromRow(row) {
    const metadata = row?.metadata || {};
    const iconId = metadata.iconId || defaultIconForType(row?.tipo);

    return new NotificationDto({
      id: row.id,
      usuarioId: row.usuario_id,
      titulo: row.titulo,
      mensaje: row.mensaje,
      tipo: row.tipo,
      canal: row.canal,
      prioridad: row.prioridad,
      estado: row.estado,
      leida: row.estado === 'leido',
      iconId,
      creadoEn: toIso(row.creado_en),
      leidoEn: toIso(row.leido_en),
      actualizadoEn: toIso(row.actualizado_en),
      time: relativeNotificationTime(row.creado_en),
      metadata,
    });
  }

  static from(value = {}) {
    if (value instanceof NotificationDto) {
      return value;
    }

    return new NotificationDto({
      id: pickFirst(value, ['id']),
      usuarioId: pickFirst(value, ['usuarioId', 'usuario_id']),
      titulo: pickFirst(value, ['titulo', 'title']),
      mensaje: pickFirst(value, ['mensaje', 'message', 'text']),
      tipo: pickFirst(value, ['tipo', 'type']),
      canal: pickFirst(value, ['canal', 'channel']),
      prioridad: pickFirst(value, ['prioridad', 'priority']),
      estado: pickFirst(value, ['estado', 'state', 'status']),
      leida: pickFirst(value, ['leida', 'read']),
      iconId: pickFirst(value, ['iconId', 'icon_id']),
      creadoEn: pickFirst(value, ['creadoEn', 'creado_en']),
      leidoEn: pickFirst(value, ['leidoEn', 'leido_en']),
      actualizadoEn: pickFirst(value, ['actualizadoEn', 'actualizado_en']),
      time: pickFirst(value, ['time']),
      metadata: pickFirst(value, ['metadata']),
    });
  }

  toConnect() {
    return {
      id: this.id,
      usuarioId: this.usuarioId,
      titulo: this.titulo,
      mensaje: this.mensaje,
      tipo: this.tipo,
      canal: this.canal,
      prioridad: this.prioridad,
      estado: this.estado,
      leida: this.leida,
      iconId: this.iconId,
      creadoEn: this.creadoEn || '',
      leidoEn: this.leidoEn || '',
    };
  }
}

export class ListNotificationsResponseDto {
  constructor({ notifications, unreadCount, usuarioId }) {
    this.notifications = notifications.map((notification) =>
      NotificationDto.from(notification),
    );
    this.unreadCount = Number(unreadCount || 0);
    assignIfDefined(this, 'usuarioId', usuarioId ? String(usuarioId) : undefined);
  }

  static from(value = {}) {
    if (value instanceof ListNotificationsResponseDto) {
      return value;
    }

    return new ListNotificationsResponseDto({
      notifications: value.notifications || [],
      unreadCount: value.unreadCount,
      usuarioId: value.usuarioId,
    });
  }

  toConnect() {
    return {
      notifications: this.notifications.map((notification) =>
        notification.toConnect(),
      ),
      unreadCount: this.unreadCount,
    };
  }
}

export class CountUnreadResponseDto {
  constructor({ unreadCount, usuarioId }) {
    this.unreadCount = Number(unreadCount || 0);
    assignIfDefined(this, 'usuarioId', usuarioId ? String(usuarioId) : undefined);
  }

  static from(value = {}) {
    if (value instanceof CountUnreadResponseDto) {
      return value;
    }

    return new CountUnreadResponseDto({
      unreadCount: value.unreadCount,
      usuarioId: value.usuarioId,
    });
  }

  toConnect() {
    return {
      unreadCount: this.unreadCount,
    };
  }
}

export class NotificationResponseDto {
  constructor({ success = true, notification }) {
    this.success = Boolean(success);
    this.notification = NotificationDto.from(notification);
  }

  static from(value = {}) {
    if (value instanceof NotificationResponseDto) {
      return value;
    }

    return new NotificationResponseDto(value);
  }

  toConnect() {
    return {
      success: this.success,
      notification: this.notification.toConnect(),
    };
  }
}

export class GenericNotificationResponseDto {
  constructor({ success = true, message, affected = 0 }) {
    this.success = Boolean(success);
    assignIfDefined(this, 'message', message);
    this.affected = Number(affected || 0);
  }

  static from(value = {}) {
    if (value instanceof GenericNotificationResponseDto) {
      return value;
    }

    return new GenericNotificationResponseDto(value);
  }

  toConnect() {
    return {
      success: this.success,
      message: this.message || '',
      affected: this.affected,
    };
  }
}

export class SendEmailRequestDto {
  constructor({
    usuarioId,
    toEmail,
    toName,
    subject,
    plainText,
    html,
    tipo,
    prioridad,
    source,
    metadata,
  }) {
    assignIfDefined(this, 'usuarioId', usuarioId);
    this.toEmail = toEmail;
    assignIfDefined(this, 'toName', toName);
    this.subject = subject;
    assignIfDefined(this, 'plainText', plainText);
    assignIfDefined(this, 'html', html);
    this.tipo = tipo;
    this.prioridad = prioridad;
    this.source = source;
    this.metadata = metadata;
  }

  static from(value = {}) {
    if (value instanceof SendEmailRequestDto) {
      return value;
    }

    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Datos de email requeridos');
    }

    const rawUsuarioId = pickFirst(value, [
      'usuarioId',
      'usuario_id',
      'userId',
      'user_id',
    ]);
    const usuarioId = rawUsuarioId
      ? normalizeNumericString(rawUsuarioId, 'Usuario destinatario invalido')
      : undefined;
    const toEmail = normalizeRequiredEmail(
      pickFirst(value, ['toEmail', 'to_email', 'email', 'correo', 'cuenta']),
      'Correo electronico invalido',
    );
    const toName = normalizeOptionalString(
      pickFirst(value, ['toName', 'to_name', 'nombre', 'name']),
    );
    const subject = normalizeRequiredString(
      pickFirst(value, ['subject', 'asunto', 'titulo']),
      'Asunto de email requerido',
    );
    const plainText = normalizeOptionalString(
      pickFirst(value, ['plainText', 'plain_text', 'text', 'body', 'mensaje']),
    );
    const html = normalizeOptionalString(pickFirst(value, ['html', 'htmlBody']));

    if (!plainText && !html) {
      throw new BadRequestException('Contenido de email requerido');
    }

    const tipo =
      normalizeOptionalString(pickFirst(value, ['tipo', 'type'])) || 'sistema';
    const prioridad = normalizeNotificationPriority(
      pickFirst(value, ['prioridad', 'priority']),
    );
    const source =
      normalizeOptionalString(pickFirst(value, ['source', 'origen'])) ||
      'academico-notificaciones';
    const metadata = {
      ...normalizeEmailMetadata(pickFirst(value, ['metadata', 'meta'])),
      source,
    };

    return new SendEmailRequestDto({
      usuarioId,
      toEmail,
      toName,
      subject,
      plainText,
      html,
      tipo,
      prioridad,
      source,
      metadata,
    });
  }

  metadataToConnect() {
    return Object.entries(this.metadata || {}).map(([key, value]) => ({
      key,
      value: value === undefined ? '' : String(value),
    }));
  }

  toConnect() {
    return {
      usuarioId: this.usuarioId || '',
      toEmail: this.toEmail,
      toName: this.toName || '',
      subject: this.subject,
      plainText: this.plainText || '',
      html: this.html || '',
      tipo: this.tipo,
      prioridad: this.prioridad,
      source: this.source,
      metadata: this.metadataToConnect(),
    };
  }
}

export class SendEmailResponseDto {
  constructor({ success = true, message, provider, messageId }) {
    this.success = Boolean(success);
    this.message = message || '';
    this.provider = provider || '';
    this.messageId = messageId || '';
  }

  static from(value = {}) {
    if (value instanceof SendEmailResponseDto) {
      return value;
    }

    return new SendEmailResponseDto({
      success: value.success,
      message: value.message,
      provider: value.provider,
      messageId: pickFirst(value, ['messageId', 'message_id']),
    });
  }

  toConnect() {
    return {
      success: this.success,
      message: this.message,
      provider: this.provider,
      messageId: this.messageId,
    };
  }
}
