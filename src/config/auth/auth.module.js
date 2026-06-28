import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './guard/auth_guard';
import { TokenManager } from './services/token_manager';
import { ApiKeyGuard } from './guard/api_key_guard';

@Global()
@Module({
    providers: [TokenManager, AuthGuard, ApiKeyGuard],
    exports: [AuthGuard, ApiKeyGuard, TokenManager],
})
export class AuthModule {}
