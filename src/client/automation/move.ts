import nextTick from '../core/utils/next-tick';
import AutomationSettings from './settings';
import {
    Modifiers,
    MoveOptions,
    ScrollOptions,
} from '../../test-run/commands/options';
import lastHoveredElementHolder from './last-hovered-element-holder';

import {
    // @ts-ignore
    nativeMethods,
    // @ts-ignore
    Promise,
    // @ts-ignore
    utils,
} from '../driver/deps/hammerhead';

import * as domUtils from '../core/utils/dom';
import * as styleUtils from '../core/utils/style';
import * as positionUtils from '../core/utils/position';
import * as eventUtils from '../core/utils/event';
import ScrollAutomation from '../core/scroll';
import getElementExceptUI from './utils/get-element-except-ui';
import getAutomationPoint from './utils/get-automation-point';
import AxisValues, { AxisValuesData } from '../core/utils/values/axis-values';
import Cursor from './cursor/cursor';
import getDevicePoint from './utils/get-device-point';
import createEventSequence from './playback/move/event-sequence/create-event-sequence';
import sendRequestToFrame from '../core/utils/send-request-to-frame';
import NativeAutomationInput from '../../native-automation/client/input';
import mouseMoveStep from './playback/move/mouse-move-step';

const MOVE_REQUEST_CMD  = 'automation|move|request';
const MOVE_RESPONSE_CMD = 'automation|move|response';

interface MoveAutomationTarget {
    element: HTMLElement;
    offset: AxisValuesData<number>;
}

export default class MoveAutomation {
    private readonly touchMode: boolean;
    private readonly moveEvent: string;
    private automationSettings: AutomationSettings;
    private readonly element: HTMLElement;
    private readonly window: Window;
    private readonly offset: AxisValuesData<number>;
    private cursor: Cursor;
    private readonly speed: number;
    private readonly cursorSpeed: number;
    private readonly minMovingTime: number;
    private readonly modifiers: Modifiers;
    private readonly skipScrolling: boolean;
    private skipDefaultDragBehavior: boolean;
    private firstMovingStepOccured: boolean;
    private readonly nativeAutomationInput: NativeAutomationInput | null;


    protected constructor (el: HTMLElement,
        offset: AxisValuesData<number>,
        moveOptions: MoveOptions,
        win: Window,
        cursor: Cursor,
        nativeAutomationInput: NativeAutomationInput | null = null) {

        this.touchMode = utils.featureDetection.isTouchDevice;
        this.moveEvent = this.touchMode ? 'touchmove' : 'mousemove';

        this.automationSettings = new AutomationSettings(moveOptions.speed);

        this.cursorSpeed = this._getCursorSpeed();

        this.element = el;
        this.window  = win;
        this.offset  = offset;
        this.cursor  = cursor;

        this.minMovingTime           = moveOptions.minMovingTime || 0;
        this.modifiers               = moveOptions.modifiers || {};
        this.skipScrolling           = moveOptions.skipScrolling;
        this.skipDefaultDragBehavior = moveOptions.skipDefaultDragBehavior;
        this.speed                   = moveOptions.speed;
        this.nativeAutomationInput          = nativeAutomationInput || null;

        this.firstMovingStepOccured  = false;
    }

    public static async create (el: HTMLElement,
        moveOptions: MoveOptions,
        win: Window,
        cursor: Cursor,
        nativeAutomationInput: NativeAutomationInput | null = null): Promise<MoveAutomation> {
        const { element, offset } = await MoveAutomation.getTarget(el, win, new AxisValues(moveOptions.offsetX, moveOptions.offsetY));

        return new MoveAutomation(element, offset, moveOptions, win, cursor, nativeAutomationInput);
    }

    private static getTarget (element: HTMLElement, window: Window, offset: AxisValuesData<number>): Promise<MoveAutomationTarget> {
        // NOTE: if the target point (considering offsets) is out of
        // the element change the target element to the document element
        return Promise.resolve(positionUtils.containsOffset(element, offset.x, offset.y))
            .then((containsOffset: boolean) => {
                if (!containsOffset) {
                    return Promise.all([
                        getAutomationPoint(element, offset),
                        domUtils.getDocumentElement(window),
                    ])
                        .then(([point, docEl]: [any, HTMLElement]) => ({ element: docEl, offset: point }));
                }

                return { element, offset };
            });
    }

    private _getCursorSpeed (): number {
        return this.automationSettings.cursorSpeed;
    }

    private _getTargetClientPoint (): Promise<AxisValues<number>> {
        return Promise.resolve(styleUtils.getElementScroll(this.element))
            .then((scroll: any) => {
                if (domUtils.isHtmlElement(this.element)) {
                    return AxisValues.create(this.offset)
                        .sub(AxisValues.create(scroll))
                        .round(Math.round);
                }

                return Promise.resolve(positionUtils.getClientPosition(this.element))
                    .then((clientPosition: any) => {
                        const isDocumentBody = domUtils.isBodyElement(this.element);
                        // @ts-ignore
                        const clientPoint = AxisValues.create(clientPosition).add(this.offset);

                        if (!isDocumentBody)
                            clientPoint.sub(AxisValues.create(scroll));

                        return clientPoint.round(Math.floor);
                    });
            });
    }

