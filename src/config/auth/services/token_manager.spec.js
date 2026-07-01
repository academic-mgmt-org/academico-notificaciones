import {
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { TokenManager } from './token_manager';

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        post: jest.fn(),
    },
}));

describe('TokenManager', () => {
    const previousEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...previousEnv,
            ENV: 'prod',
            BASE_URL: 'https://gateway.test/',
        };
    });

    afterAll(() => {
        process.env = previousEnv;
    });

    it('valida el token contra AuthService via gateway y devuelve el usuario autenticado', async () => {
        axios.post.mockResolvedValue({
            data: {
                isValid: true,
                identifier: '1000000000',
                email: 'allunav@utn.edu.ec',
                sessionId: 'SESSION-1',
                userId: '1',
                role: 'ESTUDIANTE',
            },
        });

        const payload = await new TokenManager().getPayload('access-token');

        expect(axios.post).toHaveBeenCalledWith(
            'https://gateway.test/auth.v1.AuthService/ValidateToken',
            { token: 'access-token' },
            expect.objectContaining({
                headers: expect.objectContaining({
                    'content-type': 'application/json',
                    accept: 'application/json',
                }),
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
        axios.post.mockResolvedValue({
            data: {
                isValid: false,
            },
        });

        await expect(new TokenManager().getPayload('revoked-token'))
            .rejects.toThrow(UnauthorizedException);
    });

    it('exige BASE_URL fuera de dev', async () => {
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('access-token'))
            .rejects.toThrow(InternalServerErrorException);
    });

    it('mantiene fallback local solo en dev sin BASE_URL', async () => {
        process.env.ENV = 'dev';
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('dev-token'))
            .resolves.toMatchObject({
                cuenta: 'dev-token',
                email: 'dev-token',
            });
        expect(axios.post).not.toHaveBeenCalled();
    });
});
