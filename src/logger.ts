import { createConsola } from 'consola';

export const logger = createConsola({
  level: process.env.XBAN_DEBUG === 'true' ? 4 : 3
});
