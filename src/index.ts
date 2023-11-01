import 'dotenv/config';
import { SlashCreator, FastifyServer } from 'slash-create';
import path from 'path';
import { logger } from './logger';
import { xbotDisable, xbotEnable } from './components';

const creator = new SlashCreator({
  applicationID: process.env.DISCORD_APP_ID,
  publicKey: process.env.DISCORD_PUBLIC_KEY,
  token: process.env.DISCORD_BOT_TOKEN,
  serverPort: parseInt(process.env.PORT, 10) || 8020,
  serverHost: process.env.HOST || '0.0.0.0'
});

creator.on('debug', (message) => logger.debug(message));
creator.on('warn', (message) => logger.warn(message));
creator.on('error', (error) => logger.error(error));
creator.on('commandRun', (command, _, ctx) => {
  logger.info(
    `${ctx.guildID ? `[guild:${ctx.guildID}]` : '[dm]'} > ${ctx.user.username}#${ctx.user.discriminator} (${
      ctx.user.id
    }) > /${command.commandName}${ctx.subcommands.length ? ' ' + ctx.subcommands.join(' ') : ''}`
  );
});
creator.on('commandError', (command, error) => logger.error(`Command ${command.commandName}:`, error));

creator.withServer(new FastifyServer()).registerCommandsIn(path.join(__dirname, 'commands')).startServer();

logger.info(`Starting server at "${creator.options.serverHost}:${creator.options.serverPort}/interactions"`);

creator.on('componentInteraction', async (ctx) => {
  try {
    if (ctx.customID === 'xbot:enable') await xbotEnable(ctx);
    else if (ctx.customID === 'xbot:disable') await xbotDisable(ctx);
  } catch (e) {
    console.error(e);
  }
});
