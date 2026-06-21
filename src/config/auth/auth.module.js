import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './guard/auth_guard';
import { TokenManager } from './services/token_manager';

@Global()
@Module({
    providers: [TokenManager, AuthGuard],
    exports: [AuthGuard, TokenManager],
})
export class AuthModule {}
