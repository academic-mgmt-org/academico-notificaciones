import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenManager {
    constructor(@Inject(JwtService) jwtService) {
        this.jwtService = jwtService;
    }

    async getPayload(token) {
        if (process.env.ENV === 'dev') {
            return { cuenta: token, cedula: token?.substring(1), email: token };
        }

        try {
            const payload = this.jwtService.decode(token);
            if (!payload) {
                throw new UnauthorizedException('Token inválido');
            }
            return {
                userId: payload['userId'] || payload['sub'],
                sub: payload['sub'],
                cuenta: payload['userStudent'] || payload['email'] || payload['identifier'],
                cedula: payload['identifier'],
                identifier: payload['identifier'],
                email: payload['email'],
                userName: payload['userName'],
                userStudent: payload['userStudent'],
                userProfessor: payload['userProfessor'],
                sessionId: payload['sessionId'],
                applications: payload['applications'] || [],
            };
        } catch (error) {
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }
}
