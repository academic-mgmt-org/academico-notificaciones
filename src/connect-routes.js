import { ElizaService } from './gen/eliza_pb.js';

/**
 * ConnectRPC routes definitions.
 * @param {import('@connectrpc/connect').ConnectRouter} router
 */
export default (router) => {
  router.service(ElizaService, {
    async say(req) {
      return {
        sentence: `You said: "${req.sentence}"`,
      };
    },
  });
};
