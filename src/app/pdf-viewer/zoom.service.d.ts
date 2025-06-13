import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export declare class ZoomService {
    private zoomMutex;
    zoom: number;
    maxZoom: number;
    minZoom: number;
    private lastDistance;
    private isPinching;
    private ratioX;
    private ratioY;
    readonly triggerUpdateSize: BehaviorSubject<void>;
    initSettings(container: HTMLElement, isWheelZoom: boolean, isWheelCtrlZoom: boolean): void;
    limitZoom(): void;
    private zoomAtCursor;
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
