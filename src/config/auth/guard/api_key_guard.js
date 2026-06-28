import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class ApiKeyGuard {
  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const expectedApiKey = process.env.NOTIFICACIONES_API_KEY;

    if (!expectedApiKey) {
      throw new UnauthorizedException('API key del servicio no configurada');
    }

    const apiKey = request.headers['x-api-key'];
    if (apiKey !== expectedApiKey) {
      throw new UnauthorizedException('API key invalida o no provista');
    }

    return true;
  }
}
