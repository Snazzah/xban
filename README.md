# xban
A simple slash-command bot that cross-bans users, created for Discord's Buildathon 2023. Guilds can participate in cross-ban lists that can be referenced when cross-banning users.

However, because this does not use the gateway, the bot does not check the hierarchy of the user running the command and the user being banned.

## Installation
```sh
npx degit Snazzah/xban
cd xban
pnpm install
# edit variables in the ".env" file!
pnpm sync
pnpm build
pnpm start
```

### Using PM2
```sh
npm i -g pm2
# Follow the installation process above
pm2 start
pm2 dump # recommended
```
