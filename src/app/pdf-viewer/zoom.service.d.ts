import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class ZoomService {
    private zoomMutex;
    private ratioX;
    private ratioY;
    zoom: number;
    readonly triggerUpdateSize: BehaviorSubject<void>;
    initSettings(container: HTMLElement, isWheelZoom: boolean, isWheelCtrlZoom: boolean): void;
    private zoomAtCursor;
    private lastDistance;
    private isPinching;
    private onTouchStart;
    private onTouchMove;
    private onTouchEnd;
    private getDistance;
    saveScrollPosition(container: HTMLElement): void;
    restoreScrollPosition(container: HTMLElement): void;
    removeListeners(container: HTMLElement): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<ZoomService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<ZoomService>;
}
