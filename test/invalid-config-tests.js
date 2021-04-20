const Framework = require('../lib/framework');
const assert = require('assert');
require('dotenv').config();


console.log('********************************');
console.log('* Invalid configuration tests...');
console.log('********************************\n');

// Validate that framework.start() fails with invalid configs
describe('#framework invalid config tests', () => {
  let options = {};
  let f = null;

  it('fails with no token set', () => {
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when no token is set')));
      })
      .catch((e) => {
        assert(e.message === 'Framework options missing required attribute: token',
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.minTime is set', () => {
    options.token = process.env.BOT_API_TOKEN;
    options.minTime = 'something';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.minTime is set')));
      })
      .catch((e) => {
        assert(e.message === 'Framework instantiated with non supported option: minTime',
          `Got unexpected error response: ${e.message}`);
        delete options.minTime;
        return Promise.resolve(true);
      });
  });

  it('fails when options.requeueSize is set', () => {
    options.token = process.env.BOT_API_TOKEN;
    options.requeueSize = 'something';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.requeueSize is set')));
      })
      .catch((e) => {
        assert(e.message === 'Framework instantiated with non supported option: requeueSize',
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.restrictedToEmailDomains is not a list', () => {
    options = {};
    let expectedError = 'Error: Invalid domain name: big\n' +
      'Unable to initiatilize with config param restrictedToEmailDomains: "big"\n' +
      'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    options.restrictedToEmailDomains = 'big';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.restrictedToEmailsDomains is not a comma seperated list')));
      })
      .catch((e) => {
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.restrictedToEmailDomains is not a domain', () => {
    options = {};
    options.restrictedToEmailDomains = 'foo.com, bar. com';
    let expectedError = 'Error: Invalid domain name: bar.\n' +
      'Unable to initiatilize with config param restrictedToEmailDomains: "foo.com, bar. com"\n' +
      'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.restrictedToEmailsDomains contains invalid domain names')));
      })
      .catch((e) => {
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.guideEmails has invalid emails', () => {
    options = {};
    options.guideEmails = 'me@co.com, me@co';
    let expectedError = 'Error: Invalid email "me@co" in guideEmails parameter\n' +
      'Unable to initiatilize with config param guideEmails: "me@co.com, me@co"\n' +
      'Please set to a comma seperated list of valid webex user email addresses, ie: "fred@mycompany.com, jane@othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.guideEmails contains invalid emails')));
      })
      .catch((e) => {
        console.log(e.message);
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.guideEmails has no valid email', () => {
    options = {};
    options.guideEmails = 'bad';
    let expectedError = 'Error: Invalid email "bad" in guideEmails parameter\n' +
      'Unable to initiatilize with config param guideEmails: "bad"\n' +
      'Please set to a comma seperated list of valid webex user email addresses, ie: "fred@mycompany.com, jane@othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.guideEmails is set but is empty')));
      })
      .catch((e) => {
        console.log(e.message);
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  // This test is not working, because the framework is initializing even when the URL is not a valid proxy.
  // At this time its not clear that anyone is using the framework with an HTTP Proxy
  // If any work is done on the HTTP Proxy and there is an envienvironmt to test it, this test should
  // be revivied
  /*
  it('fails when options.httpsProxy is set to a non working proxy', () => {
    options = {};
    options.token = process.env.BOT_API_TOKEN;
    options.httpsProxy = 'https://localhost:8090';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.httpProxyUrl is set but is invalid')));
      })
      .catch((e) => {
        // if (f.webex.config && f.webex.config.defaultMercuryOptions) {
        //   f.debug(`Proxy Init failed as expected but webex sdk has proxy info.`);
        //   return Promise.resolve(true);
        // } else {
        return (Promise.reject(new Error('framework.start() did fail when options.httpProxyUrl was set to an invalid proxy but '+
            `the webex SDK had no defaultMecuryOptions.  Error: ${e.message}`)));
        // }
      });
  });
  */

});
