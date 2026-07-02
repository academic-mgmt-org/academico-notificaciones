import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { EmailClient } from '@azure/communication-email';

@Injectable()
export class EmailSenderService {
  constructor(@Inject(Logger) logger) {
    this.logger = logger;
    this.azureClient = null;
  }

  async sendEmail(message) {
    const provider = this.getProvider();

    if (provider === 'azure') {
      return this.sendWithAzure(message);
    }

    this.logger.log(
      {
        context: 'EmailSenderService',
        event: 'email_logged',
        provider,
        to: message.to,
        subject: message.subject,
        metadata: message.metadata,
      },
      '[Email] Correo registrado en logs porque EMAIL_PROVIDER no es azure',
    );

    return {
      success: true,
      provider,
      messageId: `log-${Date.now()}`,
      message: 'Correo registrado en logs',
    };
  }

  async sendWithAzure(message) {
    const connectionString =
      process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING ||
      process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    const senderAddress =
      process.env.EMAIL_FROM_ADDRESS ||
      process.env.AZURE_COMMUNICATION_EMAIL_FROM;

    if (!connectionString || !senderAddress) {
      throw new InternalServerErrorException(
        'Azure Communication Email no esta configurado',
      );
    }

    const client = this.getAzureClient(connectionString);
    const poller = await client.beginSend(
      {
        senderAddress,
        content: {
          subject: message.subject,
          plainText: message.text,
          html: message.html,
        },
        recipients: {
          to: [{ address: message.to }],
        },
      },
      {
        updateIntervalInMs: this.getAzurePollIntervalMs(),
      },
    );
    const result = await poller.pollUntilDone();

    return {
      success: result.status === 'Succeeded',
      provider: 'azure',
      messageId: result.id || '',
      message:
        result.status === 'Succeeded'
          ? 'Correo enviado correctamente'
          : `Estado de envio: ${result.status}`,
    };
  }

  getAzureClient(connectionString) {
    if (!this.azureClient) {
      this.azureClient = new EmailClient(connectionString);
    }
    return this.azureClient;
  }

  getProvider() {
    return String(
      process.env.EMAIL_PROVIDER ||
        process.env.NOTIFICACIONES_EMAIL_PROVIDER ||
        'log',
    )
      .trim()
      .toLowerCase();
  }

  getAzurePollIntervalMs() {
    const parsed = parseInt(
      process.env.AZURE_EMAIL_POLL_INTERVAL_MS || '100',
      10,
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
  }

}
