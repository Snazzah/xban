import { ComponentContext } from "slash-create";
import { prisma } from "./prisma";
import type { APIGuild } from "discord-api-types/v10"
import { stripIndents } from "common-tags";

export async function xbotEnable(ctx: ComponentContext) {
  await ctx.acknowledge();

  const guild = await prisma.guild.findUnique({ where: { id: ctx.guildID! } });
  if (guild?.enabled) return void await ctx.editParent({
    content: 'This guild already has cross-banning enabled.',
    components: []
  });

  const guildData: APIGuild = await ctx.creator.requestHandler.request('GET', `/guilds/${ctx.guildID}`, true);
  await prisma.guild.upsert({
    where: { id: ctx.guildID! },
    create: { id: ctx.guildID!, name: guildData.name, enabled: true },
    update: { name: guildData.name, enabled: true }
  });

  return void await ctx.editParent({
    content: stripIndents`
      Enabled cross-banning in this guild.

      To start using xban, create a list with \`/xlist create\`, and invite other guilds with \`/xlist invite\`.
      Other guilds will need to enable the bot and join the list with \`/xlist join\`.
    `,
    components: []
  });
}

export async function xbotDisable(ctx: ComponentContext) {
  await ctx.acknowledge();

  const guild = await prisma.guild.findUnique({ where: { id: ctx.guildID! } });
  if (!guild || !guild.enabled) return await ctx.editParent({
    content: 'This guild already has cross-banning disabled.',
    components: []
  });

  await prisma.guild.update({
    where: { id: ctx.guildID! },
    data: { enabled: false },
  });

  return await ctx.editParent({
    content: 'Disabled cross-banning in this guild.',
    components: []
  });
}
