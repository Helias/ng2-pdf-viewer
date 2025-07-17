import * as i0 from "@angular/core";
export declare class PanService {
    enablePan: boolean;
    private isPanning;
    private mouseStartX;
    private mouseStartY;
    private scrollLeft;
    private scrollTop;
    startPan(event: MouseEvent, container: HTMLElement): void;
    endPan(container: HTMLElement): void;
    pan(event: MouseEvent, container: HTMLElement): void;
    static ɵfac: i0.ɵɵFactoryDeclaration<PanService, never>;
    static ɵprov: i0.ɵɵInjectableDeclaration<PanService>;
}
