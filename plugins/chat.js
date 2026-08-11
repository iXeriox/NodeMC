const commands = new Map();

// Register built-in commands
commands.set('help', {
  description: 'Show available commands',
  execute: (client, args, api) => {
    const commandList = Array.from(commands.keys()).map(cmd => `/${cmd}`).join(', ');
    client.write('chat', {
      message: JSON.stringify({text: `Available commands: ${commandList}`, color: 'yellow'}),
      position: 0
    });
  }
});
commands.set('ping', {
  description: 'Check server responsiveness',
  execute: (client, args, api) => {
    client.write('chat', {
      message: JSON.stringify({text: 'Pong!', color: 'green'}),
      position: 0
    });
  }
});

commands.set('list', {
  description: 'Show online players',
  execute: (client, args, api) => {
    const count = api.server.clients.size;
    client.write('chat', {
      message: JSON.stringify({text: `Online players: ${count}`, color: 'aqua'}),
      position: 0
    });
  }
});

module.exports = {
  name: 'chat',

  onEnable(api) {
    api.logger.log('Chat and commands plugin enabled');

    api.registerEvent('chat', ({client, message}) => {
      try {
        const username = (client && client.username) ? client.username : 'Player';

        // Check if it's a command
        if (message.startsWith('/')) {
          const parts = message.slice(1).split(' ');
          const commandName = parts[0].toLowerCase();
          const args = parts.slice(1);

          const command = commands.get(commandName);
          if (command) {
            api.logger.log(`${username} executed command: ${message}`);
            command.execute(client, args, api);
          } else {
            client.write('chat', {
              message: JSON.stringify({text: `Unknown command: /${commandName}`, color: 'red'}),
              position: 0
            });
          }
        } else {
          // Broadcast regular chat message
          const chatMessage = JSON.stringify({
            translate: 'chat.type.text',
            with: [
              {text: username, color: 'white'},
              {text: message, color: 'white'}
            ]
          });

          api.logger.log(`<${username}> ${message}`);

          // Send to all connected clients
          if (api.server && api.server.clients) {
            for (const [uuid, otherClient] of api.server.clients) {
              try {
                otherClient.write('chat', {
                  message: chatMessage,
                  position: 0
                });
              } catch (err) {
                api.logger.error(`Failed to send chat to ${uuid}:`, err.message);
              }
            }
          }
        }
      } catch (err) {
        api.logger.error('Error processing chat message:', err);
      }
    });
  },

  onDisable(api) {
    api.logger.log('Chat and commands plugin disabled');
  }
};
