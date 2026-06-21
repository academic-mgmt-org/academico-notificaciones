import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../config/auth/guard/auth_guard';

@Controller('api')
@UseGuards(AuthGuard)
export class HealthController {
  @Get('health')
  health() {
    return {
      status: 'healthy',
      service: 'academico-catalogo',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }

  @Get('ready')
  ready() {
    return {
      ready: true,
      timestamp: new Date().toISOString()
    };
  }

  @Get('live')
  live() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}
