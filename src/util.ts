import type { List } from "@prisma/client";
import type { AutocompleteContext, SlashCreator } from "slash-create";
import { prisma } from "./prisma";
import fuzzy from 'fuzzy';

interface BanError {
  code: number;
  response: {
    message: string;
    code: number
  }
}

export function formatBanError(error: BanError) {
  return `${!error.response ? `Request failed with ${error.code}` : `${error.response.message} (${error.response.code})`}`;
}

export async function autocompleteList(ctx: AutocompleteContext, query?: string) {
  const lists: List[] = await prisma.list.findMany({
    where: {
      pairs: {
        some: {
          guildId: ctx.guildID!
        }
      }
    }
  });
  const q = query || ctx.options.list;

  if (!q || !lists.length) return lists.map((list) => ({ name: list.name, value: list.id })).slice(0, 25);

  const result = fuzzy.filter(q, lists, {
    extract: (list) => list.name
  });

  return result.map((result) => ({ name: result.original.name, value: result.original.id })).slice(0, 25);
}

export async function ban(creator: SlashCreator, guildId: string, userId: string, deleteMessageSeconds = 0, reason?: string): Promise<null | BanError> {
  try {
    await creator.requestHandler.request('PUT', `/guilds/${guildId}/bans/${userId}`, true, {
      delete_message_seconds: deleteMessageSeconds
    }, undefined, reason);
    return null;
  } catch (e) {
    return { code: e.code, response: e.response };
  }
}
