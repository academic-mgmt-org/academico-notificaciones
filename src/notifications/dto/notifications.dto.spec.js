import { BadRequestException } from '@nestjs/common';
import {
  CountUnreadRequestDto,
  CreateNotificationRequestDto,
  ListNotificationsRequestDto,
  MarkReadRequestDto,
  NotificationDto,
  NotificationResponseDto,
  RecentNotificationsRequestDto,
  SendEmailRequestDto,
  SendEmailResponseDto,
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

  it('usa el usuario autenticado cuando la consulta no envia usuario_id', () => {
    const user = {
      userId: '42',
      email: 'estudiante@utn.edu.ec',
      identifier: '1002003004',
    };

    expect(ListNotificationsRequestDto.from({ limit: 10 }, { user }))
      .toMatchObject({
        usuarioId: '42',
        limit: 10,
      });
    expect(RecentNotificationsRequestDto.from({}, { user }))
      .toMatchObject({
        usuarioId: '42',
        limit: 3,
      });
    expect(CountUnreadRequestDto.from({}, { user }))
      .toMatchObject({
        usuarioId: '42',
      });
    expect(ListNotificationsRequestDto.from({ usuario_id: '99' }, { user }))
      .toMatchObject({
        usuarioId: '42',
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

  it('conserva destinatario explicito al crear notificaciones', () => {
    const dto = CreateNotificationRequestDto.from({
      usuario_id: '99',
      titulo: 'Aviso',
      mensaje: 'Contenido',
    }, {
      user: { userId: '42', email: 'estudiante@utn.edu.ec' },
    });

    expect(dto).toMatchObject({
      usuarioId: '99',
      titulo: 'Aviso',
      mensaje: 'Contenido',
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

  it('normaliza SendEmailRequestDto generico y respuesta Connect', () => {
    const request = SendEmailRequestDto.from({
      usuario_id: '7',
      to_email: ' ESTUDIANTE@UTN.EDU.EC ',
      to_name: ' Estudiante Prueba ',
      subject: ' Recuperacion de contraseña ',
      plain_text: 'Contenido en texto',
      html: '<p>Contenido HTML</p>',
      type: 'seguridad',
      priority: 'alta',
      source: 'academico-login',
      metadata: [
        { key: 'resetUrl', value: 'https://academico.test/reset?token=abc' },
        { key: 'expiresInMinutes', value: '45' },
      ],
    });

    expect(request).toMatchObject({
      usuarioId: '7',
      toEmail: 'estudiante@utn.edu.ec',
      toName: 'Estudiante Prueba',
      subject: 'Recuperacion de contraseña',
      plainText: 'Contenido en texto',
      html: '<p>Contenido HTML</p>',
      tipo: 'seguridad',
      prioridad: 'alta',
      source: 'academico-login',
      metadata: {
        resetUrl: 'https://academico.test/reset?token=abc',
        expiresInMinutes: '45',
        source: 'academico-login',
      },
    });
    expect(request.toConnect()).toMatchObject({
      usuarioId: '7',
      toEmail: 'estudiante@utn.edu.ec',
      metadata: expect.arrayContaining([
        { key: 'resetUrl', value: 'https://academico.test/reset?token=abc' },
      ]),
    });

    expect(SendEmailResponseDto.from({
      success: true,
      message: 'ok',
      provider: 'log',
      message_id: 'msg-1',
    }).toConnect()).toEqual({
      success: true,
      message: 'ok',
      provider: 'log',
      messageId: 'msg-1',
    });
  });

  it('rechaza email generico invalido', () => {
    expect(() =>
      SendEmailRequestDto.from({
        usuario_id: '7',
        to_email: 'correo-invalido',
        subject: 'Aviso',
        plain_text: 'Contenido',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      SendEmailRequestDto.from({
        to_email: 'estudiante@utn.edu.ec',
        subject: 'Aviso',
      }),
    ).toThrow(BadRequestException);
  });
});
