import {
    InternalServerErrorException,
    UnauthorizedException,
} from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { TokenManager } from './token_manager';

const mockClose = jest.fn();
const mockValidateToken = jest.fn();
const mockAuthService = jest.fn(function authService(target, credentials, options) {
    this.target = target;
    this.credentials = credentials;
    this.options = options;
    this.validateToken = mockValidateToken;
    this.close = mockClose;
});

jest.mock('@grpc/proto-loader', () => ({
    loadSync: jest.fn(() => 'package-definition'),
}));

jest.mock('@grpc/grpc-js', () => ({
    credentials: {
        createInsecure: jest.fn(() => 'insecure-credentials'),
    },
    loadPackageDefinition: jest.fn(() => ({
        auth: {
            v1: {
                AuthService: mockAuthService,
            },
        },
    })),
}));

describe('TokenManager', () => {
    const previousEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...previousEnv,
            ENV: 'prod',
            AUTH_GATEWAY_TARGET: 'academico-gateway:50050',
        };
    });

    afterAll(() => {
        process.env = previousEnv;
    });

    it('valida el token contra AuthService via gateway gRPC y devuelve el usuario autenticado', async () => {
        mockValidateToken.mockImplementation((_request, _options, callback) => {
            callback(null, {
                isValid: true,
                identifier: '1000000000',
                email: 'allunav@utn.edu.ec',
                sessionId: 'SESSION-1',
                userId: '1',
                role: 'ESTUDIANTE',
            });
        });

        const payload = await new TokenManager().getPayload('access-token');

        expect(protoLoader.loadSync).toHaveBeenCalled();
        expect(grpc.credentials.createInsecure).toHaveBeenCalled();
        expect(mockAuthService).toHaveBeenCalledWith(
            'academico-gateway:50050',
            'insecure-credentials',
            expect.objectContaining({
                'grpc.keepalive_time_ms': 20000,
            }),
        );
        expect(mockValidateToken).toHaveBeenCalledWith(
            { token: 'access-token' },
            expect.objectContaining({
                deadline: expect.any(Date),
            }),
            expect.any(Function),
        );
        expect(mockClose).toHaveBeenCalled();
        expect(payload).toMatchObject({
            userId: '1',
            sub: '1',
            identifier: '1000000000',
            email: 'allunav@utn.edu.ec',
            sessionId: 'SESSION-1',
            role: 'ESTUDIANTE',
        });
    });

    it('deriva el target gRPC desde BASE_URL si no existe AUTH_GATEWAY_TARGET', () => {
        process.env = {
            ...previousEnv,
            ENV: 'prod',
            BASE_URL: 'https://academia-dev.eastus2.cloudapp.azure.com',
        };

        expect(new TokenManager().getGatewayTarget()).toBe(
            'academia-dev.eastus2.cloudapp.azure.com:50050',
        );
    });

    it('ignora macros de Azure DevOps sin resolver y usa BASE_URL como respaldo', () => {
        process.env = {
            ...previousEnv,
            ENV: 'prod',
            AUTH_GATEWAY_TARGET: '$(DEV_AUTH_GATEWAY_TARGET)',
            BASE_URL: 'https://academia-dev.eastus2.cloudapp.azure.com',
        };

        expect(new TokenManager().getGatewayTarget()).toBe(
            'academia-dev.eastus2.cloudapp.azure.com:50050',
        );
    });

    it('rechaza tokens revocados o invalidos reportados por login via gateway', async () => {
        mockValidateToken.mockImplementation((_request, _options, callback) => {
            callback(null, { isValid: false });
        });

        await expect(new TokenManager().getPayload('revoked-token'))
            .rejects.toThrow(UnauthorizedException);
    });

    it('exige AUTH_GATEWAY_TARGET o BASE_URL fuera de dev', async () => {
        delete process.env.AUTH_GATEWAY_TARGET;
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('access-token'))
            .rejects.toThrow(InternalServerErrorException);
    });

    it('mantiene fallback local solo en dev sin gateway configurado', async () => {
        process.env.ENV = 'dev';
        delete process.env.AUTH_GATEWAY_TARGET;
        delete process.env.BASE_URL;

        await expect(new TokenManager().getPayload('dev-token'))
            .resolves.toMatchObject({
                cuenta: 'dev-token',
                email: 'dev-token',
            });
        expect(mockValidateToken).not.toHaveBeenCalled();
    });
});
