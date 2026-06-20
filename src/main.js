import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { config } from 'dotenv';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { ConnectError, Code } from '@connectrpc/connect';
import connectRoutes from './connect-routes';
config();

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    new FastifyAdapter({
      http2: true
    }),
    {
      bufferLogs: true
    }
  );

  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  const fastifyInstance = app.getHttpAdapter().getInstance();
  await fastifyInstance.register(fastifyConnectPlugin, {
    routes: connectRoutes,
    interceptors: [
      (next) => async (req) => {
        const apiKey = req.header.get('x-api-key');
        const expectedApiKey = process.env.CATALOGO_API_KEY;
        if (!apiKey || apiKey !== expectedApiKey) {
          throw new ConnectError(
            'Acceso no autorizado: API Key inválida o no provista',
            Code.Unauthenticated,
          );
        }
        return await next(req);
      },
    ],
  });

  app.enableCors({
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization'
  });

  const port = process.env.PORT || 3003;
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Microservicio academico-catalogo corriendo en puerto ${port} (HTTP/2 Fastify habilitado)`);
}
bootstrap();

