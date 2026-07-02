import { InternalServerErrorException } from '@nestjs/common';
import { EmailSenderService } from './email-sender.service';

jest.mock('@azure/communication-email', () => ({
  EmailClient: jest.fn(),
}));

const { EmailClient } = require('@azure/communication-email');

describe('EmailSenderService', () => {
  const originalEnv = process.env;
  let beginSend;
  let pollUntilDone;
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EMAIL_PROVIDER: 'azure',
      AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING: 'endpoint=https://example.test/;accesskey=test',
      EMAIL_FROM_ADDRESS: 'notificaciones@example.test',
    };

    pollUntilDone = jest.fn().mockResolvedValue({
      status: 'Succeeded',
      id: 'message-1',
    });
    beginSend = jest.fn().mockResolvedValue({ pollUntilDone });
    EmailClient.mockImplementation(() => ({ beginSend }));
    service = new EmailSenderService({ log: jest.fn(), warn: jest.fn() });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('envia correos Azure usando intervalo de polling rapido por defecto', async () => {
    await service.sendEmail({
      to: 'estudiante@utn.edu.ec',
      subject: 'Aviso',
      text: 'Contenido',
      html: '<p>Contenido</p>',
    });

    expect(beginSend).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: 'notificaciones@example.test',
        content: expect.objectContaining({
          subject: 'Aviso',
          plainText: 'Contenido',
          html: '<p>Contenido</p>',
        }),
        recipients: {
          to: [{ address: 'estudiante@utn.edu.ec' }],
        },
      }),
      { updateIntervalInMs: 100 },
    );
    expect(pollUntilDone).toHaveBeenCalled();
  });

  it('permite configurar el intervalo de polling Azure', async () => {
    process.env.AZURE_EMAIL_POLL_INTERVAL_MS = '250';

    await service.sendEmail({
      to: 'estudiante@utn.edu.ec',
      subject: 'Aviso',
      text: 'Contenido',
    });

    expect(beginSend).toHaveBeenCalledWith(
      expect.any(Object),
      { updateIntervalInMs: 250 },
    );
  });

  it('usa 100 ms si el intervalo configurado es invalido', async () => {
    process.env.AZURE_EMAIL_POLL_INTERVAL_MS = '0';

    await service.sendEmail({
      to: 'estudiante@utn.edu.ec',
      subject: 'Aviso',
      text: 'Contenido',
    });

    expect(beginSend).toHaveBeenCalledWith(
      expect.any(Object),
      { updateIntervalInMs: 100 },
    );
  });

  it('rechaza Azure si falta configuracion obligatoria', async () => {
    delete process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING;
    delete process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;

    await expect(
      service.sendEmail({
        to: 'estudiante@utn.edu.ec',
        subject: 'Aviso',
        text: 'Contenido',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
