const path                 = require('path');
const { expect }           = require('chai');
const config               = require('../../../config');
const { createNullStream } = require('../../../utils/stream');
const createChromeProfile  = require('../../../../../lib/browser/provider/built-in/dedicated/chrome/create-temp-profile');
const createFirefoxProfile = require('../../../../../lib/browser/provider/built-in/dedicated/firefox/create-temp-profile');


// TODO: Refactor tests to avoid using shared browsers
if (config.useLocalBrowsers && !config.useHeadlessBrowsers && !config.hasBrowser('ie')) {
    describe('Browser Provider - Custom User Profile', () => {
        it('Should run tests in userProfile mode', () => {
            return testCafe
                .createRunner()
                .src(path.join(__dirname, './testcafe-fixtures/index-test.js'))
                .reporter('minimal', createNullStream())
                .browsers('chrome:userProfile', 'firefox:userProfile')
                .run({ nativeAutomation: config.nativeAutomation })
                .then(failedCount => {
                    expect(failedCount).eql(0);
                });
        });

        it('Should run tests with the explicitly specified profile', () => {
            return Promise
                .all([createChromeProfile('localhost'), createFirefoxProfile({ config: {} })])
                .then(([chromeProfile, firefoxProfile]) => {
                    return testCafe
                        .createRunner()
                        .src(path.join(__dirname, './testcafe-fixtures/index-test.js'))
                        .reporter('minimal', createNullStream())
                        .browsers(`chrome --user-data-dir=${chromeProfile.name}`, `firefox -profile ${firefoxProfile.name}`)
                        .run({ nativeAutomation: config.nativeAutomation });
                })
                .then(failedCount => {
                    expect(failedCount).eql(0);
                });
        });
    });
}
