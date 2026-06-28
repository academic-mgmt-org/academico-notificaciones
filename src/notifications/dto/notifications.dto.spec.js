import { BadRequestException } from '@nestjs/common';
import {
  CreateNotificationRequestDto,
  ListNotificationsRequestDto,
  MarkReadRequestDto,
  NotificationDto,
  NotificationResponseDto,
  RecentNotificationsRequestDto,
} from './notifications.dto';

describe('Notifications DTOs', () => {
  it('normaliza ListNotificationsRequestDto con aliases y limite seguro', () => {
    const dto = ListNotificationsRequestDto.from({
      userId: '15',
      status: 'no_leido',
      page_size: '100',
    });

    expect(dto).toMatchObject({
      usuarioId: '15',
      estado: 'no_leido',
      limit: 50,
    });
  });

  it('usa limite por defecto de recientes', () => {
    expect(RecentNotificationsRequestDto.from({ usuario_id: '9' })).toMatchObject({
      usuarioId: '9',
      limit: 3,
    });
  });

  it('normaliza CreateNotificationRequestDto desde camelCase y snake_case', () => {
    const dto = CreateNotificationRequestDto.from({
      usuario_id: '7',
      title: ' Solicitud aprobada ',
      message: ' Tu solicitud fue aprobada ',
      type: 'solicitud',
      priority: 'desconocida',
      icon_id: 'i-list',
      metadata: { requestId: '123' },
    });

    expect(dto).toMatchObject({
      usuarioId: '7',
      titulo: 'Solicitud aprobada',
      mensaje: 'Tu solicitud fue aprobada',
      tipo: 'solicitud',
      canal: 'in_app',
      prioridad: 'normal',
      iconId: 'i-list',
      metadata: {
        requestId: '123',
        iconId: 'i-list',
        source: 'academico-notificaciones',
      },
    });
  });

  it('rechaza CreateNotificationRequestDto sin datos obligatorios', () => {
    expect(() => CreateNotificationRequestDto.from({ titulo: 'Aviso' }))
      .toThrow(BadRequestException);
  });

  it('valida estado e id de notificacion', () => {
    expect(() => ListNotificationsRequestDto.from({ estado: 'pendiente' }))
      .toThrow(BadRequestException);
    expect(() => MarkReadRequestDto.from({ id: 'abc', usuarioId: '1' }))
      .toThrow(BadRequestException);
  });

  it('mapea NotificationDto desde fila SQL y salida Connect', () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-28T12:00:00Z').getTime());

    const dto = NotificationDto.fromRow({
      id: 1,
      usuario_id: 7,
      titulo: 'Nueva calificacion publicada',
      mensaje: 'Nueva calificacion publicada en Base de Datos',
      tipo: 'calificacion',
      canal: 'in_app',
      prioridad: 'normal',
      estado: 'no_leido',
      metadata: { iconId: 'i-list' },
      creado_en: new Date('2026-06-28T10:00:00Z'),
      leido_en: null,
      actualizado_en: new Date('2026-06-28T10:00:00Z'),
    });

    expect(dto).toMatchObject({
      id: '1',
      usuarioId: '7',
      iconId: 'i-list',
      icon_id: 'i-list',
      leida: false,
      time: 'Hace 2 horas',
    });
    expect(NotificationResponseDto.from({ notification: dto }).toConnect())
      .toMatchObject({
        success: true,
        notification: {
          id: '1',
          usuarioId: '7',
          iconId: 'i-list',
          creadoEn: '2026-06-28T10:00:00.000Z',
          leidoEn: '',
        },
      });

    Date.now.mockRestore();
  });
});
