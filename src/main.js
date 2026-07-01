import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';
import { config } from 'dotenv';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import { ConnectError, Code } from '@connectrpc/connect';
import connectRoutes from './connect-routes';
import * as path from 'path';
import { TokenManager } from './config/auth/services/token_manager';
import { authenticatedUserContextKey } from './auth-context';
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

  const { registerServerReflectionFromFile } = await Function('return import("@lambdalisue/connectrpc-grpcreflect/server")')();

  const tokenManager = app.get(TokenManager);

  const fastifyInstance = app.getHttpAdapter().getInstance();
  await fastifyInstance.register(fastifyConnectPlugin, {
    routes: (router) => {
      registerServerReflectionFromFile(router, path.join(process.cwd(), 'schema.bin'));
      connectRoutes(router, app);
    },
    interceptors: [
      (next) => async (req) => {
        if (req.service?.typeName === 'notificaciones.v1.HealthService') {
          return await next(req);
        }

        if (isInternalEmailRequest(req)) {
          validateApiKey(req);
          return await next(req);
        }

        // 1. Validar Bearer Token (Requerido para todas las peticiones, incluyendo reflexión)
        const authHeader = req.header.get('authorization');
        if (!authHeader) {
          throw new ConnectError(
            'Acceso no autorizado: Token de autorización no provisto',
            Code.Unauthenticated,
          );
        }

        let token = authHeader;
        if (process.env.ENV !== 'dev') {
          const [type, t] = authHeader.split(' ');
          if (type !== 'Bearer' || !t) {
            throw new ConnectError(
              'Acceso no autorizado: Token Bearer inválido o mal formado',
              Code.Unauthenticated,
            );
          }
          token = t;
        }

        try {
          const authenticatedUser = await tokenManager.getPayload(token);
          req.contextValues.set(authenticatedUserContextKey, authenticatedUser);
        } catch (error) {
          throw new ConnectError(
            'Acceso no autorizado: Token inválido o expirado',
            Code.Unauthenticated,
          );
        }

        // 2. Validar x-api-key (Bypasseado para reflexión gRPC)
        if (req.service && req.service.typeName && req.service.typeName.startsWith('grpc.reflection.')) {
          return await next(req);
        }

        validateApiKey(req);

        return await next(req);
      },
    ],
  });

  app.enableCors({
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,x-api-key'
  });

  const port = process.env.PORT || 3003;
  await app.listen(port, '0.0.0.0');
  logger.log(`Microservicio academico-notificaciones corriendo en puerto ${port} (HTTP/2 Fastify habilitado)`);
}
bootstrap();

function isInternalEmailRequest(req) {
  return (
    req.service?.typeName === 'notificaciones.v1.EmailService' &&
    ['SendEmail', 'sendEmail'].includes(
      req.method?.name || req.method?.localName,
    )
  );
}

function validateApiKey(req) {
  const apiKey = req.header.get('x-api-key');
  const expectedApiKey = process.env.NOTIFICACIONES_API_KEY;
  if (!apiKey || apiKey !== expectedApiKey) {
    throw new ConnectError(
      'Acceso no autorizado: API Key inválida o no provista',
      Code.Unauthenticated,
    );
  }
}
