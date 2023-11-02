import { SlashCommand, CommandOptionType, SlashCreator, CommandContext, ComponentType, ButtonStyle, AutocompleteContext } from 'slash-create';
import { prisma } from '../prisma';
import { stripIndents } from 'common-tags';
import fuzzy from 'fuzzy';
import { List } from '@prisma/client';
import { autocompleteList, ban, formatBanError } from '../util';
import { APIUser } from 'discord-api-types/v10';

interface BanError {
  code: number;
  response: {
    message: string;
    code: number
  }
}

export default class Command extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'xbanid',
      description: 'Ban a user across servers using their ID.',
      requiredPermissions: ['BAN_MEMBERS'],
      dmPermission: false,
      deferEphemeral: true,
      options: [
        {
          type: CommandOptionType.STRING,
          name: 'user_id',
          description: 'The ID of the user to ban.',
          required: true,
          // @ts-ignore
          max_length: 20,
          // @ts-ignore
          min_length: 17
        },
        {
          type: CommandOptionType.STRING,
          name: 'list',
          description: 'The list to ban this user through.',
          autocomplete: true,
          required: true
        },
        {
          type: CommandOptionType.STRING,
          name: 'reason',
          description: 'The reason provided with the ban.',
          // @ts-ignore
          max_length: 100
        }
      ]
    });
  }

  async ban(guildId: string, userId: string, deleteMessageSeconds = 0, reason?: string): Promise<null | BanError> {
    try {
      await this.creator.requestHandler.request('PUT', `/guilds/${guildId}/bans/${userId}`, true, {
        delete_message_seconds: deleteMessageSeconds
      }, undefined, reason);
      return null;
    } catch (e) {
      return { code: e.code, response: e.response };
    }
  }

  async autocomplete(ctx: AutocompleteContext) {
    return await autocompleteList(ctx);
  }

  async run(ctx: CommandContext) {
    if (!ctx.member!.permissions.has('BAN_MEMBERS')) return 'You need the `Ban Members` permission to use this command.';
    if (!ctx.appPermissions.has('BAN_MEMBERS')) return 'I need the `Ban Members` permission.';

    const userId = ctx.options.user_id;
    if (!/^\d{17,20}$/.test(userId)) return await ctx.send({
      content: 'Invalid user ID.',
      ephemeral: true
    });
    if (userId === ctx.user.id) return await ctx.send({
      content: 'Banning yourself is not allowed.',
      ephemeral: true
    });

    const guild = await prisma.guild.findUnique({ where: { id: ctx.guildID! } });
    if (!guild?.enabled) return await ctx.send({
      content: 'This guild has not enabled cross-banning. Enable with `/xbot enable`.',
      ephemeral: true
    });

    const listId = ctx.options.list;
    if (!listId) return await ctx.send({
      content: 'Invalid list.',
      ephemeral: true
    });
    const list = await prisma.list.findUnique({
      where: {
        id: listId,
        pairs: {
          some: {
            guildId: ctx.guildID!
          }
        }
      },
      include: {
        pairs: {
          include: {
            guild: true
          }
        }
      }
    });
    if (!list) return await ctx.send({
      content: 'Invalid list.',
      ephemeral: true
    });

    const user: APIUser = await ctx.creator.requestHandler.request('GET', `/users/${userId}`, true).catch(() => null);
    if (!user) return await ctx.send({
      content: 'Failed to fetch user, does that user exist?',
      ephemeral: true
    });
    if (user.bot) return await ctx.send({
      content: 'Banning bots is not allowed.',
      ephemeral: true
    });

    await ctx.defer(true);

    const reason = `[ crossban by ${ctx.user.id} in guild ${ctx.guildID} in list ${list.name} ] ${ctx.options.reason || ''}`.trim().replace(/[^\t\x20-\x7e\x80-\xff]/g, '');
    const userName = `${user.username}${user.discriminator === '0' ? '' : `#${user.discriminator}`}`;

    const error = await ban(ctx.creator, ctx.guildID!, user.id, 0, reason);
    if (error) return `Failed to ban ${userName} from this guild: ${formatBanError(error)}`;

    const errors: Record<string, BanError> = {};
    for (const pair of list.pairs) {
      if (pair.guildId === ctx.guildID!) continue;
      const error = await ban(ctx.creator, pair.guildId, user.id, 0, reason);
      if (error) errors[pair.guildId] = error;
    }

    await prisma.list.update({
      where: { id: list.id },
      data: { lastBan: new Date() }
    });

    if (Object.keys(errors).length)
      return stripIndents`
        Banned ${userName} in ${(list.pairs.length - Object.keys(errors).length).toLocaleString()} guild(s), but could not ban in ${Object.keys(errors).length.toLocaleString()} guild(s).

        ${Object.keys(errors).map((guildId) => {
          const error = errors[guildId];
          const guild = list.pairs.find((p) => p.guildId === guildId).guild;
          return `${guild.name}: ${formatBanError(error)}`
        }).join('\n')}
      `

    return `Banned ${userName} across ${list.pairs.length.toLocaleString()} guilds.`;
  }
}
