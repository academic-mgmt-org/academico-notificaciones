import {
    Inject,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenManager } from '../services/token_manager';
import { RequiredPermission } from '../decorators/required_permission';

@Injectable()
export class AuthGuard {
    constructor(
        @Inject(Reflector) reflector,
        @Inject(TokenManager) tokenManager,
    ) {
        this.reflector = reflector;
        this.tokenManager = tokenManager;
    }

    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extraerTokenDelHeader(request);
        if (!token) {
            throw new UnauthorizedException();
        }

        try {
            const payload = await this.tokenManager.getPayload(token);
            request.user = payload;
        } catch {
            throw new UnauthorizedException();
        }

        const requiredFunction = this.reflector.get(RequiredPermission, context.getHandler());
        if (!requiredFunction) {
            return true;
        }

        return true;
    }

    extraerTokenDelHeader(request) {
        const authHeader = request.headers.authorization;
        if (process.env.ENV === 'dev') {
            return authHeader;
        }

        const [type, token] = authHeader?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