    protected _getEventSequenceOptions (currPosition: AxisValuesData<number>): Promise<any> {
        const button      = eventUtils.BUTTONS_PARAMETER.noButton;
        const devicePoint = getDevicePoint(currPosition);

        const eventOptions = {
            clientX: currPosition.x,
            clientY: currPosition.y,
            screenX: devicePoint?.x,
            screenY: devicePoint?.y,
            buttons: button,
            ctrl:    this.modifiers.ctrl,
            alt:     this.modifiers.alt,
            shift:   this.modifiers.shift,
            meta:    this.modifiers.meta,
        };

        return { eventOptions, eventSequenceOptions: { moveEvent: this.moveEvent } };
    }

    private _runEventSequence (currentElement: Element, { eventOptions, eventSequenceOptions }: any): Promise<any> {
        const eventSequence = createEventSequence(false, this.firstMovingStepOccured, eventSequenceOptions);

        return eventSequence.run(
            currentElement,
            lastHoveredElementHolder.get(),
            eventOptions,
            null,
            null
        );
    }

    private _emulateEvents (currentElement: Element, currPosition: AxisValuesData<number>): Promise<void> {
        const options = this._getEventSequenceOptions(currPosition);

        this._runEventSequence(currentElement, options);
        this.firstMovingStepOccured = true;

        lastHoveredElementHolder.set(currentElement);
    }

    private _movingStep (currPosition: AxisValuesData<number>): Promise<void> {
        return this.cursor.move(currPosition)
            .then(() => getElementExceptUI(this.cursor.getPosition()))
            // NOTE: in touch mode, events are simulated for the element for which mousedown was simulated (GH-372)
            .then((topElement: HTMLElement) => {
                const currentElement = this._getCorrectedTopElement(topElement);

                // NOTE: it can be null in IE
                if (!currentElement)
                    return null;

                return this._emulateEvents(currentElement, currPosition);
            })
            .then(nextTick);
    }

    private _getCorrectedTopElement (topElement: Element): Element {
        return topElement;
    }

    private async _move (endPoint: AxisValues<number>): Promise<void> {
        const startPoint = this.cursor.getPosition();
        const distance   = AxisValues.create(endPoint).sub(startPoint);
        const movingTime = Math.max(Math.max(Math.abs(distance.x), Math.abs(distance.y)) / this.cursorSpeed, this.minMovingTime);

        const mouseMoveOptions = {
            startPoint,
            endPoint,
            movingTime,
            distance,
            needMoveImmediately: this._needMoveCursorImmediately(),
        };

        if (this.nativeAutomationInput) {
            const events: any[] = [];

            await mouseMoveStep(mouseMoveOptions, nativeMethods.dateNow, async currPosition => {
                const moveEvent = await this.nativeAutomationInput?.createMouseMoveEvent(currPosition);

                events.push(moveEvent);

                return nextTick();
            });

            await this.nativeAutomationInput.executeEventSequence(events);

            await this.cursor.move(endPoint);
        }
        else {
            await mouseMoveStep(mouseMoveOptions, nativeMethods.dateNow, currPosition => {
                return this._movingStep(currPosition);
            });
        }
    }
    //
    private _needMoveCursorImmediately (): boolean {
        return this.touchMode;
    }

    private _scroll (): Promise<boolean> {
        if (this.skipScrolling)
            return Promise.resolve(false);

        const scrollOptions    = new ScrollOptions({ offsetX: this.offset.x, offsetY: this.offset.y }, false);
        const scrollAutomation = new ScrollAutomation(this.element, scrollOptions);

        return scrollAutomation.run();
    }

    private _moveToCurrentFrame (endPoint: AxisValues<number>, nativeAutomationMove: boolean): Promise<void> {
        if (this.cursor.isActive(this.window))
            return Promise.resolve();

        const { x, y }        = this.cursor.getPosition();
        const activeWindow    = this.cursor.getActiveWindow(this.window);
        let iframe: any       = null;
        let iframeUnderCursor: boolean | null = null;

        const msg: any = {
            cmd:       MOVE_REQUEST_CMD,
            startX:    x,
            startY:    y,
            endX:      endPoint.x,
            endY:      endPoint.y,
            modifiers: this.modifiers,
            speed:     this.speed,
            nativeAutomationMove,
        };

        return Promise.resolve()
            .then(() => {
                if (activeWindow.parent === this.window) {
                    return Promise.resolve(domUtils.findIframeByWindow(activeWindow))
                        .then((frame: any) => {
                            iframe = frame;

                            return Promise.resolve(positionUtils.getIframeClientCoordinates(frame))
                                .then((rect: any) => {
                                    msg.left   = rect.left;
                                    msg.top    = rect.top;
                                    msg.right  = rect.right;
                                    msg.bottom = rect.bottom;
                                });
                        });
                }

                return void 0;
            })
            .then(() => {
                return getElementExceptUI(this.cursor.getPosition());
            })
            .then((topElement: any) => {
                iframeUnderCursor = topElement === iframe;

                if (activeWindow.parent === this.window)
                    msg.iframeUnderCursor = iframeUnderCursor;

                return sendRequestToFrame(msg, MOVE_RESPONSE_CMD, activeWindow);
            })
            .then((message: any) => {
                this.cursor.setActiveWindow(this.window);

                if (iframeUnderCursor || utils.dom.isIframeWindow(this.window))
                    return this.cursor.move(message);

                return void 0;
            });
    }

    public run (): Promise<void> {
        return this._scroll()
            .then(() => Promise.all([
                this._getTargetClientPoint(),
                styleUtils.getWindowDimensions(this.window),
            ]))
            .then(([endPoint, boundary]: [any, any]) => {
                if (!boundary.contains(endPoint))
                    return void 0;

                return this._moveToCurrentFrame(endPoint, !!this.nativeAutomationInput)
                    .then(() => this._move(endPoint));
            });
    }
}
