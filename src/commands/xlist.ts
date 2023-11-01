import { SlashCommand, CommandOptionType, SlashCreator, CommandContext, ComponentType, ButtonStyle, AutocompleteContext } from 'slash-create';
import { prisma } from '../prisma';
import fuzzy from 'fuzzy';
import { MAX_LIST_PARTICIPANTS, MAX_LIST_PARTICIPATING } from '../constants';
import { stripIndents } from 'common-tags';
import { List } from '@prisma/client';
import { APIGuild } from 'discord-api-types/v10';

export default class Command extends SlashCommand {
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'xlist',
      description: 'Manage cross-ban lists.',
      dmPermission: false,
      deferEphemeral: true,
      requiredPermissions: ['MANAGE_GUILD'],
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'create',
          description: 'Create a cross-ban list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'name',
              description: 'The name of the list.',
              required: true,
              // @ts-ignore
              max_length: 32,
              // @ts-ignore
              min_length: 1
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'all',
          description: 'View all lists this guild participates in.'
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'view',
          description: 'View a cross-ban list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'list',
              description: 'The list to view.',
              autocomplete: true,
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'delete',
          description: 'Delete a cross-ban list that you own.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'owned_list',
              description: 'The list to delete.',
              autocomplete: true,
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'invite',
          description: 'Invite a guild to your cross-ban list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'owned_list',
              description: 'The list to invite the guild to.',
              autocomplete: true,
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'guild_id',
              description: 'The ID of the guild to invite.',
              required: true,
              // @ts-ignore
              max_length: 20,
              // @ts-ignore
              min_length: 17
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'join',
          description: 'Join a cross-ban list your guild was invited to.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'invited_list',
              description: 'The list to join.',
              autocomplete: true,
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'leave',
          description: 'Leave a cross-ban list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'joined_list',
              description: 'The list to leave.',
              autocomplete: true,
              required: true
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'kick',
          description: 'Kick (or uninvite) a guild from a cross-ban list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'owned_list',
              description: 'The list to kick from.',
              autocomplete: true,
              required: true
            },
            {
              type: CommandOptionType.STRING,
              name: 'guild_id',
              description: 'The ID of the guild to kick.',
              required: true,
              // @ts-ignore
              max_length: 20,
              // @ts-ignore
              min_length: 17
            }
          ]
        }
      ]
    });
  }

  getParticipatingCount(guildId: string) {
    return prisma.list.count({
      where: {
        pairs: {
          some: {
            guildId
          }
        },
        invites: {
          some: {
            guildId
          }
        }
      }
    });
  }

  async getParticipantCount(listId: string) {
    const inviteCount = await prisma.invitedGuild.count({
      where: {
        invites: {
          some: {
            listId
          }
        }
      }
    });
    const guildCount = await prisma.guild.count({
      where: {
        pairs: {
          some: {
            listId
          }
        }
      }
    });
    return inviteCount + guildCount;
  }

  async guildAccessible(guildId: string) {
    const invitedGuild = await prisma.invitedGuild.findUnique({ where: { id: guildId }});
    if (invitedGuild) return true;

    try {
      const guildData: APIGuild = await this.creator.requestHandler.request('GET', `/guilds/${guildId}`, true);
      await prisma.invitedGuild.create({
        data: { id: guildData.id }
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async autocomplete(ctx: AutocompleteContext) {
    let lists: List[] = [];
    let query = ctx.options[ctx.subcommands[0]][ctx.focused];

    switch (ctx.focused) {
      case 'list': {
        lists = await prisma.list.findMany({
          where: {
            pairs: {
              some: {
                guildId: ctx.guildID!
              }
            }
          }
        });
        break;
      }
      case 'owned_list': {
        lists = await prisma.list.findMany({
          where: {
            ownerId: ctx.guildID!
          }
        });
        break;
      }
      case 'invited_list': {
        lists = await prisma.list.findMany({
          where: {
            invites: {
              some: {
                guildId: ctx.guildID!
              }
            }
          }
        });
        break;
      }
      case 'joined_list': {
        lists = await prisma.list.findMany({
          where: {
            ownerId: {
              not: ctx.guildID!
            },
            pairs: {
              some: {
                guildId: ctx.guildID!
              }
            }
          }
        });
        break;
      }
    }

    if (!query || !lists.length) return lists.map((list) => ({ name: list.name, value: list.id })).slice(0, 25);

    const result = fuzzy.filter(query, lists, {
      extract: (list) => list.name
    });

    return result.map((result) => ({ name: result.original.name, value: result.original.id })).slice(0, 25);
  }

  async run(ctx: CommandContext) {
    if (!ctx.member!.permissions.has('MANAGE_GUILD')) return 'You need the `Manage Guild` permission to use this command.';

    const guild = await prisma.guild.findUnique({ where: { id: ctx.guildID! } });
    if (!guild?.enabled) return await ctx.send({
      content: 'This guild has not enabled cross-banning. Enable with `/xbot enable`.',
      ephemeral: true
    });

    switch (ctx.subcommands[0]) {
      case 'create': {
        const count = await this.getParticipatingCount(ctx.guildID!);

        if (count >= MAX_LIST_PARTICIPATING) return await ctx.send({
          content: 'You are participating in too many lists.',
          ephemeral: true
        });

        await prisma.list.create({
          data: {
            name: ctx.options.create.name,
            owner: {
              connect: {
                id: ctx.guildID!
              }
            },
            creator: {
              connectOrCreate: {
                where: { id: ctx.user.id },
                create: {
                  id: ctx.user.id,
                  username: ctx.user.username,
                  discriminator: ctx.user.discriminator
                }
              }
            },
            pairs: {
              create: {
                guild: {
                  connect: {
                    id: ctx.guildID!
                  }
                }
              }
            }
          }
        });

        return await ctx.send({
          content: 'List created.',
          ephemeral: true
        });
      }
      case 'all': {
        const lists = await prisma.list.findMany({
          where: {
            pairs: {
              some: {
                guild: {
                  id: ctx.guildID!
                }
              }
            }
          }
        });
        const invitedLists = await prisma.list.findMany({
          where: {
            invites: {
              some: {
                guild: {
                  id: ctx.guildID!
                }
              }
            }
          },
          include: {
            owner: true
          }
        });
        const participants = await prisma.guildListPair.findMany({
          where: {
            list: {
              id: {
                in: lists.map((l) => l.id)
              }
            }
          }
        });

        return await ctx.send({
          embeds: [
            {
              fields: [
                {
                  name: 'Your lists',
                  value: lists.map((l) => `${l.ownerId === ctx.guildID ? '👑 ' : ''}${l.name} (${participants.filter((p) => p.listId === l.id).length.toLocaleString()} guild[s])`).join('\n') || '*None*'
                },
                {
                  name: 'Lists that invited you',
                  value: invitedLists.map((l) => `${l.name} (${l.owner.name})`).join('\n') || '*None*'
                }
              ]
            }
          ],
          ephemeral: true
        });
      }
      case 'view': {
        const listId = ctx.options.view.list;
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
            owner: true,
            creator: true,
            invites: true
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const participants = await prisma.guild.findMany({
          where: {
            pairs: {
              some: {
                listId: list.id
              }
            }
          }
        });

        return await ctx.send({
          embeds: [
            {
              title: list.name,
              description: stripIndents`
                Owned by ${list.owner.name} (${list.ownerId})
                Created on <t:${Math.floor(list.createdAt.valueOf() / 1000)}:F>
                Created by ${list.creator.username}${list.creator.discriminator !== '0' ? `#${list.creator.discriminator}` : ''} (${list.creatorId})

                Last cross-ban: ${list.lastBan ? `<t:${Math.floor(list.lastBan.valueOf() / 1000)}:F>` : '*None*'}
              `,
              fields: [
                {
                  name: 'Guilds',
                  value: participants.map((g) => `[\`${g.id}\`] ${g.name}`).join('\n') || '*None*'
                },
                {
                  name: 'Invites',
                  value: list.invites.map((i) => `[\`${i.guildId}\`]`).join('\n') || '*None*'
                }
              ]
            }
          ],
          ephemeral: true
        });
      }
      case 'delete': {
        const listId = ctx.options.delete.owned_list;
        if (!listId) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const list = await prisma.list.findUnique({
          where: {
            id: listId,
            ownerId: ctx.guildID!
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });;

        await prisma.list.delete({
          where: { id: listId }
        });

        return await ctx.send({
          content: 'Deleted list.',
          ephemeral: true
        });
      }
      case 'invite': {
        const listId = ctx.options.invite.owned_list;
        const guildId = ctx.options.invite.guild_id;
        if (!listId) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const list = await prisma.list.findUnique({
          where: {
            id: listId,
            ownerId: ctx.guildID!
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });

        const participantCount = await this.getParticipantCount(listId);
        if (participantCount >= MAX_LIST_PARTICIPANTS) await ctx.send({
          content: 'This list has too many participants.',
          ephemeral: true
        });

        const count = await this.getParticipatingCount(guildId);
        if (count >= MAX_LIST_PARTICIPATING) await ctx.send({
          content: 'This guild is participating in too many lists.',
          ephemeral: true
        });

        if (!/^\d+$/.test(guildId)) return await ctx.send({
          content: 'Invalid guild ID.',
          ephemeral: true
        });

        const accessible = await this.guildAccessible(guildId);
        if (!accessible) return await ctx.send({
          content: 'This bot cannot access the specified guild.',
          ephemeral: true
        });

        await prisma.listInvite.create({
          data: {
            guild: { connect: { id: guildId } },
            list: { connect: { id: listId } }
          }
        });

        return await ctx.send({
          content: 'Invited that guild to the list.',
          ephemeral: true
        });
      }
      case 'join': {
        const listId = ctx.options.join.invited_list;
        if (!listId) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const list = await prisma.list.findUnique({
          where: {
            id: listId,
            invites: {
              some: {
                guildId: ctx.guildID!
              }
            }
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });

        await prisma.listInvite.delete({
          where: {
            guildId_listId: {
              guildId: ctx.guildID!,
              listId
            }
          }
        });
        await prisma.guildListPair.create({
          data: {
            guild: { connect: { id: ctx.guildID! } },
            list: { connect: { id: listId } }
          }
        });

        return await ctx.send({
          content: `Joined list ${list.name}.`,
          ephemeral: true
        });
      }
      case 'leave': {
        const listId = ctx.options.leave.joined_list;
        if (!listId) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const list = await prisma.list.findUnique({
          where: {
            id: listId,
            ownerId: {
              not: ctx.guildID!
            },
            pairs: {
              some: {
                guildId: ctx.guildID!
              }
            }
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });

        await prisma.guildListPair.delete({
          where: {
            guildId_listId: {
              guildId: ctx.guildID!,
              listId
            }
          }
        });

        return await ctx.send({
          content: `Left list ${list.name}.`,
          ephemeral: true
        });
      }
      case 'kick': {
        const listId = ctx.options.kick.owned_list;
        const guildId = ctx.options.kick.guild_id;
        if (!listId) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });
        const list = await prisma.list.findUnique({
          where: {
            id: listId,
            ownerId: ctx.guildID!
          },
          include: {
            pairs: true,
            invites: true
          }
        });
        if (!list) return await ctx.send({
          content: 'Invalid list.',
          ephemeral: true
        });

        if (!/^\d+$/.test(guildId)) return await ctx.send({
          content: 'Invalid guild ID.',
          ephemeral: true
        });

        if (guildId === ctx.guildID) return await ctx.send({
          content: "Don't kick yourself.",
          ephemeral: true
        });

        if (list.invites.find((i) => i.guildId === guildId)) {
          await prisma.listInvite.delete({
            where: {
              guildId_listId: {
                guildId,
                listId
              }
            }
          });

          return await ctx.send({
            content: "Removed that guild's invite.",
            ephemeral: true
          });
        } else if (list.pairs.find((i) => i.guildId === guildId)) {
          await prisma.guildListPair.delete({
            where: {
              guildId_listId: {
                guildId,
                listId
              }
            }
          });

          return await ctx.send({
            content: 'Kicked that guild from this list.',
            ephemeral: true
          });
        }

        return await ctx.send({
          content: 'That guild is not a part of this list.',
          ephemeral: true
        });
      }
    }
  }
}
