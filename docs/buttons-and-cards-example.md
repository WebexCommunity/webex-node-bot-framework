#### Buttons and Cards Template Using Express
The framework supports a bot.sendCard function for sending [Buttons and Cards](https://developer.webex.com/docs/api/guides/cards).

The input to a sendCard is simply the card JSON, which can be copied from the [Webex For Developers Card Designer](https://developer.webex.com/buttons-and-cards-designer), and fallback message to be rendered on clients that don't support Buttons and Cards.

If the card that is sent includes an Action.Submit button, the framework will generate an `attachmentAction` event whenever a user clicks on it.  Applications can process these events by implementing a `framework.on('attachmentAction')` handler.  The parameters passed to this hander will include the bot object for the space where the button was pushed along with a trigger that includes an attachmentAction object as described in the [Buttons and Cards Guide](https://developer.webex.com/docs/api/guides/cards#working-with-cards)

```js
var Framework = require('webex-node-bot-framework');
var webhook = require('webex-node-bot-framework/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
app.use(bodyParser.json());

// framework options
var config = {
  webhookUrl: 'http://myserver.com/framework',
  token: 'Tm90aGluZyB0byBzZWUgaGVyZS4uLiBNb3ZlIGFsb25nLi4u',
  port: 80,
  messageFormat: 'markdown'
};

// init framework
var framework = new Framework(config);
framework.start();

framework.on("initialized", () => {
  framework.debug("Framework initialized successfully! [Press CTRL-C to quit]");
});

// send an example card in response to any input
framework.hears(/.*/, (bot) => {
  // Fallback text for clients that don't render cards - messageFormat (in this example using Markdown) is defined in Framework Options
  const fallbackText = "[Tell us about yourself](https://www.example.com/form/book-vacation). We just need a few more details to get you booked for the trip of a lifetime!";
  bot.sendCard(cardBody, fallbackText);
});

// Process a submitted card
framework.on('attachmentAction', (bot, trigger) => {
  bot.say(`Got an attachmentAction:\n${JSON.stringify(trigger.attachmentAction, null, 2)}`);
});

// define express path for incoming webhooks
app.post('/', webhook(framework));

// start express server
var server = app.listen(config.port, () => {
  framework.debug('Framework listening on port %s', config.port);
});

// gracefully shutdown (ctrl-c)
process.on('SIGINT', () => {
  framework.debug('stoppping...');
  server.close();
  framework.stop().then(() => {
    process.exit();
  });
});

// define the contents of an adaptive card to collect some user input
let cardBody = {
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.0",
  "body": [
    {
      "type": "ColumnSet",
      "columns": [
        {
          "type": "Column",
          "width": 2,
          "items": [
            {
              "type": "TextBlock",
              "text": "Tell us about yourself",
              "weight": "bolder",
              "size": "medium"
            },
            {
              "type": "TextBlock",
              "text": "We just need a few more details to get you booked for the trip of a lifetime!",
              "isSubtle": true,
              "wrap": true
            },
            {
              "type": "TextBlock",
              "text": "Don't worry, we'll never share or sell your information.",
              "isSubtle": true,
              "wrap": true,
              "size": "small"
            },
            {
              "type": "TextBlock",
              "text": "Your name",
              "wrap": true
            },
            {
              "type": "Input.Text",
              "id": "Name",
              "placeholder": "John Andersen"
            },
            {
              "type": "TextBlock",
              "text": "Your website",
              "wrap": true
            },
            {
              "type": "Input.Text",
              "id" : "Url",
              "placeholder": "https://example.com"
            },
            {
              "type": "TextBlock",
              "text": "Your email",
              "wrap": true
            },
            {
              "type": "Input.Text",
              "id": "Email",
              "placeholder": "john.andersen@example.com",
              "style": "email"
            },
            {
              "type": "TextBlock",
              "text": "Phone Number"
            },
            {
              "type": "Input.Text",
              "id": "Tel",
              "placeholder": "+1 408 526 7209",
              "style": "tel"
            }
          ]
        },
        {
          "type": "Column",
          "width": 1,
          "items": [
            {
              "type": "Image",
              "url": "https://upload.wikimedia.org/wikipedia/commons/b/b2/Diver_Silhouette%2C_Great_Barrier_Reef.jpg",
              "size": "auto"
            }
          ]
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.Submit",
      "title": "Submit"
    }
  ]
};
```
[**Express Example**](./example1.md)

[**Websocket Example**](./example3.md)

[**Restify Example**](./example2.md)

[**Back to README**](../README.md)
