import { TestRunDispatcherProtocol } from './compiler/protocol';
import { Dictionary } from '../configuration/interfaces';
import Test from '../api/structure/test';
import MessageBus from '../utils/message-bus';

export interface TestRunProxyInit {
    dispatcher: TestRunDispatcherProtocol;
    id: string;
    test: Test;
    options: Dictionary<OptionValue>;
    browser: Browser;
    activeWindowId: null | string;
    messageBus?: MessageBus;
    isNativeAutomation: boolean;
}

