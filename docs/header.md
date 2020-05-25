# webex-node-bot-framework

### Webex Teams Bot Framework for Node JS

This project is inspired by, and provides an alternate implementation of, the awesome [node-flint](https://github.com/flint-bot/flint/) framework by [Nick Marus](https://github.com/nmarus).  The framework makes it easy to quickly develop a Webex Teams bot, abstracting away some of the complexity of Webex For Developers interfaces, such as registering for events and calling REST APIs. A bot developer can use the framework to focus primarily on how the bot will interact with users in Webex Teams, by writing "handlers" for various message or membership events in spaces where the bot has been added.

The primary change in this implementation is that it is based on the [webex-jssdk](https://webex.github.io/webex-js-sdk) which continues to be supported as new features and functionality are added to Webex.  

For developers who are familiar with flint, or who wish to port existing bots built on node-flint to the webex-node-bot-framework, this implementation is NOT backwards compatible.  Please see [Migrating from the original flint framework](./docs/migrate-from-node-flint.md)

Feel free to join the ["Webex Node Bot Framework" space on Webex Teams](https://eurl.io/#BJ7gmlSeU) to ask questions and share tips on how to leverage this framework.

## News
* May, 2020 - Version 2 introduces a some new configuration options designed to help developers restrict access to their bot.   This can be helpful during the development phase (`guideEmails` parameter) or for production bots that should be restricted for use to users that have certain email domains (`restrictedToEmailDomains` parameter).   See [Membership-Rules README](./docs/membership-rules-readme.md)


## [Full Version History](./docs/version-history.md)


## Contents

<!-- START doctoc -->
<!-- END doctoc -->
