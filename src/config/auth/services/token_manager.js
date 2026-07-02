import {
    Injectable,
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

@Injectable()
export class TokenManager {
    constructor() {
        this.grpcAuthService = null;
    }

    async getPayload(token) {
        if (process.env.ENV === 'dev' && !this.getGatewayTarget()) {
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
        const target = this.getGatewayTarget();
        if (!target) {
            throw new InternalServerErrorException(
                'AUTH_GATEWAY_TARGET no configurado para validar tokens via gateway',
            );
        }

        return new Promise((resolve, reject) => {
            const AuthServiceClient = this.getGrpcAuthService();
            const client = new AuthServiceClient(
                target,
                grpc.credentials.createInsecure(),
                this.getGrpcChannelOptions(),
            );

            client.validateToken(
                { token },
                { deadline: this.getGrpcDeadline() },
                (error, response) => {
                    client.close();

                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(response || {});
                },
            );
        });
    }

    getGrpcAuthService() {
        if (!this.grpcAuthService) {
            const packageDefinition = protoLoader.loadSync(
                join(__dirname, '../../../proto/auth.proto'),
                {
                    keepCase: false,
                    longs: String,
                    enums: String,
                    defaults: true,
                    oneofs: true,
                },
            );
            const authProto = grpc.loadPackageDefinition(packageDefinition).auth.v1;
            this.grpcAuthService = authProto.AuthService;
        }

        return this.grpcAuthService;
    }

    getGatewayTarget() {
        return (
            this.normalizeGrpcTarget(process.env.AUTH_GATEWAY_TARGET) ||
            this.grpcTargetFromBaseUrl(process.env.BASE_URL)
        );
    }

    normalizeGrpcTarget(value) {
        if (!value) {
            return '';
        }

        const target = String(value).trim().replace(/\/+$/, '');
        if (!target || /^\$\([^)]+\)$/.test(target)) {
            return '';
        }

        return target;
    }

    grpcTargetFromBaseUrl(baseUrl) {
        if (!baseUrl) {
            return '';
        }

        const value = String(baseUrl).trim().replace(/\/+$/, '');
        if (!value) {
            return '';
        }

        if (!/^https?:\/\//i.test(value)) {
            return value;
        }

        try {
            const parsed = new URL(value);
            if (parsed.port) {
                return parsed.host;
            }

            return `${parsed.hostname}:50050`;
        } catch {
            return '';
        }
    }

    getGrpcChannelOptions() {
        return {
            'grpc.keepalive_time_ms': 20000,
            'grpc.keepalive_timeout_ms': 5000,
            'grpc.keepalive_permit_without_calls': 1,
            'grpc.initial_reconnect_backoff_ms': 1000,
            'grpc.max_reconnect_backoff_ms': 5000,
        };
    }

    getGrpcDeadline() {
        const parsed = parseInt(
            process.env.AUTH_GRPC_TIMEOUT_MS ||
            process.env.AUTH_VALIDATE_TIMEOUT_MS ||
            '5000',
            10,
        );
        const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
        return new Date(Date.now() + timeoutMs);
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
