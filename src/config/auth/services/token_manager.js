import {
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TokenManager {
    async getPayload(token) {
        if (process.env.ENV === 'dev' && !process.env.BASE_URL) {
            return { cuenta: token, cedula: token?.substring(1), email: token };
        }

        try {
            const validation = await this.validateTokenWithGateway(token);
            if (!this.pickFirst(validation, ['isValid', 'is_valid'])) {
                throw new UnauthorizedException('Token inválido o revocado');
            }

            const userId = this.pickFirst(validation, ['userId', 'user_id']);
            const sessionId = this.pickFirst(validation, ['sessionId', 'session_id']);
            const identifier = validation.identifier;
            const email = validation.email;

            return {
                userId,
                sub: userId,
                cuenta: email || identifier,
                cedula: identifier,
                identifier,
                email,
                userName: email,
                sessionId,
                role: validation.role,
                applications: validation.applications || [],
            };
        } catch (error) {
            if (
                error instanceof InternalServerErrorException ||
                error instanceof UnauthorizedException
            ) {
                throw error;
            }
            throw new UnauthorizedException('Token inválido o expirado');
        }
    }

    async validateTokenWithGateway(token) {
        const baseUrl = process.env.BASE_URL;
        if (!baseUrl) {
            throw new InternalServerErrorException(
                'BASE_URL no configurado para validar tokens via gateway',
            );
        }

        const url = `${baseUrl.replace(/\/+$/, '')}/auth.v1.AuthService/ValidateToken`;
        const response = await axios.post(
            url,
            { token },
            {
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                },
                timeout: Number(process.env.AUTH_VALIDATE_TIMEOUT_MS || 5000),
            },
        );

        return response.data || {};
    }

    pickFirst(source, fields) {
        if (!source || typeof source !== 'object') {
            return undefined;
        }

        for (const field of fields) {
            if (Object.prototype.hasOwnProperty.call(source, field)) {
                return source[field];
            }
        }

        return undefined;
    }
}
