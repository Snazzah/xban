import { SlashCommand, CommandOptionType, SlashCreator, CommandContext, ComponentType, ButtonStyle } from 'slash-create';
import { prisma } from '../prisma';
import { stripIndents } from 'common-tags';

export default class Command extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'xbot',
      description: 'Manage xban settings.',
      requiredPermissions: ['MANAGE_GUILD'],
      dmPermission: false,
      deferEphemeral: true,
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'enable',
          description: 'Enable (or disable) cross-banning.'
        }
      ]
    });
  }

  async run(ctx: CommandContext) {
    if (!ctx.member!.permissions.has('MANAGE_GUILD')) return 'You need the `Manage Guild` permission to use this command.';

    const guild = await prisma.guild.findUnique({ where: { id: ctx.guildID! } });
    if (guild?.enabled) return await ctx.send({
      content: 'This guild already has cross-banning enabled.',
      ephemeral: true,
      components: [
        {
          type: ComponentType.ACTION_ROW,
          components: [
            {
              type: ComponentType.BUTTON,
              style: ButtonStyle.DESTRUCTIVE,
              label: 'Disable',
              custom_id: 'xbot:disable'
            }
          ]
        }
      ]
    });

    return await ctx.send({
      content: stripIndents`
        By enabling cross-banning, you acknowledge that you:
        1. Ensure you trust the guilds in the lists you participate in.
        2. Restrict command permissions to trusted roles in \`Server Settings > Integrations > xban\`. Cross-banning commands are restricted to users with ban permissions by default.
        3. Use cross-bans sparingly and appropriately.

        When cross-banning, xban will try to ban the specified user in the current guild regardless of the moderator's roles and position, and will not propogate bans if that fails.
        **To prevent moderators of the same rank from banning each other, place xban's role below moderators**, while still giving it proper permissions.

        ## By enabling this bot, you allow moderators of guilds in participating lists to ban users from this guild.
      `,
      ephemeral: true,
      components: [
        {
          type: ComponentType.ACTION_ROW,
          components: [
            {
              type: ComponentType.BUTTON,
              style: ButtonStyle.DESTRUCTIVE,
              label: 'I agree with these terms, and want to enable cross-banning.',
              custom_id: 'xbot:enable'
            }
          ]
        }
      ]
    });
  }
}
