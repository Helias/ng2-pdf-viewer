/**
 * Created by vadimdez on 21/06/16.
 */
import { Component, ElementRef, EventEmitter, inject, Input, NgZone, Output, ViewChild, } from '@angular/core';
import * as PDFJS from 'pdfjs-dist';
import * as PDFJSViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import { combineLatest, from, fromEvent, Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { createEventBus } from '../utils/event-bus-utils';
import { assign, isSSR } from '../utils/helpers';
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist';
import { PanService } from './services/pan.service';
import { ZoomService } from './services/zoom.service';
import * as i0 from "@angular/core";
if (!isSSR()) {
    assign(PDFJS, 'verbosity', VerbosityLevel.INFOS);
}
// @ts-expect-error This does not exist outside of polyfill which this is doing
if (typeof Promise.withResolvers === 'undefined' && window) {
    // @ts-expect-error This does not exist outside of polyfill which this is doing
    window.Promise.withResolvers = () => {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}
export class PdfViewerComponent {
    static CSS_UNITS = 96.0 / 72.0;
    static BORDER_WIDTH = 9;
    pdfViewerContainer;
    eventBus;
    pdfLinkService;
    pdfFindController;
    pdfViewer;
    isVisible = false;
    _cMapsUrl = typeof PDFJS !== 'undefined'
        ? `https://unpkg.com/pdfjs-dist@${PDFJS.version}/cmaps/`
        : null;
    _imageResourcesPath = typeof PDFJS !== 'undefined'
        ? `https://unpkg.com/pdfjs-dist@${PDFJS.version}/web/images/`
        : undefined;
    _renderText = true;
    _renderTextMode = 1 /* RenderTextMode.ENABLED */;
    _stickToPage = false;
    _originalSize = true;
    _pdf;
    _page = 1;
    _zoomScale = 'page-width';
    _rotation = 0;
    _showAll = true;
    _canAutoResize = true;
    _fitToPage = false;
    _externalLinkTarget = 'blank';
    _showBorders = false;
    lastLoaded;
    _latestScrolledPage;
    pageScrollTimeout = null;
    isInitialized = false;
    loadingTask;
    destroy$ = new Subject();
    updateSizeSub$ = null;
    afterLoadComplete = new EventEmitter();
    pageRendered = new EventEmitter();
    pageInitialized = new EventEmitter();
    textLayerRendered = new EventEmitter();
    onError = new EventEmitter();
    onProgress = new EventEmitter();
    pageChange = new EventEmitter(true);
    src;
    set cMapsUrl(cMapsUrl) {
        this._cMapsUrl = cMapsUrl;
    }
    set page(_page) {
        _page = parseInt(_page, 10) || 1;
        const originalPage = _page;
        if (this._pdf) {
            _page = this.getValidPageNumber(_page);
        }
        this._page = _page;
        if (originalPage !== _page) {
            this.pageChange.emit(_page);
        }
    }
    set renderText(renderText) {
        this._renderText = renderText;
    }
    set renderTextMode(renderTextMode) {
        this._renderTextMode = renderTextMode;
    }
    set originalSize(originalSize) {
        this._originalSize = originalSize;
    }
    set showAll(value) {
        this._showAll = value;
    }
    set stickToPage(value) {
        this._stickToPage = value;
    }
    set zoom(value) {
        if (value <= 0) {
            return;
        }
        this.zoomService.zoom = value;
        this.zoomService.limitZoom();
    }
    get zoom() {
        return this.zoomService.zoom;
    }
    zoomChange = new EventEmitter();
    set zoomScale(value) {
        this._zoomScale = value;
    }
    get zoomScale() {
        return this._zoomScale;
    }
    set rotation(value) {
        if (!(typeof value === 'number' && value % 90 === 0)) {
            console.warn('Invalid pages rotation angle.');
            return;
        }
        this._rotation = value;
    }
    set externalLinkTarget(value) {
        this._externalLinkTarget = value;
    }
    set autoresize(value) {
        this._canAutoResize = Boolean(value);
    }
    set fitToPage(value) {
        this._fitToPage = Boolean(value);
    }
    set showBorders(value) {
        this._showBorders = Boolean(value);
    }
    isWheelZoom = true;
    isWheelCtrlZoom = true;
    isOptimizeZoom = true;
    set minZoom(value) {
        this.zoomService.minZoom = value;
        this.zoomService.limitZoom();
    }
    set maxZoom(value) {
        this.zoomService.maxZoom = value;
        this.zoomService.limitZoom();
    }
    set enablePan(enablePan) {
        this.panService.enablePan = enablePan;
        const cursor = enablePan ? 'grab' : 'default';
        if (this.pdfViewerContainer?.nativeElement) {
            this.pdfViewerContainer.nativeElement.style.cursor = cursor;
        }
    }
    static getLinkTarget(type) {
        switch (type) {
            case 'blank':
                return PDFJSViewer.LinkTarget.BLANK;
            case 'none':
                return PDFJSViewer.LinkTarget.NONE;
            case 'self':
                return PDFJSViewer.LinkTarget.SELF;
            case 'parent':
                return PDFJSViewer.LinkTarget.PARENT;
            case 'top':
                return PDFJSViewer.LinkTarget.TOP;
        }
        return null;
    }
    element = inject((ElementRef));
    ngZone = inject(NgZone);
    zoomService = inject(ZoomService);
    panService = inject(PanService);
    constructor() {
        if (isSSR()) {
            return;
        }
        let pdfWorkerSrc;
        const pdfJsVersion = PDFJS.version;
        const versionSpecificPdfWorkerUrl = window[`pdfWorkerSrc${pdfJsVersion}`];
        if (versionSpecificPdfWorkerUrl) {
            pdfWorkerSrc = versionSpecificPdfWorkerUrl;
        }
        else if (window.hasOwnProperty('pdfWorkerSrc') &&
            typeof window.pdfWorkerSrc === 'string' &&
            window.pdfWorkerSrc) {
            pdfWorkerSrc = window.pdfWorkerSrc;
        }
        else {
            pdfWorkerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/legacy/build/pdf.worker.min.mjs`;
        }
        assign(GlobalWorkerOptions, 'workerSrc', pdfWorkerSrc);
    }
    ngAfterViewChecked() {
        if (this.isInitialized) {
            return;
        }
        const offset = this.pdfViewerContainer?.nativeElement.offsetParent;
        if (this.isVisible === true && offset == null) {
            this.isVisible = false;
            return;
        }
        if (this.isVisible === false && offset != null) {
            this.isVisible = true;
            setTimeout(() => {
                this.initialize();
                this.ngOnChanges({ src: this.src });
            });
        }
    }
    ngAfterViewInit() {
        this.zoomService.initSettings(this.pdfViewerContainer?.nativeElement, this.isWheelZoom, this.isWheelCtrlZoom);
    }
    ngOnInit() {
        this.initialize();
        this.setupResizeListener();
    }
    ngOnDestroy() {
        if (this.updateSizeSub$) {
            this.updateSizeSub$.unsubscribe();
        }
        this.destroy$.next();
        this.destroy$.complete();
        this.clear();
        this.zoomService.removeListeners(this.pdfViewerContainer?.nativeElement);
        this.loadingTask = null;
    }
    ngOnChanges(changes) {
        if (isSSR() || !this.isVisible) {
            return;
        }
        if ('src' in changes) {
            this.loadPDF();
        }
        else if (this._pdf) {
            if ('renderText' in changes || 'showAll' in changes) {
                this.setupViewer();
                this.resetPdfDocument();
            }
            if ('page' in changes) {
                const { page } = changes;
                if (page.currentValue === this._latestScrolledPage) {
                    return;
                }
                // New form of page changing: The viewer will now jump to the specified page when it is changed.
                // This behavior is introduced by using the PDFSinglePageViewer
                this.pdfViewer.scrollPageIntoView({ pageNumber: this._page });
            }
            this.update();
        }
    }
    updateSize() {
        if (this.updateSizeSub$) {
            this.updateSizeSub$.unsubscribe();
        }
        this.updateSizeSub$ = combineLatest([
            from(this._pdf.getPage(this.pdfViewer.currentPageNumber)),
            this.zoomService.triggerUpdateSize$,
        ])
            .pipe(takeUntil(this.destroy$))
            .subscribe({
            next: ([page]) => {
                if (this.isOptimizeZoom || this.isWheelZoom) {
                    this.zoomService.saveScrollPosition(this.pdfViewerContainer?.nativeElement);
                }
                const rotation = this._rotation + page.rotate;
                const viewportWidth = page.getViewport({
                    scale: this.zoomService.zoom,
                    rotation,
                }).width * PdfViewerComponent.CSS_UNITS;
                let scale = this.zoomService.zoom;
                let stickToPage = true;
                // Scale the document when it shouldn't be in original size or doesn't fit into the viewport
                if (!this._originalSize ||
                    (this._fitToPage &&
                        viewportWidth >
                            this.pdfViewerContainer?.nativeElement.clientWidth)) {
                    const viewPort = page.getViewport({ scale: 1, rotation });
                    scale = this.getScale(viewPort.width, viewPort.height);
                    stickToPage = !this._stickToPage;
                }
                this.pdfViewer.currentScale = scale;
                if (stickToPage)
                    this.pdfViewer.scrollPageIntoView({
                        pageNumber: page.pageNumber,
                        ignoreDestinationZoom: true,
                    });
                if (this.isOptimizeZoom || this.isWheelZoom) {
                    this.zoomService.restoreScrollPosition(this.pdfViewerContainer?.nativeElement);
                }
                this.zoomChange.emit(this.zoomService.zoom);
            },
        });
    }
    clear() {
        if (this.pageScrollTimeout) {
            clearTimeout(this.pageScrollTimeout);
        }
        if (this.loadingTask && !this.loadingTask.destroyed) {
            this.loadingTask.destroy();
        }
        if (this._pdf) {
            this._latestScrolledPage = 0;
            this._pdf.destroy();
            this._pdf = undefined;
        }
        this.pdfViewer && this.pdfViewer.setDocument(null);
        this.pdfLinkService && this.pdfLinkService.setDocument(null, null);
        this.pdfFindController && this.pdfFindController.setDocument(null);
    }
    getPDFLinkServiceConfig() {
        const linkTarget = PdfViewerComponent.getLinkTarget(this._externalLinkTarget);
        if (linkTarget) {
            return { externalLinkTarget: linkTarget };
        }
        return {};
    }
    initEventBus() {
        this.eventBus = createEventBus(PDFJSViewer, this.destroy$);
        fromEvent(this.eventBus, 'pagerendered')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.pageRendered.emit(event);
        });
        fromEvent(this.eventBus, 'pagesinit')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.pageInitialized.emit(event);
        });
        fromEvent(this.eventBus, 'pagechanging')
            .pipe(takeUntil(this.destroy$))
            .subscribe(({ pageNumber }) => {
            if (this.pageScrollTimeout) {
                clearTimeout(this.pageScrollTimeout);
            }
            this.pageScrollTimeout = window.setTimeout(() => {
                this._latestScrolledPage = pageNumber;
                this.pageChange.emit(pageNumber);
            }, 100);
        });
        fromEvent(this.eventBus, 'textlayerrendered')
            .pipe(takeUntil(this.destroy$))
            .subscribe((event) => {
            this.textLayerRendered.emit(event);
        });
    }
    initPDFServices() {
        this.pdfLinkService = new PDFJSViewer.PDFLinkService({
            eventBus: this.eventBus,
            ...this.getPDFLinkServiceConfig(),
        });
        this.pdfFindController = new PDFJSViewer.PDFFindController({
            eventBus: this.eventBus,
            linkService: this.pdfLinkService,
        });
    }
    getPDFOptions() {
        return {
            eventBus: this.eventBus,
            container: this.element.nativeElement.querySelector('div'),
            removePageBorders: !this._showBorders,
            linkService: this.pdfLinkService,
            textLayerMode: this._renderText
                ? this._renderTextMode
                : 0 /* RenderTextMode.DISABLED */,
            findController: this.pdfFindController,
            l10n: new PDFJSViewer.GenericL10n('en'),
            imageResourcesPath: this._imageResourcesPath,
            annotationEditorMode: PDFJS.AnnotationEditorType.DISABLE,
        };
    }
    setupViewer() {
        if (this.pdfViewer) {
            this.pdfViewer.setDocument(null);
        }
        assign(PDFJS, 'disableTextLayer', !this._renderText);
        this.initPDFServices();
        if (this._showAll) {
            this.pdfViewer = new PDFJSViewer.PDFViewer(this.getPDFOptions());
        }
        else {
            this.pdfViewer = new PDFJSViewer.PDFSinglePageViewer(this.getPDFOptions());
        }
        this.pdfLinkService.setViewer(this.pdfViewer);
        this.pdfViewer._currentPageNumber = this._page;
    }
    getValidPageNumber(page) {
        if (page < 1) {
            return 1;
        }
        if (page > this._pdf.numPages) {
            return this._pdf.numPages;
        }
        return page;
    }
    getDocumentParams() {
        const srcType = typeof this.src;
        if (!this._cMapsUrl) {
            return this.src;
        }
        const params = {
            cMapUrl: this._cMapsUrl,
            cMapPacked: true,
            enableXfa: true,
        };
        params.isEvalSupported = false; // http://cve.org/CVERecord?id=CVE-2024-4367
        if (srcType === 'string') {
            params.url = this.src;
        }
        else if (srcType === 'object') {
            if (this.src.byteLength !== undefined) {
                params.data = this.src;
            }
            else {
                Object.assign(params, this.src);
            }
        }
        return params;
    }
    loadPDF() {
        if (!this.src) {
            return;
        }
        if (this.lastLoaded === this.src) {
            this.update();
            return;
        }
        this.clear();
        this.setupViewer();
        this.loadingTask = getDocument(this.getDocumentParams());
        this.loadingTask.onProgress = (progressData) => {
            this.onProgress.emit(progressData);
        };
        const src = this.src;
        from(this.loadingTask.promise)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
            next: (pdf) => {
                this._pdf = pdf;
                this.lastLoaded = src;
                this.afterLoadComplete.emit(pdf);
                this.resetPdfDocument();
                this.update();
            },
            error: (error) => {
                this.lastLoaded = null;
                this.onError.emit(error);
            },
        });
    }
    update() {
        this.page = this._page;
        this.render();
    }
    render() {
        this._page = this.getValidPageNumber(this._page);
        if (this._rotation !== 0 ||
            this.pdfViewer.pagesRotation !== this._rotation) {
            // wait until at least the first page is available.
            this.pdfViewer.firstPagePromise?.then(() => (this.pdfViewer.pagesRotation = this._rotation));
        }
        if (this._stickToPage) {
            setTimeout(() => {
                this.pdfViewer.currentPageNumber = this._page;
            });
        }
        if (!this.pdfViewer._pages?.length) {
            // the first time we wait until pages init
            const sub = this.pageInitialized.subscribe(() => {
                this.updateSize();
                sub.unsubscribe();
            });
        }
        else {
            this.updateSize();
        }
    }
    getScale(viewportWidth, viewportHeight) {
        const borderSize = this._showBorders
            ? 2 * PdfViewerComponent.BORDER_WIDTH
            : 0;
        const pdfContainerWidth = this.pdfViewerContainer?.nativeElement.clientWidth - borderSize;
        const pdfContainerHeight = this.pdfViewerContainer?.nativeElement.clientHeight - borderSize;
        if (pdfContainerHeight === 0 ||
            viewportHeight === 0 ||
            pdfContainerWidth === 0 ||
            viewportWidth === 0) {
            return 1;
        }
        let ratio = 1;
        switch (this._zoomScale) {
            case 'page-fit':
                ratio = Math.min(pdfContainerHeight / viewportHeight, pdfContainerWidth / viewportWidth);
                break;
            case 'page-height':
                ratio = pdfContainerHeight / viewportHeight;
                break;
            case 'page-width':
            default:
                ratio = pdfContainerWidth / viewportWidth;
                break;
        }
        return (this.zoomService.zoom * ratio) / PdfViewerComponent.CSS_UNITS;
    }
    resetPdfDocument() {
        this.pdfLinkService.setDocument(this._pdf, null);
        this.pdfFindController.setDocument(this._pdf);
        this.pdfViewer.setDocument(this._pdf);
    }
    initialize() {
        if (isSSR() || !this.isVisible) {
            return;
        }
        this.isInitialized = true;
        this.initEventBus();
        this.setupViewer();
    }
    setupResizeListener() {
        if (isSSR()) {
            return;
        }
        this.ngZone.runOutsideAngular(() => {
            fromEvent(window, 'resize')
                .pipe(debounceTime(100), filter(() => this._canAutoResize && !!this._pdf), takeUntil(this.destroy$))
                .subscribe(() => {
                this.updateSize();
            });
        });
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PdfViewerComponent, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.0", type: PdfViewerComponent, selector: "pdf-viewer", inputs: { src: "src", cMapsUrl: ["c-maps-url", "cMapsUrl"], page: "page", renderText: ["render-text", "renderText"], renderTextMode: ["render-text-mode", "renderTextMode"], originalSize: ["original-size", "originalSize"], showAll: ["show-all", "showAll"], stickToPage: ["stick-to-page", "stickToPage"], zoom: "zoom", zoomScale: ["zoom-scale", "zoomScale"], rotation: "rotation", externalLinkTarget: ["external-link-target", "externalLinkTarget"], autoresize: "autoresize", fitToPage: ["fit-to-page", "fitToPage"], showBorders: ["show-borders", "showBorders"], isWheelZoom: "isWheelZoom", isWheelCtrlZoom: "isWheelCtrlZoom", isOptimizeZoom: "isOptimizeZoom", minZoom: "minZoom", maxZoom: "maxZoom", enablePan: "enablePan" }, outputs: { afterLoadComplete: "after-load-complete", pageRendered: "page-rendered", pageInitialized: "pages-initialized", textLayerRendered: "text-layer-rendered", onError: "error", onProgress: "on-progress", pageChange: "pageChange", zoomChange: "zoomChange" }, providers: [ZoomService, PanService], viewQueries: [{ propertyName: "pdfViewerContainer", first: true, predicate: ["pdfViewerContainer"], descendants: true }], usesOnChanges: true, ngImport: i0, template: `
    <div
      #pdfViewerContainer
      class="ng2-pdf-viewer-container"
      (mousedown)="panService.startPan($event, pdfViewerContainer)"
      (mouseup)="panService.endPan(pdfViewerContainer)"
      (mouseleave)="panService.endPan(pdfViewerContainer)"
      (mousemove)="panService.pan($event, pdfViewerContainer)"
    >
      <div class="pdfViewer"></div>
    </div>
  `, isInline: true, styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .canvasWrapper canvas{width:100%}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,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) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PdfViewerComponent, decorators: [{
            type: Component,
            args: [{ selector: 'pdf-viewer', template: `
    <div
      #pdfViewerContainer
      class="ng2-pdf-viewer-container"
      (mousedown)="panService.startPan($event, pdfViewerContainer)"
      (mouseup)="panService.endPan(pdfViewerContainer)"
      (mouseleave)="panService.endPan(pdfViewerContainer)"
      (mousemove)="panService.pan($event, pdfViewerContainer)"
    >
      <div class="pdfViewer"></div>
    </div>
  `, providers: [ZoomService, PanService], styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .canvasWrapper canvas{width:100%}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,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) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] }]
        }], ctorParameters: function () { return []; }, propDecorators: { pdfViewerContainer: [{
                type: ViewChild,
                args: ['pdfViewerContainer']
            }], afterLoadComplete: [{
                type: Output,
                args: ['after-load-complete']
            }], pageRendered: [{
                type: Output,
                args: ['page-rendered']
            }], pageInitialized: [{
                type: Output,
                args: ['pages-initialized']
            }], textLayerRendered: [{
                type: Output,
                args: ['text-layer-rendered']
            }], onError: [{
                type: Output,
                args: ['error']
            }], onProgress: [{
                type: Output,
                args: ['on-progress']
            }], pageChange: [{
                type: Output
            }], src: [{
                type: Input
            }], cMapsUrl: [{
                type: Input,
                args: ['c-maps-url']
            }], page: [{
                type: Input,
                args: ['page']
            }], renderText: [{
                type: Input,
                args: ['render-text']
            }], renderTextMode: [{
                type: Input,
                args: ['render-text-mode']
            }], originalSize: [{
                type: Input,
                args: ['original-size']
            }], showAll: [{
                type: Input,
                args: ['show-all']
            }], stickToPage: [{
                type: Input,
                args: ['stick-to-page']
            }], zoom: [{
                type: Input
            }], zoomChange: [{
                type: Output
            }], zoomScale: [{
                type: Input,
                args: ['zoom-scale']
            }], rotation: [{
                type: Input,
                args: ['rotation']
            }], externalLinkTarget: [{
                type: Input,
                args: ['external-link-target']
            }], autoresize: [{
                type: Input,
                args: ['autoresize']
            }], fitToPage: [{
                type: Input,
                args: ['fit-to-page']
            }], showBorders: [{
                type: Input,
                args: ['show-borders']
            }], isWheelZoom: [{
                type: Input
            }], isWheelCtrlZoom: [{
                type: Input
            }], isOptimizeZoom: [{
                type: Input
            }], minZoom: [{
                type: Input,
                args: ['minZoom']
            }], maxZoom: [{
                type: Input,
                args: ['maxZoom']
            }], enablePan: [{
                type: Input,
                args: ['enablePan']
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLXZpZXdlci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvcGRmLXZpZXdlci5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFDSCxPQUFPLEVBR0wsU0FBUyxFQUNULFVBQVUsRUFDVixZQUFZLEVBQ1osTUFBTSxFQUNOLEtBQUssRUFDTCxNQUFNLEVBSU4sTUFBTSxFQUVOLFNBQVMsR0FDVixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEtBQUssS0FBSyxNQUFNLFlBQVksQ0FBQztBQUNwQyxPQUFPLEtBQUssV0FBVyxNQUFNLCtCQUErQixDQUFDO0FBQzdELE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQWdCLE1BQU0sTUFBTSxDQUFDO0FBQzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWpFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRWpELE9BQU8sRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRTlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7O0FBV3RELElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRTtJQUNaLE1BQU0sQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztDQUNsRDtBQUVELCtFQUErRTtBQUMvRSxJQUFJLE9BQU8sT0FBTyxDQUFDLGFBQWEsS0FBSyxXQUFXLElBQUksTUFBTSxFQUFFO0lB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QUFJO3NCQURQLEtBQUs7Z0JBWUksVUFBVTtzQkFBbkIsTUFBTTtnQkFHSCxTQUFTO3NCQURaLEtBQUs7dUJBQUMsWUFBWTtnQkFTZixRQUFRO3NCQURYLEtBQUs7dUJBQUMsVUFBVTtnQkFXYixrQkFBa0I7c0JBRHJCLEtBQUs7dUJBQUMsc0JBQXNCO2dCQU16QixVQUFVO3NCQURiLEtBQUs7dUJBQUMsWUFBWTtnQkFNZixTQUFTO3NCQURaLEtBQUs7dUJBQUMsYUFBYTtnQkFNaEIsV0FBVztzQkFEZCxLQUFLO3VCQUFDLGNBQWM7Z0JBS1osV0FBVztzQkFBbkIsS0FBSztnQkFDRyxlQUFlO3NCQUF2QixLQUFLO2dCQUNHLGNBQWM7c0JBQXRCLEtBQUs7Z0JBQ2dCLE9BQU87c0JBQTVCLEtBQUs7dUJBQUMsU0FBUztnQkFJTSxPQUFPO3NCQUE1QixLQUFLO3VCQUFDLFNBQVM7Z0JBSVEsU0FBUztzQkFBaEMsS0FBSzt1QkFBQyxXQUFXIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDcmVhdGVkIGJ5IHZhZGltZGV6IG9uIDIxLzA2LzE2LlxuICovXG5pbXBvcnQge1xuICBBZnRlclZpZXdDaGVja2VkLFxuICBBZnRlclZpZXdJbml0LFxuICBDb21wb25lbnQsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgaW5qZWN0LFxuICBJbnB1dCxcbiAgTmdab25lLFxuICBPbkNoYW5nZXMsXG4gIE9uRGVzdHJveSxcbiAgT25Jbml0LFxuICBPdXRwdXQsXG4gIFNpbXBsZUNoYW5nZXMsXG4gIFZpZXdDaGlsZCxcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgKiBhcyBQREZKUyBmcm9tICdwZGZqcy1kaXN0JztcbmltcG9ydCAqIGFzIFBERkpTVmlld2VyIGZyb20gJ3BkZmpzLWRpc3Qvd2ViL3BkZl92aWV3ZXIubWpzJztcbmltcG9ydCB7IGNvbWJpbmVMYXRlc3QsIGZyb20sIGZyb21FdmVudCwgU3ViamVjdCwgU3Vic2NyaXB0aW9uIH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyBkZWJvdW5jZVRpbWUsIGZpbHRlciwgdGFrZVVudGlsIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuXG5pbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gJy4uL3V0aWxzL2V2ZW50LWJ1cy11dGlscyc7XG5pbXBvcnQgeyBhc3NpZ24sIGlzU1NSIH0gZnJvbSAnLi4vdXRpbHMvaGVscGVycyc7XG5cbmltcG9ydCB7IGdldERvY3VtZW50LCBHbG9iYWxXb3JrZXJPcHRpb25zLCBWZXJib3NpdHlMZXZlbCB9IGZyb20gJ3BkZmpzLWRpc3QnO1xuaW1wb3J0IHsgRG9jdW1lbnRJbml0UGFyYW1ldGVycyB9IGZyb20gJ3BkZmpzLWRpc3QvdHlwZXMvc3JjL2Rpc3BsYXkvYXBpJztcbmltcG9ydCB7IFBhblNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3Bhbi5zZXJ2aWNlJztcbmltcG9ydCB7IFpvb21TZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy96b29tLnNlcnZpY2UnO1xuaW1wb3J0IHR5cGUge1xuICBQREZEb2N1bWVudExvYWRpbmdUYXNrLFxuICBQREZEb2N1bWVudFByb3h5LFxuICBQREZQYWdlUHJveHksXG4gIFBERlByb2dyZXNzRGF0YSxcbiAgUERGU291cmNlLFxuICBQREZWaWV3ZXJPcHRpb25zLFxuICBab29tU2NhbGUsXG59IGZyb20gJy4vdHlwaW5ncyc7XG5cbmlmICghaXNTU1IoKSkge1xuICBhc3NpZ24oUERGSlMsICd2ZXJib3NpdHknLCBWZXJib3NpdHlMZXZlbC5JTkZPUyk7XG59XG5cbi8vIEB0cy1leHBlY3QtZXJyb3IgVGhpcyBkb2VzIG5vdCBleGlzdCBvdXRzaWRlIG9mIHBvbHlmaWxsIHdoaWNoIHRoaXMgaXMgZG9pbmdcbmlmICh0eXBlb2YgUHJvbWlzZS53aXRoUmVzb2x2ZXJzID09PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cpIHtcbiAgLy8gQHRzLWV4cGVjdC1lcnJvciBUaGlzIGRvZXMgbm90IGV4aXN0IG91dHNpZGUgb2YgcG9seWZpbGwgd2hpY2ggdGhpcyBpcyBkb2luZ1xuICB3aW5kb3cuUHJvbWlzZS53aXRoUmVzb2x2ZXJzID0gKCkgPT4ge1xuICAgIGxldCByZXNvbHZlO1xuICAgIGxldCByZWplY3Q7XG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgICAgcmVzb2x2ZSA9IHJlcztcbiAgICAgIHJlamVjdCA9IHJlajtcbiAgICB9KTtcbiAgICByZXR1cm4geyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfTtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVuZGVyVGV4dE1vZGUge1xuICBESVNBQkxFRCxcbiAgRU5BQkxFRCxcbiAgRU5IQU5DRUQsXG59XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ3BkZi12aWV3ZXInLFxuICB0ZW1wbGF0ZTogYFxuICAgIDxkaXZcbiAgICAgICNwZGZWaWV3ZXJDb250YWluZXJcbiAgICAgIGNsYXNzPVwibmcyLXBkZi12aWV3ZXItY29udGFpbmVyXCJcbiAgICAgIChtb3VzZWRvd24pPVwicGFuU2VydmljZS5zdGFydFBhbigkZXZlbnQsIHBkZlZpZXdlckNvbnRhaW5lcilcIlxuICAgICAgKG1vdXNldXApPVwicGFuU2VydmljZS5lbmRQYW4ocGRmVmlld2VyQ29udGFpbmVyKVwiXG4gICAgICAobW91c2VsZWF2ZSk9XCJwYW5TZXJ2aWNlLmVuZFBhbihwZGZWaWV3ZXJDb250YWluZXIpXCJcbiAgICAgIChtb3VzZW1vdmUpPVwicGFuU2VydmljZS5wYW4oJGV2ZW50LCBwZGZWaWV3ZXJDb250YWluZXIpXCJcbiAgICA+XG4gICAgICA8ZGl2IGNsYXNzPVwicGRmVmlld2VyXCI+PC9kaXY+XG4gICAgPC9kaXY+XG4gIGAsXG4gIHN0eWxlVXJsczogWycuL3BkZi12aWV3ZXIuY29tcG9uZW50LnNjc3MnXSxcbiAgcHJvdmlkZXJzOiBbWm9vbVNlcnZpY2UsIFBhblNlcnZpY2VdLFxufSlcbmV4cG9ydCBjbGFzcyBQZGZWaWV3ZXJDb21wb25lbnRcbiAgaW1wbGVtZW50cyBPbkNoYW5nZXMsIE9uSW5pdCwgT25EZXN0cm95LCBBZnRlclZpZXdDaGVja2VkLCBBZnRlclZpZXdJbml0XG57XG4gIHN0YXRpYyBDU1NfVU5JVFMgPSA5Ni4wIC8gNzIuMDtcbiAgc3RhdGljIEJPUkRFUl9XSURUSCA9IDk7XG5cbiAgQFZpZXdDaGlsZCgncGRmVmlld2VyQ29udGFpbmVyJylcbiAgcGRmVmlld2VyQ29udGFpbmVyITogRWxlbWVudFJlZjxIVE1MRGl2RWxlbWVudD47XG5cbiAgZXZlbnRCdXMhOiBQREZKU1ZpZXdlci5FdmVudEJ1cztcbiAgcGRmTGlua1NlcnZpY2UhOiBQREZKU1ZpZXdlci5QREZMaW5rU2VydmljZTtcbiAgcGRmRmluZENvbnRyb2xsZXIhOiBQREZKU1ZpZXdlci5QREZGaW5kQ29udHJvbGxlcjtcbiAgcGRmVmlld2VyITogUERGSlNWaWV3ZXIuUERGVmlld2VyIHwgUERGSlNWaWV3ZXIuUERGU2luZ2xlUGFnZVZpZXdlcjtcblxuICBwcml2YXRlIGlzVmlzaWJsZSA9IGZhbHNlO1xuXG4gIHByaXZhdGUgX2NNYXBzVXJsID1cbiAgICB0eXBlb2YgUERGSlMgIT09ICd1bmRlZmluZWQnXG4gICAgICA/IGBodHRwczovL3VucGtnLmNvbS9wZGZqcy1kaXN0QCR7KFBERkpTIGFzIGFueSkudmVyc2lvbn0vY21hcHMvYFxuICAgICAgOiBudWxsO1xuICBwcml2YXRlIF9pbWFnZVJlc291cmNlc1BhdGggPVxuICAgIHR5cGVvZiBQREZKUyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgID8gYGh0dHBzOi8vdW5wa2cuY29tL3BkZmpzLWRpc3RAJHsoUERGSlMgYXMgYW55KS52ZXJzaW9ufS93ZWIvaW1hZ2VzL2BcbiAgICAgIDogdW5kZWZpbmVkO1xuICBwcml2YXRlIF9yZW5kZXJUZXh0ID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfcmVuZGVyVGV4dE1vZGU6IFJlbmRlclRleHRNb2RlID0gUmVuZGVyVGV4dE1vZGUuRU5BQkxFRDtcbiAgcHJpdmF0ZSBfc3RpY2tUb1BhZ2UgPSBmYWxzZTtcbiAgcHJpdmF0ZSBfb3JpZ2luYWxTaXplID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfcGRmOiBQREZEb2N1bWVudFByb3h5IHwgdW5kZWZpbmVkO1xuICBwcml2YXRlIF9wYWdlID0gMTtcblxuICBwcml2YXRlIF96b29tU2NhbGU6IFpvb21TY2FsZSA9ICdwYWdlLXdpZHRoJztcbiAgcHJpdmF0ZSBfcm90YXRpb24gPSAwO1xuICBwcml2YXRlIF9zaG93QWxsID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfY2FuQXV0b1Jlc2l6ZSA9IHRydWU7XG4gIHByaXZhdGUgX2ZpdFRvUGFnZSA9IGZhbHNlO1xuICBwcml2YXRlIF9leHRlcm5hbExpbmtUYXJnZXQgPSAnYmxhbmsnO1xuICBwcml2YXRlIF9zaG93Qm9yZGVycyA9IGZhbHNlO1xuICBwcml2YXRlIGxhc3RMb2FkZWQhOiBzdHJpbmcgfCBVaW50OEFycmF5IHwgUERGU291cmNlIHwgbnVsbDtcbiAgcHJpdmF0ZSBfbGF0ZXN0U2Nyb2xsZWRQYWdlITogbnVtYmVyO1xuXG4gIHByaXZhdGUgcGFnZVNjcm9sbFRpbWVvdXQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBsb2FkaW5nVGFzaz86IFBERkRvY3VtZW50TG9hZGluZ1Rhc2sgfCBudWxsO1xuICBwcml2YXRlIGRlc3Ryb3kkID0gbmV3IFN1YmplY3Q8dm9pZD4oKTtcbiAgcHJpdmF0ZSB1cGRhdGVTaXplU3ViJDogU3Vic2NyaXB0aW9uIHwgbnVsbCA9IG51bGw7XG5cbiAgQE91dHB1dCgnYWZ0ZXItbG9hZC1jb21wbGV0ZScpIGFmdGVyTG9hZENvbXBsZXRlID1cbiAgICBuZXcgRXZlbnRFbWl0dGVyPFBERkRvY3VtZW50UHJveHk+KCk7XG4gIEBPdXRwdXQoJ3BhZ2UtcmVuZGVyZWQnKSBwYWdlUmVuZGVyZWQgPSBuZXcgRXZlbnRFbWl0dGVyPEN1c3RvbUV2ZW50PigpO1xuICBAT3V0cHV0KCdwYWdlcy1pbml0aWFsaXplZCcpIHBhZ2VJbml0aWFsaXplZCA9XG4gICAgbmV3IEV2ZW50RW1pdHRlcjxDdXN0b21FdmVudD4oKTtcbiAgQE91dHB1dCgndGV4dC1sYXllci1yZW5kZXJlZCcpIHRleHRMYXllclJlbmRlcmVkID1cbiAgICBuZXcgRXZlbnRFbWl0dGVyPEN1c3RvbUV2ZW50PigpO1xuICBAT3V0cHV0KCdlcnJvcicpIG9uRXJyb3IgPSBuZXcgRXZlbnRFbWl0dGVyPGFueT4oKTtcbiAgQE91dHB1dCgnb24tcHJvZ3Jlc3MnKSBvblByb2dyZXNzID0gbmV3IEV2ZW50RW1pdHRlcjxQREZQcm9ncmVzc0RhdGE+KCk7XG4gIEBPdXRwdXQoKSBwYWdlQ2hhbmdlOiBFdmVudEVtaXR0ZXI8bnVtYmVyPiA9IG5ldyBFdmVudEVtaXR0ZXI8bnVtYmVyPih0cnVlKTtcbiAgQElucHV0KCkgc3JjPzogc3RyaW5nIHwgVWludDhBcnJheSB8IFBERlNvdXJjZTtcblxuICBASW5wdXQoJ2MtbWFwcy11cmwnKVxuICBzZXQgY01hcHNVcmwoY01hcHNVcmw6IHN0cmluZykge1xuICAgIHRoaXMuX2NNYXBzVXJsID0gY01hcHNVcmw7XG4gIH1cblxuICBASW5wdXQoJ3BhZ2UnKVxuICBzZXQgcGFnZShfcGFnZTogbnVtYmVyIHwgc3RyaW5nIHwgYW55KSB7XG4gICAgX3BhZ2UgPSBwYXJzZUludChfcGFnZSwgMTApIHx8IDE7XG4gICAgY29uc3Qgb3JpZ2luYWxQYWdlID0gX3BhZ2U7XG5cbiAgICBpZiAodGhpcy5fcGRmKSB7XG4gICAgICBfcGFnZSA9IHRoaXMuZ2V0VmFsaWRQYWdlTnVtYmVyKF9wYWdlKTtcbiAgICB9XG5cbiAgICB0aGlzLl9wYWdlID0gX3BhZ2U7XG4gICAgaWYgKG9yaWdpbmFsUGFnZSAhPT0gX3BhZ2UpIHtcbiAgICAgIHRoaXMucGFnZUNoYW5nZS5lbWl0KF9wYWdlKTtcbiAgICB9XG4gIH1cblxuICBASW5wdXQoJ3JlbmRlci10ZXh0JylcbiAgc2V0IHJlbmRlclRleHQocmVuZGVyVGV4dDogYm9vbGVhbikge1xuICAgIHRoaXMuX3JlbmRlclRleHQgPSByZW5kZXJUZXh0O1xuICB9XG5cbiAgQElucHV0KCdyZW5kZXItdGV4dC1tb2RlJylcbiAgc2V0IHJlbmRlclRleHRNb2RlKHJlbmRlclRleHRNb2RlOiBSZW5kZXJUZXh0TW9kZSkge1xuICAgIHRoaXMuX3JlbmRlclRleHRNb2RlID0gcmVuZGVyVGV4dE1vZGU7XG4gIH1cblxuICBASW5wdXQoJ29yaWdpbmFsLXNpemUnKVxuICBzZXQgb3JpZ2luYWxTaXplKG9yaWdpbmFsU2l6ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX29yaWdpbmFsU2l6ZSA9IG9yaWdpbmFsU2l6ZTtcbiAgfVxuXG4gIEBJbnB1dCgnc2hvdy1hbGwnKVxuICBzZXQgc2hvd0FsbCh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX3Nob3dBbGwgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnc3RpY2stdG8tcGFnZScpXG4gIHNldCBzdGlja1RvUGFnZSh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX3N0aWNrVG9QYWdlID0gdmFsdWU7XG4gIH1cblxuICBASW5wdXQoKVxuICBzZXQgem9vbSh2YWx1ZTogbnVtYmVyKSB7XG4gICAgaWYgKHZhbHVlIDw9IDApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnpvb21TZXJ2aWNlLnpvb20gPSB2YWx1ZTtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLmxpbWl0Wm9vbSgpO1xuICB9XG4gIGdldCB6b29tKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuem9vbVNlcnZpY2Uuem9vbTtcbiAgfVxuICBAT3V0cHV0KCkgem9vbUNoYW5nZSA9IG5ldyBFdmVudEVtaXR0ZXI8bnVtYmVyPigpO1xuXG4gIEBJbnB1dCgnem9vbS1zY2FsZScpXG4gIHNldCB6b29tU2NhbGUodmFsdWU6IFpvb21TY2FsZSkge1xuICAgIHRoaXMuX3pvb21TY2FsZSA9IHZhbHVlO1xuICB9XG4gIGdldCB6b29tU2NhbGUoKTogWm9vbVNjYWxlIHtcbiAgICByZXR1cm4gdGhpcy5fem9vbVNjYWxlO1xuICB9XG5cbiAgQElucHV0KCdyb3RhdGlvbicpXG4gIHNldCByb3RhdGlvbih2YWx1ZTogbnVtYmVyKSB7XG4gICAgaWYgKCEodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiB2YWx1ZSAlIDkwID09PSAwKSkge1xuICAgICAgY29uc29sZS53YXJuKCdJbnZhbGlkIHBhZ2VzIHJvdGF0aW9uIGFuZ2xlLicpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX3JvdGF0aW9uID0gdmFsdWU7XG4gIH1cblxuICBASW5wdXQoJ2V4dGVybmFsLWxpbmstdGFyZ2V0JylcbiAgc2V0IGV4dGVybmFsTGlua1RhcmdldCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgdGhpcy5fZXh0ZXJuYWxMaW5rVGFyZ2V0ID0gdmFsdWU7XG4gIH1cblxuICBASW5wdXQoJ2F1dG9yZXNpemUnKVxuICBzZXQgYXV0b3Jlc2l6ZSh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX2NhbkF1dG9SZXNpemUgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgnZml0LXRvLXBhZ2UnKVxuICBzZXQgZml0VG9QYWdlKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fZml0VG9QYWdlID0gQm9vbGVhbih2YWx1ZSk7XG4gIH1cblxuICBASW5wdXQoJ3Nob3ctYm9yZGVycycpXG4gIHNldCBzaG93Qm9yZGVycyh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX3Nob3dCb3JkZXJzID0gQm9vbGVhbih2YWx1ZSk7XG4gIH1cblxuICBASW5wdXQoKSBpc1doZWVsWm9vbSA9IHRydWU7XG4gIEBJbnB1dCgpIGlzV2hlZWxDdHJsWm9vbSA9IHRydWU7XG4gIEBJbnB1dCgpIGlzT3B0aW1pemVab29tID0gdHJ1ZTtcbiAgQElucHV0KCdtaW5ab29tJykgc2V0IG1pblpvb20odmFsdWU6IG51bWJlcikge1xuICAgIHRoaXMuem9vbVNlcnZpY2UubWluWm9vbSA9IHZhbHVlO1xuICAgIHRoaXMuem9vbVNlcnZpY2UubGltaXRab29tKCk7XG4gIH1cbiAgQElucHV0KCdtYXhab29tJykgc2V0IG1heFpvb20odmFsdWU6IG51bWJlcikge1xuICAgIHRoaXMuem9vbVNlcnZpY2UubWF4Wm9vbSA9IHZhbHVlO1xuICAgIHRoaXMuem9vbVNlcnZpY2UubGltaXRab29tKCk7XG4gIH1cbiAgQElucHV0KCdlbmFibGVQYW4nKSBzZXQgZW5hYmxlUGFuKGVuYWJsZVBhbjogYm9vbGVhbikge1xuICAgIHRoaXMucGFuU2VydmljZS5lbmFibGVQYW4gPSBlbmFibGVQYW47XG5cbiAgICBjb25zdCBjdXJzb3IgPSBlbmFibGVQYW4gPyAnZ3JhYicgOiAnZGVmYXVsdCc7XG4gICAgaWYgKHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50KSB7XG4gICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lci5uYXRpdmVFbGVtZW50LnN0eWxlLmN1cnNvciA9IGN1cnNvcjtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgZ2V0TGlua1RhcmdldCh0eXBlOiBzdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2JsYW5rJzpcbiAgICAgICAgcmV0dXJuIChQREZKU1ZpZXdlciBhcyBhbnkpLkxpbmtUYXJnZXQuQkxBTks7XG4gICAgICBjYXNlICdub25lJzpcbiAgICAgICAgcmV0dXJuIChQREZKU1ZpZXdlciBhcyBhbnkpLkxpbmtUYXJnZXQuTk9ORTtcbiAgICAgIGNhc2UgJ3NlbGYnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5TRUxGO1xuICAgICAgY2FzZSAncGFyZW50JzpcbiAgICAgICAgcmV0dXJuIChQREZKU1ZpZXdlciBhcyBhbnkpLkxpbmtUYXJnZXQuUEFSRU5UO1xuICAgICAgY2FzZSAndG9wJzpcbiAgICAgICAgcmV0dXJuIChQREZKU1ZpZXdlciBhcyBhbnkpLkxpbmtUYXJnZXQuVE9QO1xuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSByZWFkb25seSBlbGVtZW50ID0gaW5qZWN0KEVsZW1lbnRSZWY8SFRNTEVsZW1lbnQ+KTtcbiAgcHJpdmF0ZSByZWFkb25seSBuZ1pvbmUgPSBpbmplY3QoTmdab25lKTtcbiAgcHJpdmF0ZSByZWFkb25seSB6b29tU2VydmljZSA9IGluamVjdChab29tU2VydmljZSk7XG4gIHByb3RlY3RlZCByZWFkb25seSBwYW5TZXJ2aWNlID0gaW5qZWN0KFBhblNlcnZpY2UpO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIGlmIChpc1NTUigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHBkZldvcmtlclNyYzogc3RyaW5nO1xuXG4gICAgY29uc3QgcGRmSnNWZXJzaW9uOiBzdHJpbmcgPSAoUERGSlMgYXMgYW55KS52ZXJzaW9uO1xuICAgIGNvbnN0IHZlcnNpb25TcGVjaWZpY1BkZldvcmtlclVybDogc3RyaW5nID0gKHdpbmRvdyBhcyBhbnkpW1xuICAgICAgYHBkZldvcmtlclNyYyR7cGRmSnNWZXJzaW9ufWBcbiAgICBdO1xuXG4gICAgaWYgKHZlcnNpb25TcGVjaWZpY1BkZldvcmtlclVybCkge1xuICAgICAgcGRmV29ya2VyU3JjID0gdmVyc2lvblNwZWNpZmljUGRmV29ya2VyVXJsO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB3aW5kb3cuaGFzT3duUHJvcGVydHkoJ3BkZldvcmtlclNyYycpICYmXG4gICAgICB0eXBlb2YgKHdpbmRvdyBhcyBhbnkpLnBkZldvcmtlclNyYyA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmNcbiAgICApIHtcbiAgICAgIHBkZldvcmtlclNyYyA9ICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBkZldvcmtlclNyYyA9IGBodHRwczovL2Nkbi5qc2RlbGl2ci5uZXQvbnBtL3BkZmpzLWRpc3RAJHtwZGZKc1ZlcnNpb259L2xlZ2FjeS9idWlsZC9wZGYud29ya2VyLm1pbi5tanNgO1xuICAgIH1cblxuICAgIGFzc2lnbihHbG9iYWxXb3JrZXJPcHRpb25zLCAnd29ya2VyU3JjJywgcGRmV29ya2VyU3JjKTtcbiAgfVxuXG4gIG5nQWZ0ZXJWaWV3Q2hlY2tlZCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5pc0luaXRpYWxpemVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgb2Zmc2V0ID0gdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQub2Zmc2V0UGFyZW50O1xuXG4gICAgaWYgKHRoaXMuaXNWaXNpYmxlID09PSB0cnVlICYmIG9mZnNldCA9PSBudWxsKSB7XG4gICAgICB0aGlzLmlzVmlzaWJsZSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzVmlzaWJsZSA9PT0gZmFsc2UgJiYgb2Zmc2V0ICE9IG51bGwpIHtcbiAgICAgIHRoaXMuaXNWaXNpYmxlID0gdHJ1ZTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZSgpO1xuICAgICAgICB0aGlzLm5nT25DaGFuZ2VzKHsgc3JjOiB0aGlzLnNyYyB9IGFzIGFueSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBuZ0FmdGVyVmlld0luaXQoKTogdm9pZCB7XG4gICAgdGhpcy56b29tU2VydmljZS5pbml0U2V0dGluZ3MoXG4gICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudCxcbiAgICAgIHRoaXMuaXNXaGVlbFpvb20sXG4gICAgICB0aGlzLmlzV2hlZWxDdHJsWm9vbVxuICAgICk7XG4gIH1cblxuICBuZ09uSW5pdCgpOiB2b2lkIHtcbiAgICB0aGlzLmluaXRpYWxpemUoKTtcbiAgICB0aGlzLnNldHVwUmVzaXplTGlzdGVuZXIoKTtcbiAgfVxuXG4gIG5nT25EZXN0cm95KCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnVwZGF0ZVNpemVTdWIkKSB7XG4gICAgICB0aGlzLnVwZGF0ZVNpemVTdWIkLnVuc3Vic2NyaWJlKCk7XG4gICAgfVxuXG4gICAgdGhpcy5kZXN0cm95JC5uZXh0KCk7XG4gICAgdGhpcy5kZXN0cm95JC5jb21wbGV0ZSgpO1xuXG4gICAgdGhpcy5jbGVhcigpO1xuICAgIHRoaXMuem9vbVNlcnZpY2UucmVtb3ZlTGlzdGVuZXJzKHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50KTtcbiAgICB0aGlzLmxvYWRpbmdUYXNrID0gbnVsbDtcbiAgfVxuXG4gIG5nT25DaGFuZ2VzKGNoYW5nZXM6IFNpbXBsZUNoYW5nZXMpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoJ3NyYycgaW4gY2hhbmdlcykge1xuICAgICAgdGhpcy5sb2FkUERGKCk7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIGlmICgncmVuZGVyVGV4dCcgaW4gY2hhbmdlcyB8fCAnc2hvd0FsbCcgaW4gY2hhbmdlcykge1xuICAgICAgICB0aGlzLnNldHVwVmlld2VyKCk7XG4gICAgICAgIHRoaXMucmVzZXRQZGZEb2N1bWVudCgpO1xuICAgICAgfVxuICAgICAgaWYgKCdwYWdlJyBpbiBjaGFuZ2VzKSB7XG4gICAgICAgIGNvbnN0IHsgcGFnZSB9ID0gY2hhbmdlcztcbiAgICAgICAgaWYgKHBhZ2UuY3VycmVudFZhbHVlID09PSB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOZXcgZm9ybSBvZiBwYWdlIGNoYW5naW5nOiBUaGUgdmlld2VyIHdpbGwgbm93IGp1bXAgdG8gdGhlIHNwZWNpZmllZCBwYWdlIHdoZW4gaXQgaXMgY2hhbmdlZC5cbiAgICAgICAgLy8gVGhpcyBiZWhhdmlvciBpcyBpbnRyb2R1Y2VkIGJ5IHVzaW5nIHRoZSBQREZTaW5nbGVQYWdlVmlld2VyXG4gICAgICAgIHRoaXMucGRmVmlld2VyLnNjcm9sbFBhZ2VJbnRvVmlldyh7IHBhZ2VOdW1iZXI6IHRoaXMuX3BhZ2UgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlU2l6ZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy51cGRhdGVTaXplU3ViJCkge1xuICAgICAgdGhpcy51cGRhdGVTaXplU3ViJC51bnN1YnNjcmliZSgpO1xuICAgIH1cblxuICAgIHRoaXMudXBkYXRlU2l6ZVN1YiQgPSBjb21iaW5lTGF0ZXN0KFtcbiAgICAgIGZyb20odGhpcy5fcGRmIS5nZXRQYWdlKHRoaXMucGRmVmlld2VyLmN1cnJlbnRQYWdlTnVtYmVyKSksXG4gICAgICB0aGlzLnpvb21TZXJ2aWNlLnRyaWdnZXJVcGRhdGVTaXplJCxcbiAgICBdKVxuICAgICAgLnBpcGUodGFrZVVudGlsKHRoaXMuZGVzdHJveSQpKVxuICAgICAgLnN1YnNjcmliZSh7XG4gICAgICAgIG5leHQ6IChbcGFnZV06IFtQREZQYWdlUHJveHksIHZvaWRdKSA9PiB7XG4gICAgICAgICAgaWYgKHRoaXMuaXNPcHRpbWl6ZVpvb20gfHwgdGhpcy5pc1doZWVsWm9vbSkge1xuICAgICAgICAgICAgdGhpcy56b29tU2VydmljZS5zYXZlU2Nyb2xsUG9zaXRpb24oXG4gICAgICAgICAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IHJvdGF0aW9uID0gdGhpcy5fcm90YXRpb24gKyBwYWdlLnJvdGF0ZTtcbiAgICAgICAgICBjb25zdCB2aWV3cG9ydFdpZHRoID1cbiAgICAgICAgICAgIHBhZ2UuZ2V0Vmlld3BvcnQoe1xuICAgICAgICAgICAgICBzY2FsZTogdGhpcy56b29tU2VydmljZS56b29tLFxuICAgICAgICAgICAgICByb3RhdGlvbixcbiAgICAgICAgICAgIH0pLndpZHRoICogUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgICAgICAgICBsZXQgc2NhbGUgPSB0aGlzLnpvb21TZXJ2aWNlLnpvb207XG4gICAgICAgICAgbGV0IHN0aWNrVG9QYWdlID0gdHJ1ZTtcblxuICAgICAgICAgIC8vIFNjYWxlIHRoZSBkb2N1bWVudCB3aGVuIGl0IHNob3VsZG4ndCBiZSBpbiBvcmlnaW5hbCBzaXplIG9yIGRvZXNuJ3QgZml0IGludG8gdGhlIHZpZXdwb3J0XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgIXRoaXMuX29yaWdpbmFsU2l6ZSB8fFxuICAgICAgICAgICAgKHRoaXMuX2ZpdFRvUGFnZSAmJlxuICAgICAgICAgICAgICB2aWV3cG9ydFdpZHRoID5cbiAgICAgICAgICAgICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudC5jbGllbnRXaWR0aClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGNvbnN0IHZpZXdQb3J0ID0gcGFnZS5nZXRWaWV3cG9ydCh7IHNjYWxlOiAxLCByb3RhdGlvbiB9KTtcbiAgICAgICAgICAgIHNjYWxlID0gdGhpcy5nZXRTY2FsZSh2aWV3UG9ydC53aWR0aCwgdmlld1BvcnQuaGVpZ2h0KTtcbiAgICAgICAgICAgIHN0aWNrVG9QYWdlID0gIXRoaXMuX3N0aWNrVG9QYWdlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMucGRmVmlld2VyLmN1cnJlbnRTY2FsZSA9IHNjYWxlO1xuXG4gICAgICAgICAgaWYgKHN0aWNrVG9QYWdlKVxuICAgICAgICAgICAgdGhpcy5wZGZWaWV3ZXIuc2Nyb2xsUGFnZUludG9WaWV3KHtcbiAgICAgICAgICAgICAgcGFnZU51bWJlcjogcGFnZS5wYWdlTnVtYmVyLFxuICAgICAgICAgICAgICBpZ25vcmVEZXN0aW5hdGlvblpvb206IHRydWUsXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgIGlmICh0aGlzLmlzT3B0aW1pemVab29tIHx8IHRoaXMuaXNXaGVlbFpvb20pIHtcbiAgICAgICAgICAgIHRoaXMuem9vbVNlcnZpY2UucmVzdG9yZVNjcm9sbFBvc2l0aW9uKFxuICAgICAgICAgICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLnpvb21DaGFuZ2UuZW1pdCh0aGlzLnpvb21TZXJ2aWNlLnpvb20pO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gIH1cblxuICBjbGVhcigpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5wYWdlU2Nyb2xsVGltZW91dCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmxvYWRpbmdUYXNrICYmICF0aGlzLmxvYWRpbmdUYXNrLmRlc3Ryb3llZCkge1xuICAgICAgdGhpcy5sb2FkaW5nVGFzay5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3BkZikge1xuICAgICAgdGhpcy5fbGF0ZXN0U2Nyb2xsZWRQYWdlID0gMDtcbiAgICAgIHRoaXMuX3BkZi5kZXN0cm95KCk7XG4gICAgICB0aGlzLl9wZGYgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgdGhpcy5wZGZWaWV3ZXIgJiYgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgJiYgdGhpcy5wZGZMaW5rU2VydmljZS5zZXREb2N1bWVudChudWxsLCBudWxsKTtcbiAgICB0aGlzLnBkZkZpbmRDb250cm9sbGVyICYmIHRoaXMucGRmRmluZENvbnRyb2xsZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRQREZMaW5rU2VydmljZUNvbmZpZygpOiB7fSB7XG4gICAgY29uc3QgbGlua1RhcmdldCA9IFBkZlZpZXdlckNvbXBvbmVudC5nZXRMaW5rVGFyZ2V0KFxuICAgICAgdGhpcy5fZXh0ZXJuYWxMaW5rVGFyZ2V0XG4gICAgKTtcblxuICAgIGlmIChsaW5rVGFyZ2V0KSB7XG4gICAgICByZXR1cm4geyBleHRlcm5hbExpbmtUYXJnZXQ6IGxpbmtUYXJnZXQgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge307XG4gIH1cblxuICBwcml2YXRlIGluaXRFdmVudEJ1cygpOiB2b2lkIHtcbiAgICB0aGlzLmV2ZW50QnVzID0gY3JlYXRlRXZlbnRCdXMoUERGSlNWaWV3ZXIsIHRoaXMuZGVzdHJveSQpO1xuXG4gICAgZnJvbUV2ZW50PEN1c3RvbUV2ZW50Pih0aGlzLmV2ZW50QnVzLCAncGFnZXJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMucGFnZVJlbmRlcmVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQ8Q3VzdG9tRXZlbnQ+KHRoaXMuZXZlbnRCdXMsICdwYWdlc2luaXQnKVxuICAgICAgLnBpcGUodGFrZVVudGlsKHRoaXMuZGVzdHJveSQpKVxuICAgICAgLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5wYWdlSW5pdGlhbGl6ZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudCh0aGlzLmV2ZW50QnVzLCAncGFnZWNoYW5naW5nJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKHsgcGFnZU51bWJlciB9OiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wYWdlU2Nyb2xsVGltZW91dCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX2xhdGVzdFNjcm9sbGVkUGFnZSA9IHBhZ2VOdW1iZXI7XG4gICAgICAgICAgdGhpcy5wYWdlQ2hhbmdlLmVtaXQocGFnZU51bWJlcik7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudDxDdXN0b21FdmVudD4odGhpcy5ldmVudEJ1cywgJ3RleHRsYXllcnJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMudGV4dExheWVyUmVuZGVyZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdFBERlNlcnZpY2VzKCk6IHZvaWQge1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgPSBuZXcgUERGSlNWaWV3ZXIuUERGTGlua1NlcnZpY2Uoe1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICAuLi50aGlzLmdldFBERkxpbmtTZXJ2aWNlQ29uZmlnKCksXG4gICAgfSk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlciA9IG5ldyBQREZKU1ZpZXdlci5QREZGaW5kQ29udHJvbGxlcih7XG4gICAgICBldmVudEJ1czogdGhpcy5ldmVudEJ1cyxcbiAgICAgIGxpbmtTZXJ2aWNlOiB0aGlzLnBkZkxpbmtTZXJ2aWNlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRQREZPcHRpb25zKCk6IFBERlZpZXdlck9wdGlvbnMge1xuICAgIHJldHVybiB7XG4gICAgICBldmVudEJ1czogdGhpcy5ldmVudEJ1cyxcbiAgICAgIGNvbnRhaW5lcjogdGhpcy5lbGVtZW50Lm5hdGl2ZUVsZW1lbnQucXVlcnlTZWxlY3RvcignZGl2JykhLFxuICAgICAgcmVtb3ZlUGFnZUJvcmRlcnM6ICF0aGlzLl9zaG93Qm9yZGVycyxcbiAgICAgIGxpbmtTZXJ2aWNlOiB0aGlzLnBkZkxpbmtTZXJ2aWNlLFxuICAgICAgdGV4dExheWVyTW9kZTogdGhpcy5fcmVuZGVyVGV4dFxuICAgICAgICA/IHRoaXMuX3JlbmRlclRleHRNb2RlXG4gICAgICAgIDogUmVuZGVyVGV4dE1vZGUuRElTQUJMRUQsXG4gICAgICBmaW5kQ29udHJvbGxlcjogdGhpcy5wZGZGaW5kQ29udHJvbGxlcixcbiAgICAgIGwxMG46IG5ldyBQREZKU1ZpZXdlci5HZW5lcmljTDEwbignZW4nKSxcbiAgICAgIGltYWdlUmVzb3VyY2VzUGF0aDogdGhpcy5faW1hZ2VSZXNvdXJjZXNQYXRoLFxuICAgICAgYW5ub3RhdGlvbkVkaXRvck1vZGU6IFBERkpTLkFubm90YXRpb25FZGl0b3JUeXBlLkRJU0FCTEUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBWaWV3ZXIoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGRmVmlld2VyKSB7XG4gICAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudChudWxsIGFzIGFueSk7XG4gICAgfVxuXG4gICAgYXNzaWduKFBERkpTLCAnZGlzYWJsZVRleHRMYXllcicsICF0aGlzLl9yZW5kZXJUZXh0KTtcblxuICAgIHRoaXMuaW5pdFBERlNlcnZpY2VzKCk7XG5cbiAgICBpZiAodGhpcy5fc2hvd0FsbCkge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGVmlld2VyKHRoaXMuZ2V0UERGT3B0aW9ucygpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGU2luZ2xlUGFnZVZpZXdlcihcbiAgICAgICAgdGhpcy5nZXRQREZPcHRpb25zKClcbiAgICAgICk7XG4gICAgfVxuICAgIHRoaXMucGRmTGlua1NlcnZpY2Uuc2V0Vmlld2VyKHRoaXMucGRmVmlld2VyKTtcblxuICAgIHRoaXMucGRmVmlld2VyLl9jdXJyZW50UGFnZU51bWJlciA9IHRoaXMuX3BhZ2U7XG4gIH1cblxuICBwcml2YXRlIGdldFZhbGlkUGFnZU51bWJlcihwYWdlOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChwYWdlIDwgMSkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgaWYgKHBhZ2UgPiB0aGlzLl9wZGYhLm51bVBhZ2VzKSB7XG4gICAgICByZXR1cm4gdGhpcy5fcGRmIS5udW1QYWdlcztcbiAgICB9XG5cbiAgICByZXR1cm4gcGFnZTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RG9jdW1lbnRQYXJhbXMoKTpcbiAgICB8IHN0cmluZ1xuICAgIHwgVWludDhBcnJheVxuICAgIHwgRG9jdW1lbnRJbml0UGFyYW1ldGVyc1xuICAgIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBzcmNUeXBlID0gdHlwZW9mIHRoaXMuc3JjO1xuXG4gICAgaWYgKCF0aGlzLl9jTWFwc1VybCkge1xuICAgICAgcmV0dXJuIHRoaXMuc3JjO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcmFtczogYW55ID0ge1xuICAgICAgY01hcFVybDogdGhpcy5fY01hcHNVcmwsXG4gICAgICBjTWFwUGFja2VkOiB0cnVlLFxuICAgICAgZW5hYmxlWGZhOiB0cnVlLFxuICAgIH07XG4gICAgcGFyYW1zLmlzRXZhbFN1cHBvcnRlZCA9IGZhbHNlOyAvLyBodHRwOi8vY3ZlLm9yZy9DVkVSZWNvcmQ/aWQ9Q1ZFLTIwMjQtNDM2N1xuXG4gICAgaWYgKHNyY1R5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXJhbXMudXJsID0gdGhpcy5zcmM7XG4gICAgfSBlbHNlIGlmIChzcmNUeXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKCh0aGlzLnNyYyBhcyBhbnkpLmJ5dGVMZW5ndGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBwYXJhbXMuZGF0YSA9IHRoaXMuc3JjO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihwYXJhbXMsIHRoaXMuc3JjKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkUERGKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5zcmMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sYXN0TG9hZGVkID09PSB0aGlzLnNyYykge1xuICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyKCk7XG5cbiAgICB0aGlzLnNldHVwVmlld2VyKCk7XG5cbiAgICB0aGlzLmxvYWRpbmdUYXNrID0gZ2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudFBhcmFtcygpKTtcblxuICAgIHRoaXMubG9hZGluZ1Rhc2shLm9uUHJvZ3Jlc3MgPSAocHJvZ3Jlc3NEYXRhOiBQREZQcm9ncmVzc0RhdGEpID0+IHtcbiAgICAgIHRoaXMub25Qcm9ncmVzcy5lbWl0KHByb2dyZXNzRGF0YSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHNyYyA9IHRoaXMuc3JjO1xuXG4gICAgZnJvbSh0aGlzLmxvYWRpbmdUYXNrIS5wcm9taXNlIGFzIFByb21pc2U8UERGRG9jdW1lbnRQcm94eT4pXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKHtcbiAgICAgICAgbmV4dDogKHBkZikgPT4ge1xuICAgICAgICAgIHRoaXMuX3BkZiA9IHBkZjtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBzcmM7XG5cbiAgICAgICAgICB0aGlzLmFmdGVyTG9hZENvbXBsZXRlLmVtaXQocGRmKTtcbiAgICAgICAgICB0aGlzLnJlc2V0UGRmRG9jdW1lbnQoKTtcblxuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yOiAoZXJyb3IpID0+IHtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBudWxsO1xuICAgICAgICAgIHRoaXMub25FcnJvci5lbWl0KGVycm9yKTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG4gICAgdGhpcy5wYWdlID0gdGhpcy5fcGFnZTtcblxuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLl9wYWdlID0gdGhpcy5nZXRWYWxpZFBhZ2VOdW1iZXIodGhpcy5fcGFnZSk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLl9yb3RhdGlvbiAhPT0gMCB8fFxuICAgICAgdGhpcy5wZGZWaWV3ZXIucGFnZXNSb3RhdGlvbiAhPT0gdGhpcy5fcm90YXRpb25cbiAgICApIHtcbiAgICAgIC8vIHdhaXQgdW50aWwgYXQgbGVhc3QgdGhlIGZpcnN0IHBhZ2UgaXMgYXZhaWxhYmxlLlxuICAgICAgdGhpcy5wZGZWaWV3ZXIuZmlyc3RQYWdlUHJvbWlzZT8udGhlbihcbiAgICAgICAgKCkgPT4gKHRoaXMucGRmVmlld2VyLnBhZ2VzUm90YXRpb24gPSB0aGlzLl9yb3RhdGlvbilcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3N0aWNrVG9QYWdlKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFBhZ2VOdW1iZXIgPSB0aGlzLl9wYWdlO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBkZlZpZXdlci5fcGFnZXM/Lmxlbmd0aCkge1xuICAgICAgLy8gdGhlIGZpcnN0IHRpbWUgd2Ugd2FpdCB1bnRpbCBwYWdlcyBpbml0XG4gICAgICBjb25zdCBzdWIgPSB0aGlzLnBhZ2VJbml0aWFsaXplZC5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgc3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cGRhdGVTaXplKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRTY2FsZSh2aWV3cG9ydFdpZHRoOiBudW1iZXIsIHZpZXdwb3J0SGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IGJvcmRlclNpemUgPSB0aGlzLl9zaG93Qm9yZGVyc1xuICAgICAgPyAyICogUGRmVmlld2VyQ29tcG9uZW50LkJPUkRFUl9XSURUSFxuICAgICAgOiAwO1xuICAgIGNvbnN0IHBkZkNvbnRhaW5lcldpZHRoID1cbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudFdpZHRoIC0gYm9yZGVyU2l6ZTtcbiAgICBjb25zdCBwZGZDb250YWluZXJIZWlnaHQgPVxuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQuY2xpZW50SGVpZ2h0IC0gYm9yZGVyU2l6ZTtcblxuICAgIGlmIChcbiAgICAgIHBkZkNvbnRhaW5lckhlaWdodCA9PT0gMCB8fFxuICAgICAgdmlld3BvcnRIZWlnaHQgPT09IDAgfHxcbiAgICAgIHBkZkNvbnRhaW5lcldpZHRoID09PSAwIHx8XG4gICAgICB2aWV3cG9ydFdpZHRoID09PSAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBsZXQgcmF0aW8gPSAxO1xuICAgIHN3aXRjaCAodGhpcy5fem9vbVNjYWxlKSB7XG4gICAgICBjYXNlICdwYWdlLWZpdCc6XG4gICAgICAgIHJhdGlvID0gTWF0aC5taW4oXG4gICAgICAgICAgcGRmQ29udGFpbmVySGVpZ2h0IC8gdmlld3BvcnRIZWlnaHQsXG4gICAgICAgICAgcGRmQ29udGFpbmVyV2lkdGggLyB2aWV3cG9ydFdpZHRoXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncGFnZS1oZWlnaHQnOlxuICAgICAgICByYXRpbyA9IHBkZkNvbnRhaW5lckhlaWdodCAvIHZpZXdwb3J0SGVpZ2h0O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZ2Utd2lkdGgnOlxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmF0aW8gPSBwZGZDb250YWluZXJXaWR0aCAvIHZpZXdwb3J0V2lkdGg7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiAodGhpcy56b29tU2VydmljZS56b29tICogcmF0aW8pIC8gUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRQZGZEb2N1bWVudCgpOiB2b2lkIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldERvY3VtZW50KHRoaXMuX3BkZiwgbnVsbCk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIHRoaXMuaW5pdEV2ZW50QnVzKCk7XG4gICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFJlc2l6ZUxpc3RlbmVyKCk6IHZvaWQge1xuICAgIGlmIChpc1NTUigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5uZ1pvbmUucnVuT3V0c2lkZUFuZ3VsYXIoKCkgPT4ge1xuICAgICAgZnJvbUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpXG4gICAgICAgIC5waXBlKFxuICAgICAgICAgIGRlYm91bmNlVGltZSgxMDApLFxuICAgICAgICAgIGZpbHRlcigoKSA9PiB0aGlzLl9jYW5BdXRvUmVzaXplICYmICEhdGhpcy5fcGRmKSxcbiAgICAgICAgICB0YWtlVW50aWwodGhpcy5kZXN0cm95JClcbiAgICAgICAgKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==