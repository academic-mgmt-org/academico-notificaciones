import {
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import { connect } from 'node:http2';

@Injectable()
export class TokenManager {
    async getPayload(token) {
        if (process.env.ENV === 'dev' && !process.env.LOGIN_BASE_URL && !process.env.BASE_URL) {
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
        const baseUrl = process.env.LOGIN_BASE_URL || process.env.BASE_URL;
        if (!baseUrl) {
            throw new InternalServerErrorException(
                'LOGIN_BASE_URL no configurado para validar tokens',
            );
        }

        const url = `${baseUrl.replace(/\/+$/, '')}/auth.v1.AuthService/ValidateToken`;
        return this.postJsonHttp2(
            url,
            { token },
            {
                'x-api-key': process.env.LOGIN_API_KEY || '',
            },
        );
    }

    postJsonHttp2(url, body, headers = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const client = connect(parsedUrl.origin);
            const requestBody = JSON.stringify(body || {});
            const timeoutMs = Number(process.env.AUTH_VALIDATE_TIMEOUT_MS || 5000);
            let responseBody = '';
            let statusCode = 0;

            const timeout = setTimeout(() => {
                client.close();
                reject(new Error(`Timeout al validar token contra ${parsedUrl.origin}`));
            }, timeoutMs);

            client.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            const request = client.request({
                ':method': 'POST',
                ':path': `${parsedUrl.pathname}${parsedUrl.search}`,
                'content-type': 'application/json',
                accept: 'application/json',
                ...this.cleanHeaders(headers),
            });

            request.setEncoding('utf8');
            request.on('response', (responseHeaders) => {
                statusCode = Number(responseHeaders[':status'] || 0);
            });
            request.on('data', (chunk) => {
                responseBody += chunk;
            });
            request.on('end', () => {
                clearTimeout(timeout);
                client.close();

                if (statusCode < 200 || statusCode >= 300) {
                    reject(new Error(`ValidateToken respondio HTTP ${statusCode}: ${responseBody}`));
                    return;
                }

                try {
                    resolve(responseBody ? JSON.parse(responseBody) : {});
                } catch (error) {
                    reject(error);
                }
            });
            request.on('error', (error) => {
                clearTimeout(timeout);
                client.close();
                reject(error);
            });

            request.end(requestBody);
        });
    }

    cleanHeaders(headers = {}) {
        return Object.fromEntries(
            Object.entries(headers).filter(([, value]) => (
                value !== undefined &&
                value !== null &&
                value !== ''
            )),
        );
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
