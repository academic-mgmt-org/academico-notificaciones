import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenManager {
    constructor(@Inject(JwtService) jwtService) {
        this.jwtService = jwtService;
    }

    async getPayload(token) {
        if (process.env.ENV === 'dev') {
            return { cuenta: token, cedula: token.substring(1) };
        }

        try {
            const payload = this.jwtService.decode(token);
            if (!payload) {
                throw new UnauthorizedException('Token inválido');
            }
            return {
                cuenta: payload['userStudent'],
                cedula: payload['identifier'],
            };
        } catch (error) {
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }
}
