const { expect }        = require('chai');
const BrowserConnection = require('../../lib/browser/connection');
const Bootstrapper      = require('../../lib/runner/bootstrapper');

const {
    browserConnectionGatewayMock,
    configurationMock,
    compilerServiceMock,
    createBrowserProviderMock,
} = require('./helpers/mocks');

describe('Bootstrapper', () => {
    describe('.createRunnableConfiguration()', () => {
        let bootstrapper = null;

        beforeEach(() => {
            bootstrapper = new Bootstrapper({
                browserConnectionGateway: browserConnectionGatewayMock,
                configuration:            configurationMock,
                compilerService:          compilerServiceMock,
            });

            bootstrapper.browserInitTimeout           = 100;
            bootstrapper.TESTS_COMPILATION_UPPERBOUND = 0;

            bootstrapper.browsers = [ new BrowserConnection(browserConnectionGatewayMock, { provider: createBrowserProviderMock({ local: false }) }) ];
        });

        it('Browser connection error message should include hint that tests compilation takes too long', async function () {
            this.timeout(3000);

            try {
                await bootstrapper.createRunnableConfiguration();

                throw new Error('Promise rejection expected');
            }
            catch (err) {
                expect(err.message).contains('Tests took too long to compile');
            }
        });

        it('Should raise an error if fixture.globalBefore is not a function', async function () {
            bootstrapper.hooks = {
                fixture: {
                    before: 'yo',
                },
            };

            try {
                await bootstrapper.createRunnableConfiguration();

                throw new Error('Promise rejection expected');
            }
            catch (err) {
                expect(err.message).eql('Cannot prepare tests due to the following error:\n\n' +
                                          'The fixture.globalBefore hook (string) is not of expected type (function).');
            }
        });

        it('Should raise an error if fixture.globalAfter is not a function', async function () {
            bootstrapper.hooks = {
                fixture: {
                    after: 'yo',
                },
            };

            try {
                await bootstrapper.createRunnableConfiguration();

                throw new Error('Promise rejection expected');
            }
            catch (err) {
                expect(err.message).eql('Cannot prepare tests due to the following error:\n\n' +
                                        'The fixture.globalAfter hook (string) is not of expected type (function).');
            }
        });

        it('Should raise an error if test.globalBefore is not a function', async function () {
            bootstrapper.hooks = {
                test: {
                    before: 'yo',
                },
            };

            try {
                await bootstrapper.createRunnableConfiguration();

                throw new Error('Promise rejection expected');
            }
            catch (err) {
                expect(err.message).eql('Cannot prepare tests due to the following error:\n\n' +
                                        'The test.globalBefore hook (string) is not of expected type (function).');
            }
        });

        it('Should raise an error if test.globalAfter is not a function', async function () {
            bootstrapper.hooks = {
                test: {
                    after: 'yo',
                },
            };

            try {
                await bootstrapper.createRunnableConfiguration();

                throw new Error('Promise rejection expected');
            }
            catch (err) {
                expect(err.message).eql('Cannot prepare tests due to the following error:\n\n' +
                                        'The test.globalAfter hook (string) is not of expected type (function).');
            }
        });
    });
});
