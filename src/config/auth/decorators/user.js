import { createParamDecorator } from '@nestjs/common';

export const User = createParamDecorator(
    (data, ctx) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);
