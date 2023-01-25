# webex-node-bot-framework

### Node JS Bot Framework for Cisco Webex

This project is inspired by, and provides an alternate implementation of, the awesome [node-flint](https://github.com/flint-bot/flint/) framework by [Nick Marus](https://github.com/nmarus).  The framework makes it easy to quickly develop a Webex messaging bot, abstracting away some of the complexity of Webex For Developers interfaces, such as registering for events and calling REST APIs. A bot developer can use the framework to focus primarily on how the bot will interact with users in Webex, by writing "handlers" for various message or membership events in spaces where the bot has been added.

The primary change in this implementation is that it is based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex.  

For developers who are familiar with flint, or who wish to port existing bots built on node-flint to the webex-node-bot-framework, this implementation is NOT backwards compatible.  Please see [Migrating from the original flint framework](./docs/migrate-from-node-flint.md)

Feel free to join the ["Webex Node Bot Framework" space on Webex](https://eurl.io/#BJ7gmlSeU) to ask questions and share tips on how to leverage this framework.   This project is community supported so contributions are welcome.   If you are interested in making the framework better please see the [Contribution Guidelines](./docs/contributing.md).

## News
* May, 2020 - Version 2 introduces a some new configuration options designed to help developers restrict access to their bot.   This can be helpful during the development phase (`guideEmails` parameter) or for production bots that should be restricted for use to users that have certain email domains (`restrictedToEmailDomains` parameter).   See [Membership-Rules README](./docs/membership-rules-readme.md)
  
* October 31, 2020 - Earlier this year, a series of blog posts were published to help developers get started building bots with the framework:
  
  * [From zero to webex chatbot in 15 minutes](https://developer.webex.com/blog/from-zero-to-webex-teams-chatbot-in-15-minutes)
  * [Introducing the Webex bot framework for node.js](https://developer.webex.com/blog/introducing-the-webex-teams-bot-framework-for-node-js)
  * [A deeper dive into the framework](https://developer.webex.com/blog/a-deeper-dive-into-the-webex-bot-framework-for-node-js)
  * [Five tips for well behaved bots](https://developer.webex.com/blog/five-tips-for-well-behaved-webex-bots)

  For first timers, I strongly recommend following these, running the sample app, stepping through it in the debugger, and getting a sense of how the framework works.   Once you have done the detailed documentation here will make a lot more sense!


## [Full Version History](./docs/version-history.md)


## Contents

<!-- START doctoc -->
<!-- END doctoc -->
