import {
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import { TokenManager } from './token_manager';

describe('TokenManager', () => {
    const previousEnv = process.env;

    beforeEach(() => {
        jest.restoreAllMocks();
        process.env = {
            ...previousEnv,
            ENV: 'prod',
            LOGIN_BASE_URL: 'http://academico-login:3001',
            LOGIN_API_KEY: 'login-api-key',
        };
    });

    afterAll(() => {
        process.env = previousEnv;
    });

    it('valida el token contra AuthService de login y devuelve el usuario autenticado', async () => {
        const manager = new TokenManager();
        jest.spyOn(manager, 'postJsonHttp2').mockResolvedValue({
            isValid: true,
            identifier: '1000000000',
            email: 'allunav@utn.edu.ec',
            sessionId: 'SESSION-1',
            userId: '1',
            role: 'ESTUDIANTE',
        });

        const payload = await manager.getPayload('access-token');

        expect(manager.postJsonHttp2).toHaveBeenCalledWith(
            'http://academico-login:3001/auth.v1.AuthService/ValidateToken',
            { token: 'access-token' },
            expect.objectContaining({
                'x-api-key': 'login-api-key',
            }),
        );
        expect(payload).toMatchObject({
            userId: '1',
            sub: '1',
            identifier: '1000000000',
            email: 'allunav@utn.edu.ec',
            sessionId: 'SESSION-1',
            role: 'ESTUDIANTE',
        });
    });

    it('rechaza tokens revocados o invalidos reportados por login', async () => {
        const manager = new TokenManager();
        jest.spyOn(manager, 'postJsonHttp2').mockResolvedValue({
            isValid: false,
        });

        await expect(manager.getPayload('revoked-token'))
            .rejects.toThrow(UnauthorizedException);
    });

    it('exige LOGIN_BASE_URL fuera de dev', async () => {
        delete process.env.LOGIN_BASE_URL;
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('access-token'))
            .rejects.toThrow(InternalServerErrorException);
    });

    it('mantiene fallback local solo en dev sin BASE_URL', async () => {
        process.env.ENV = 'dev';
        delete process.env.LOGIN_BASE_URL;
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('dev-token'))
            .resolves.toMatchObject({
                cuenta: 'dev-token',
                email: 'dev-token',
            });
    });
});
