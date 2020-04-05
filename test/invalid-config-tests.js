const Framework = require('../lib/framework');
const assert = require('assert');

console.log('********************************');
console.log('* Invalid configuration tests...');
console.log('********************************\n');

// Validate that framwork.start() fails with invalid configs
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
      'Unable to initiatilize with config param restrictedToEmailDomains: "big daddy"\n' +
      'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    options.restrictedToEmailDomains = 'big daddy';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.requeueSize is set')));
      })
      .catch((e) => {
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.restrictedToEmailDomains is not a domain', () => {
    options = {};
    let expectedError = 'Error: Invalid domain name: big\n' +
      'Unable to initiatilize with config param restrictedToEmailDomains: "big, daddy"\n' +
      'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    options.restrictedToEmailDomains = 'big, daddy';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.requeueSize is set')));
      })
      .catch((e) => {
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

  it('fails when options.restrictedToEmailDomains is not a domain', () => {
    options = {};
    let expectedError = 'Error: Invalid domain name: bar.\n' +
      'Unable to initiatilize with config param restrictedToEmailDomains: "foo.com,   bar. com"\n' +
      'Please set to a comma seperated list of valid email domains, ie: "mycompany.com,othercompany.com"';
    options.token = process.env.BOT_API_TOKEN;
    options.restrictedToEmailDomains = 'foo.com,   bar. com';
    f = new Framework(options);
    return f.start()
      .then(() => {
        return (Promise.reject(new Error('framework.start() should fail when options.requeueSize is set')));
      })
      .catch((e) => {
        assert(e.message === expectedError,
          `Got unexpected error response: ${e.message}`);
        return Promise.resolve(true);
      });
  });

});
