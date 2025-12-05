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
    disableStream = false;
    disableRange = false;
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
        params.disableStream = this.disableStream;
        params.disableRange = this.disableRange;
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
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.0", type: PdfViewerComponent, selector: "pdf-viewer", inputs: { src: "src", cMapsUrl: ["c-maps-url", "cMapsUrl"], page: "page", renderText: ["render-text", "renderText"], renderTextMode: ["render-text-mode", "renderTextMode"], originalSize: ["original-size", "originalSize"], showAll: ["show-all", "showAll"], stickToPage: ["stick-to-page", "stickToPage"], zoom: "zoom", zoomScale: ["zoom-scale", "zoomScale"], rotation: "rotation", externalLinkTarget: ["external-link-target", "externalLinkTarget"], autoresize: "autoresize", fitToPage: ["fit-to-page", "fitToPage"], showBorders: ["show-borders", "showBorders"], isWheelZoom: "isWheelZoom", isWheelCtrlZoom: "isWheelCtrlZoom", isOptimizeZoom: "isOptimizeZoom", minZoom: "minZoom", maxZoom: "maxZoom", enablePan: "enablePan", disableStream: "disableStream", disableRange: "disableRange" }, outputs: { afterLoadComplete: "after-load-complete", pageRendered: "page-rendered", pageInitialized: "pages-initialized", textLayerRendered: "text-layer-rendered", onError: "error", onProgress: "on-progress", pageChange: "pageChange", zoomChange: "zoomChange" }, providers: [ZoomService, PanService], viewQueries: [{ propertyName: "pdfViewerContainer", first: true, predicate: ["pdfViewerContainer"], descendants: true }], usesOnChanges: true, ngImport: i0, template: `
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
            }], disableStream: [{
                type: Input
            }], disableRange: [{
                type: Input
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLXZpZXdlci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvcGRmLXZpZXdlci5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFDSCxPQUFPLEVBR0wsU0FBUyxFQUNULFVBQVUsRUFDVixZQUFZLEVBQ1osTUFBTSxFQUNOLEtBQUssRUFDTCxNQUFNLEVBSU4sTUFBTSxFQUVOLFNBQVMsR0FDVixNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEtBQUssS0FBSyxNQUFNLFlBQVksQ0FBQztBQUNwQyxPQUFPLEtBQUssV0FBVyxNQUFNLCtCQUErQixDQUFDO0FBQzdELE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQWdCLE1BQU0sTUFBTSxDQUFDO0FBQzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRWpFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRWpELE9BQU8sRUFBRSxXQUFXLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBRTlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7O0FBV3RELElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRTtJQUNaLE1BQU0sQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztDQUNsRDtBQUVELCtFQUErRTtBQUMvRSxJQUFJLE9BQU8sT0FBTyxDQUFDLGFBQWEsS0FBSyxXQUFXLElBQUksTUFBTSxFQUFFO0lB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QU1oQixjQUFjO3NCQURqQixLQUFLO3VCQUFDLGtCQUFrQjtnQkFNckIsWUFBWTtzQkFEZixLQUFLO3VCQUFDLGVBQWU7Z0JBTWxCLE9BQU87c0JBRFYsS0FBSzt1QkFBQyxVQUFVO2dCQU1iLFdBQVc7c0JBRGQsS0FBSzt1QkFBQyxlQUFlO2dCQU1sQixJQUFJO3NCQURQLEtBQUs7Z0JBWUksVUFBVTtzQkFBbkIsTUFBTTtnQkFHSCxTQUFTO3NCQURaLEtBQUs7dUJBQUMsWUFBWTtnQkFTZixRQUFRO3NCQURYLEtBQUs7dUJBQUMsVUFBVTtnQkFXYixrQkFBa0I7c0JBRHJCLEtBQUs7dUJBQUMsc0JBQXNCO2dCQU16QixVQUFVO3NCQURiLEtBQUs7dUJBQUMsWUFBWTtnQkFNZixTQUFTO3NCQURaLEtBQUs7dUJBQUMsYUFBYTtnQkFNaEIsV0FBVztzQkFEZCxLQUFLO3VCQUFDLGNBQWM7Z0JBS1osV0FBVztzQkFBbkIsS0FBSztnQkFDRyxlQUFlO3NCQUF2QixLQUFLO2dCQUNHLGNBQWM7c0JBQXRCLEtBQUs7Z0JBQ2dCLE9BQU87c0JBQTVCLEtBQUs7dUJBQUMsU0FBUztnQkFJTSxPQUFPO3NCQUE1QixLQUFLO3VCQUFDLFNBQVM7Z0JBSVEsU0FBUztzQkFBaEMsS0FBSzt1QkFBQyxXQUFXO2dCQVFULGFBQWE7c0JBQXJCLEtBQUs7Z0JBQ0csWUFBWTtzQkFBcEIsS0FBSyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ3JlYXRlZCBieSB2YWRpbWRleiBvbiAyMS8wNi8xNi5cbiAqL1xuaW1wb3J0IHtcbiAgQWZ0ZXJWaWV3Q2hlY2tlZCxcbiAgQWZ0ZXJWaWV3SW5pdCxcbiAgQ29tcG9uZW50LFxuICBFbGVtZW50UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIGluamVjdCxcbiAgSW5wdXQsXG4gIE5nWm9uZSxcbiAgT25DaGFuZ2VzLFxuICBPbkRlc3Ryb3ksXG4gIE9uSW5pdCxcbiAgT3V0cHV0LFxuICBTaW1wbGVDaGFuZ2VzLFxuICBWaWV3Q2hpbGQsXG59IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuaW1wb3J0ICogYXMgUERGSlMgZnJvbSAncGRmanMtZGlzdCc7XG5pbXBvcnQgKiBhcyBQREZKU1ZpZXdlciBmcm9tICdwZGZqcy1kaXN0L3dlYi9wZGZfdmlld2VyLm1qcyc7XG5pbXBvcnQgeyBjb21iaW5lTGF0ZXN0LCBmcm9tLCBmcm9tRXZlbnQsIFN1YmplY3QsIFN1YnNjcmlwdGlvbiB9IGZyb20gJ3J4anMnO1xuaW1wb3J0IHsgZGVib3VuY2VUaW1lLCBmaWx0ZXIsIHRha2VVbnRpbCB9IGZyb20gJ3J4anMvb3BlcmF0b3JzJztcblxuaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tICcuLi91dGlscy9ldmVudC1idXMtdXRpbHMnO1xuaW1wb3J0IHsgYXNzaWduLCBpc1NTUiB9IGZyb20gJy4uL3V0aWxzL2hlbHBlcnMnO1xuXG5pbXBvcnQgeyBnZXREb2N1bWVudCwgR2xvYmFsV29ya2VyT3B0aW9ucywgVmVyYm9zaXR5TGV2ZWwgfSBmcm9tICdwZGZqcy1kaXN0JztcbmltcG9ydCB7IERvY3VtZW50SW5pdFBhcmFtZXRlcnMgfSBmcm9tICdwZGZqcy1kaXN0L3R5cGVzL3NyYy9kaXNwbGF5L2FwaSc7XG5pbXBvcnQgeyBQYW5TZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9wYW4uc2VydmljZSc7XG5pbXBvcnQgeyBab29tU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvem9vbS5zZXJ2aWNlJztcbmltcG9ydCB0eXBlIHtcbiAgUERGRG9jdW1lbnRMb2FkaW5nVGFzayxcbiAgUERGRG9jdW1lbnRQcm94eSxcbiAgUERGUGFnZVByb3h5LFxuICBQREZQcm9ncmVzc0RhdGEsXG4gIFBERlNvdXJjZSxcbiAgUERGVmlld2VyT3B0aW9ucyxcbiAgWm9vbVNjYWxlLFxufSBmcm9tICcuL3R5cGluZ3MnO1xuXG5pZiAoIWlzU1NSKCkpIHtcbiAgYXNzaWduKFBERkpTLCAndmVyYm9zaXR5JywgVmVyYm9zaXR5TGV2ZWwuSU5GT1MpO1xufVxuXG4vLyBAdHMtZXhwZWN0LWVycm9yIFRoaXMgZG9lcyBub3QgZXhpc3Qgb3V0c2lkZSBvZiBwb2x5ZmlsbCB3aGljaCB0aGlzIGlzIGRvaW5nXG5pZiAodHlwZW9mIFByb21pc2Uud2l0aFJlc29sdmVycyA9PT0gJ3VuZGVmaW5lZCcgJiYgd2luZG93KSB7XG4gIC8vIEB0cy1leHBlY3QtZXJyb3IgVGhpcyBkb2VzIG5vdCBleGlzdCBvdXRzaWRlIG9mIHBvbHlmaWxsIHdoaWNoIHRoaXMgaXMgZG9pbmdcbiAgd2luZG93LlByb21pc2Uud2l0aFJlc29sdmVycyA9ICgpID0+IHtcbiAgICBsZXQgcmVzb2x2ZTtcbiAgICBsZXQgcmVqZWN0O1xuICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZSgocmVzLCByZWopID0+IHtcbiAgICAgIHJlc29sdmUgPSByZXM7XG4gICAgICByZWplY3QgPSByZWo7XG4gICAgfSk7XG4gICAgcmV0dXJuIHsgcHJvbWlzZSwgcmVzb2x2ZSwgcmVqZWN0IH07XG4gIH07XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFJlbmRlclRleHRNb2RlIHtcbiAgRElTQUJMRUQsXG4gIEVOQUJMRUQsXG4gIEVOSEFOQ0VELFxufVxuXG5AQ29tcG9uZW50KHtcbiAgc2VsZWN0b3I6ICdwZGYtdmlld2VyJyxcbiAgdGVtcGxhdGU6IGBcbiAgICA8ZGl2XG4gICAgICAjcGRmVmlld2VyQ29udGFpbmVyXG4gICAgICBjbGFzcz1cIm5nMi1wZGYtdmlld2VyLWNvbnRhaW5lclwiXG4gICAgICAobW91c2Vkb3duKT1cInBhblNlcnZpY2Uuc3RhcnRQYW4oJGV2ZW50LCBwZGZWaWV3ZXJDb250YWluZXIpXCJcbiAgICAgIChtb3VzZXVwKT1cInBhblNlcnZpY2UuZW5kUGFuKHBkZlZpZXdlckNvbnRhaW5lcilcIlxuICAgICAgKG1vdXNlbGVhdmUpPVwicGFuU2VydmljZS5lbmRQYW4ocGRmVmlld2VyQ29udGFpbmVyKVwiXG4gICAgICAobW91c2Vtb3ZlKT1cInBhblNlcnZpY2UucGFuKCRldmVudCwgcGRmVmlld2VyQ29udGFpbmVyKVwiXG4gICAgPlxuICAgICAgPGRpdiBjbGFzcz1cInBkZlZpZXdlclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICBgLFxuICBzdHlsZVVybHM6IFsnLi9wZGYtdmlld2VyLmNvbXBvbmVudC5zY3NzJ10sXG4gIHByb3ZpZGVyczogW1pvb21TZXJ2aWNlLCBQYW5TZXJ2aWNlXSxcbn0pXG5leHBvcnQgY2xhc3MgUGRmVmlld2VyQ29tcG9uZW50XG4gIGltcGxlbWVudHMgT25DaGFuZ2VzLCBPbkluaXQsIE9uRGVzdHJveSwgQWZ0ZXJWaWV3Q2hlY2tlZCwgQWZ0ZXJWaWV3SW5pdFxue1xuICBzdGF0aWMgQ1NTX1VOSVRTID0gOTYuMCAvIDcyLjA7XG4gIHN0YXRpYyBCT1JERVJfV0lEVEggPSA5O1xuXG4gIEBWaWV3Q2hpbGQoJ3BkZlZpZXdlckNvbnRhaW5lcicpXG4gIHBkZlZpZXdlckNvbnRhaW5lciE6IEVsZW1lbnRSZWY8SFRNTERpdkVsZW1lbnQ+O1xuXG4gIGV2ZW50QnVzITogUERGSlNWaWV3ZXIuRXZlbnRCdXM7XG4gIHBkZkxpbmtTZXJ2aWNlITogUERGSlNWaWV3ZXIuUERGTGlua1NlcnZpY2U7XG4gIHBkZkZpbmRDb250cm9sbGVyITogUERGSlNWaWV3ZXIuUERGRmluZENvbnRyb2xsZXI7XG4gIHBkZlZpZXdlciE6IFBERkpTVmlld2VyLlBERlZpZXdlciB8IFBERkpTVmlld2VyLlBERlNpbmdsZVBhZ2VWaWV3ZXI7XG5cbiAgcHJpdmF0ZSBpc1Zpc2libGUgPSBmYWxzZTtcblxuICBwcml2YXRlIF9jTWFwc1VybCA9XG4gICAgdHlwZW9mIFBERkpTICE9PSAndW5kZWZpbmVkJ1xuICAgICAgPyBgaHR0cHM6Ly91bnBrZy5jb20vcGRmanMtZGlzdEAkeyhQREZKUyBhcyBhbnkpLnZlcnNpb259L2NtYXBzL2BcbiAgICAgIDogbnVsbDtcbiAgcHJpdmF0ZSBfaW1hZ2VSZXNvdXJjZXNQYXRoID1cbiAgICB0eXBlb2YgUERGSlMgIT09ICd1bmRlZmluZWQnXG4gICAgICA/IGBodHRwczovL3VucGtnLmNvbS9wZGZqcy1kaXN0QCR7KFBERkpTIGFzIGFueSkudmVyc2lvbn0vd2ViL2ltYWdlcy9gXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgcHJpdmF0ZSBfcmVuZGVyVGV4dCA9IHRydWU7XG4gIHByaXZhdGUgX3JlbmRlclRleHRNb2RlOiBSZW5kZXJUZXh0TW9kZSA9IFJlbmRlclRleHRNb2RlLkVOQUJMRUQ7XG4gIHByaXZhdGUgX3N0aWNrVG9QYWdlID0gZmFsc2U7XG4gIHByaXZhdGUgX29yaWdpbmFsU2l6ZSA9IHRydWU7XG4gIHByaXZhdGUgX3BkZjogUERGRG9jdW1lbnRQcm94eSB8IHVuZGVmaW5lZDtcbiAgcHJpdmF0ZSBfcGFnZSA9IDE7XG5cbiAgcHJpdmF0ZSBfem9vbVNjYWxlOiBab29tU2NhbGUgPSAncGFnZS13aWR0aCc7XG4gIHByaXZhdGUgX3JvdGF0aW9uID0gMDtcbiAgcHJpdmF0ZSBfc2hvd0FsbCA9IHRydWU7XG4gIHByaXZhdGUgX2NhbkF1dG9SZXNpemUgPSB0cnVlO1xuICBwcml2YXRlIF9maXRUb1BhZ2UgPSBmYWxzZTtcbiAgcHJpdmF0ZSBfZXh0ZXJuYWxMaW5rVGFyZ2V0ID0gJ2JsYW5rJztcbiAgcHJpdmF0ZSBfc2hvd0JvcmRlcnMgPSBmYWxzZTtcbiAgcHJpdmF0ZSBsYXN0TG9hZGVkITogc3RyaW5nIHwgVWludDhBcnJheSB8IFBERlNvdXJjZSB8IG51bGw7XG4gIHByaXZhdGUgX2xhdGVzdFNjcm9sbGVkUGFnZSE6IG51bWJlcjtcblxuICBwcml2YXRlIHBhZ2VTY3JvbGxUaW1lb3V0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBpc0luaXRpYWxpemVkID0gZmFsc2U7XG4gIHByaXZhdGUgbG9hZGluZ1Rhc2s/OiBQREZEb2N1bWVudExvYWRpbmdUYXNrIHwgbnVsbDtcbiAgcHJpdmF0ZSBkZXN0cm95JCA9IG5ldyBTdWJqZWN0PHZvaWQ+KCk7XG4gIHByaXZhdGUgdXBkYXRlU2l6ZVN1YiQ6IFN1YnNjcmlwdGlvbiB8IG51bGwgPSBudWxsO1xuXG4gIEBPdXRwdXQoJ2FmdGVyLWxvYWQtY29tcGxldGUnKSBhZnRlckxvYWRDb21wbGV0ZSA9XG4gICAgbmV3IEV2ZW50RW1pdHRlcjxQREZEb2N1bWVudFByb3h5PigpO1xuICBAT3V0cHV0KCdwYWdlLXJlbmRlcmVkJykgcGFnZVJlbmRlcmVkID0gbmV3IEV2ZW50RW1pdHRlcjxDdXN0b21FdmVudD4oKTtcbiAgQE91dHB1dCgncGFnZXMtaW5pdGlhbGl6ZWQnKSBwYWdlSW5pdGlhbGl6ZWQgPVxuICAgIG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ3RleHQtbGF5ZXItcmVuZGVyZWQnKSB0ZXh0TGF5ZXJSZW5kZXJlZCA9XG4gICAgbmV3IEV2ZW50RW1pdHRlcjxDdXN0b21FdmVudD4oKTtcbiAgQE91dHB1dCgnZXJyb3InKSBvbkVycm9yID0gbmV3IEV2ZW50RW1pdHRlcjxhbnk+KCk7XG4gIEBPdXRwdXQoJ29uLXByb2dyZXNzJykgb25Qcm9ncmVzcyA9IG5ldyBFdmVudEVtaXR0ZXI8UERGUHJvZ3Jlc3NEYXRhPigpO1xuICBAT3V0cHV0KCkgcGFnZUNoYW5nZTogRXZlbnRFbWl0dGVyPG51bWJlcj4gPSBuZXcgRXZlbnRFbWl0dGVyPG51bWJlcj4odHJ1ZSk7XG4gIEBJbnB1dCgpIHNyYz86IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBQREZTb3VyY2U7XG5cbiAgQElucHV0KCdjLW1hcHMtdXJsJylcbiAgc2V0IGNNYXBzVXJsKGNNYXBzVXJsOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9jTWFwc1VybCA9IGNNYXBzVXJsO1xuICB9XG5cbiAgQElucHV0KCdwYWdlJylcbiAgc2V0IHBhZ2UoX3BhZ2U6IG51bWJlciB8IHN0cmluZyB8IGFueSkge1xuICAgIF9wYWdlID0gcGFyc2VJbnQoX3BhZ2UsIDEwKSB8fCAxO1xuICAgIGNvbnN0IG9yaWdpbmFsUGFnZSA9IF9wYWdlO1xuXG4gICAgaWYgKHRoaXMuX3BkZikge1xuICAgICAgX3BhZ2UgPSB0aGlzLmdldFZhbGlkUGFnZU51bWJlcihfcGFnZSk7XG4gICAgfVxuXG4gICAgdGhpcy5fcGFnZSA9IF9wYWdlO1xuICAgIGlmIChvcmlnaW5hbFBhZ2UgIT09IF9wYWdlKSB7XG4gICAgICB0aGlzLnBhZ2VDaGFuZ2UuZW1pdChfcGFnZSk7XG4gICAgfVxuICB9XG5cbiAgQElucHV0KCdyZW5kZXItdGV4dCcpXG4gIHNldCByZW5kZXJUZXh0KHJlbmRlclRleHQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9yZW5kZXJUZXh0ID0gcmVuZGVyVGV4dDtcbiAgfVxuXG4gIEBJbnB1dCgncmVuZGVyLXRleHQtbW9kZScpXG4gIHNldCByZW5kZXJUZXh0TW9kZShyZW5kZXJUZXh0TW9kZTogUmVuZGVyVGV4dE1vZGUpIHtcbiAgICB0aGlzLl9yZW5kZXJUZXh0TW9kZSA9IHJlbmRlclRleHRNb2RlO1xuICB9XG5cbiAgQElucHV0KCdvcmlnaW5hbC1zaXplJylcbiAgc2V0IG9yaWdpbmFsU2l6ZShvcmlnaW5hbFNpemU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9vcmlnaW5hbFNpemUgPSBvcmlnaW5hbFNpemU7XG4gIH1cblxuICBASW5wdXQoJ3Nob3ctYWxsJylcbiAgc2V0IHNob3dBbGwodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9zaG93QWxsID0gdmFsdWU7XG4gIH1cblxuICBASW5wdXQoJ3N0aWNrLXRvLXBhZ2UnKVxuICBzZXQgc3RpY2tUb1BhZ2UodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9zdGlja1RvUGFnZSA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KClcbiAgc2V0IHpvb20odmFsdWU6IG51bWJlcikge1xuICAgIGlmICh2YWx1ZSA8PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy56b29tU2VydmljZS56b29tID0gdmFsdWU7XG4gICAgdGhpcy56b29tU2VydmljZS5saW1pdFpvb20oKTtcbiAgfVxuICBnZXQgem9vbSgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLnpvb21TZXJ2aWNlLnpvb207XG4gIH1cbiAgQE91dHB1dCgpIHpvb21DaGFuZ2UgPSBuZXcgRXZlbnRFbWl0dGVyPG51bWJlcj4oKTtcblxuICBASW5wdXQoJ3pvb20tc2NhbGUnKVxuICBzZXQgem9vbVNjYWxlKHZhbHVlOiBab29tU2NhbGUpIHtcbiAgICB0aGlzLl96b29tU2NhbGUgPSB2YWx1ZTtcbiAgfVxuICBnZXQgem9vbVNjYWxlKCk6IFpvb21TY2FsZSB7XG4gICAgcmV0dXJuIHRoaXMuX3pvb21TY2FsZTtcbiAgfVxuXG4gIEBJbnB1dCgncm90YXRpb24nKVxuICBzZXQgcm90YXRpb24odmFsdWU6IG51bWJlcikge1xuICAgIGlmICghKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgdmFsdWUgJSA5MCA9PT0gMCkpIHtcbiAgICAgIGNvbnNvbGUud2FybignSW52YWxpZCBwYWdlcyByb3RhdGlvbiBhbmdsZS4nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9yb3RhdGlvbiA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KCdleHRlcm5hbC1saW5rLXRhcmdldCcpXG4gIHNldCBleHRlcm5hbExpbmtUYXJnZXQodmFsdWU6IHN0cmluZykge1xuICAgIHRoaXMuX2V4dGVybmFsTGlua1RhcmdldCA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KCdhdXRvcmVzaXplJylcbiAgc2V0IGF1dG9yZXNpemUodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9jYW5BdXRvUmVzaXplID0gQm9vbGVhbih2YWx1ZSk7XG4gIH1cblxuICBASW5wdXQoJ2ZpdC10by1wYWdlJylcbiAgc2V0IGZpdFRvUGFnZSh2YWx1ZTogYm9vbGVhbikge1xuICAgIHRoaXMuX2ZpdFRvUGFnZSA9IEJvb2xlYW4odmFsdWUpO1xuICB9XG5cbiAgQElucHV0KCdzaG93LWJvcmRlcnMnKVxuICBzZXQgc2hvd0JvcmRlcnModmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9zaG93Qm9yZGVycyA9IEJvb2xlYW4odmFsdWUpO1xuICB9XG5cbiAgQElucHV0KCkgaXNXaGVlbFpvb20gPSB0cnVlO1xuICBASW5wdXQoKSBpc1doZWVsQ3RybFpvb20gPSB0cnVlO1xuICBASW5wdXQoKSBpc09wdGltaXplWm9vbSA9IHRydWU7XG4gIEBJbnB1dCgnbWluWm9vbScpIHNldCBtaW5ab29tKHZhbHVlOiBudW1iZXIpIHtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLm1pblpvb20gPSB2YWx1ZTtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLmxpbWl0Wm9vbSgpO1xuICB9XG4gIEBJbnB1dCgnbWF4Wm9vbScpIHNldCBtYXhab29tKHZhbHVlOiBudW1iZXIpIHtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLm1heFpvb20gPSB2YWx1ZTtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLmxpbWl0Wm9vbSgpO1xuICB9XG4gIEBJbnB1dCgnZW5hYmxlUGFuJykgc2V0IGVuYWJsZVBhbihlbmFibGVQYW46IGJvb2xlYW4pIHtcbiAgICB0aGlzLnBhblNlcnZpY2UuZW5hYmxlUGFuID0gZW5hYmxlUGFuO1xuXG4gICAgY29uc3QgY3Vyc29yID0gZW5hYmxlUGFuID8gJ2dyYWInIDogJ2RlZmF1bHQnO1xuICAgIGlmICh0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudCkge1xuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXIubmF0aXZlRWxlbWVudC5zdHlsZS5jdXJzb3IgPSBjdXJzb3I7XG4gICAgfVxuICB9XG4gIEBJbnB1dCgpIGRpc2FibGVTdHJlYW0gPSBmYWxzZTtcbiAgQElucHV0KCkgZGlzYWJsZVJhbmdlID0gZmFsc2U7XG5cbiAgc3RhdGljIGdldExpbmtUYXJnZXQodHlwZTogc3RyaW5nKSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdibGFuayc6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LkJMQU5LO1xuICAgICAgY2FzZSAnbm9uZSc6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0Lk5PTkU7XG4gICAgICBjYXNlICdzZWxmJzpcbiAgICAgICAgcmV0dXJuIChQREZKU1ZpZXdlciBhcyBhbnkpLkxpbmtUYXJnZXQuU0VMRjtcbiAgICAgIGNhc2UgJ3BhcmVudCc6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LlBBUkVOVDtcbiAgICAgIGNhc2UgJ3RvcCc6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LlRPUDtcbiAgICB9XG5cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudCA9IGluamVjdChFbGVtZW50UmVmPEhUTUxFbGVtZW50Pik7XG4gIHByaXZhdGUgcmVhZG9ubHkgbmdab25lID0gaW5qZWN0KE5nWm9uZSk7XG4gIHByaXZhdGUgcmVhZG9ubHkgem9vbVNlcnZpY2UgPSBpbmplY3QoWm9vbVNlcnZpY2UpO1xuICBwcm90ZWN0ZWQgcmVhZG9ubHkgcGFuU2VydmljZSA9IGluamVjdChQYW5TZXJ2aWNlKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBpZiAoaXNTU1IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBwZGZXb3JrZXJTcmM6IHN0cmluZztcblxuICAgIGNvbnN0IHBkZkpzVmVyc2lvbjogc3RyaW5nID0gKFBERkpTIGFzIGFueSkudmVyc2lvbjtcbiAgICBjb25zdCB2ZXJzaW9uU3BlY2lmaWNQZGZXb3JrZXJVcmw6IHN0cmluZyA9ICh3aW5kb3cgYXMgYW55KVtcbiAgICAgIGBwZGZXb3JrZXJTcmMke3BkZkpzVmVyc2lvbn1gXG4gICAgXTtcblxuICAgIGlmICh2ZXJzaW9uU3BlY2lmaWNQZGZXb3JrZXJVcmwpIHtcbiAgICAgIHBkZldvcmtlclNyYyA9IHZlcnNpb25TcGVjaWZpY1BkZldvcmtlclVybDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgd2luZG93Lmhhc093blByb3BlcnR5KCdwZGZXb3JrZXJTcmMnKSAmJlxuICAgICAgdHlwZW9mICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmMgPT09ICdzdHJpbmcnICYmXG4gICAgICAod2luZG93IGFzIGFueSkucGRmV29ya2VyU3JjXG4gICAgKSB7XG4gICAgICBwZGZXb3JrZXJTcmMgPSAod2luZG93IGFzIGFueSkucGRmV29ya2VyU3JjO1xuICAgIH0gZWxzZSB7XG4gICAgICBwZGZXb3JrZXJTcmMgPSBgaHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L25wbS9wZGZqcy1kaXN0QCR7cGRmSnNWZXJzaW9ufS9sZWdhY3kvYnVpbGQvcGRmLndvcmtlci5taW4ubWpzYDtcbiAgICB9XG5cbiAgICBhc3NpZ24oR2xvYmFsV29ya2VyT3B0aW9ucywgJ3dvcmtlclNyYycsIHBkZldvcmtlclNyYyk7XG4gIH1cblxuICBuZ0FmdGVyVmlld0NoZWNrZWQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG9mZnNldCA9IHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50Lm9mZnNldFBhcmVudDtcblxuICAgIGlmICh0aGlzLmlzVmlzaWJsZSA9PT0gdHJ1ZSAmJiBvZmZzZXQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5pc1Zpc2libGUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1Zpc2libGUgPT09IGZhbHNlICYmIG9mZnNldCAhPSBudWxsKSB7XG4gICAgICB0aGlzLmlzVmlzaWJsZSA9IHRydWU7XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmluaXRpYWxpemUoKTtcbiAgICAgICAgdGhpcy5uZ09uQ2hhbmdlcyh7IHNyYzogdGhpcy5zcmMgfSBhcyBhbnkpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgbmdBZnRlclZpZXdJbml0KCk6IHZvaWQge1xuICAgIHRoaXMuem9vbVNlcnZpY2UuaW5pdFNldHRpbmdzKFxuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQsXG4gICAgICB0aGlzLmlzV2hlZWxab29tLFxuICAgICAgdGhpcy5pc1doZWVsQ3RybFpvb21cbiAgICApO1xuICB9XG5cbiAgbmdPbkluaXQoKTogdm9pZCB7XG4gICAgdGhpcy5pbml0aWFsaXplKCk7XG4gICAgdGhpcy5zZXR1cFJlc2l6ZUxpc3RlbmVyKCk7XG4gIH1cblxuICBuZ09uRGVzdHJveSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy51cGRhdGVTaXplU3ViJCkge1xuICAgICAgdGhpcy51cGRhdGVTaXplU3ViJC51bnN1YnNjcmliZSgpO1xuICAgIH1cblxuICAgIHRoaXMuZGVzdHJveSQubmV4dCgpO1xuICAgIHRoaXMuZGVzdHJveSQuY29tcGxldGUoKTtcblxuICAgIHRoaXMuY2xlYXIoKTtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLnJlbW92ZUxpc3RlbmVycyh0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudCk7XG4gICAgdGhpcy5sb2FkaW5nVGFzayA9IG51bGw7XG4gIH1cblxuICBuZ09uQ2hhbmdlcyhjaGFuZ2VzOiBTaW1wbGVDaGFuZ2VzKTogdm9pZCB7XG4gICAgaWYgKGlzU1NSKCkgfHwgIXRoaXMuaXNWaXNpYmxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCdzcmMnIGluIGNoYW5nZXMpIHtcbiAgICAgIHRoaXMubG9hZFBERigpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5fcGRmKSB7XG4gICAgICBpZiAoJ3JlbmRlclRleHQnIGluIGNoYW5nZXMgfHwgJ3Nob3dBbGwnIGluIGNoYW5nZXMpIHtcbiAgICAgICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuICAgICAgICB0aGlzLnJlc2V0UGRmRG9jdW1lbnQoKTtcbiAgICAgIH1cbiAgICAgIGlmICgncGFnZScgaW4gY2hhbmdlcykge1xuICAgICAgICBjb25zdCB7IHBhZ2UgfSA9IGNoYW5nZXM7XG4gICAgICAgIGlmIChwYWdlLmN1cnJlbnRWYWx1ZSA9PT0gdGhpcy5fbGF0ZXN0U2Nyb2xsZWRQYWdlKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTmV3IGZvcm0gb2YgcGFnZSBjaGFuZ2luZzogVGhlIHZpZXdlciB3aWxsIG5vdyBqdW1wIHRvIHRoZSBzcGVjaWZpZWQgcGFnZSB3aGVuIGl0IGlzIGNoYW5nZWQuXG4gICAgICAgIC8vIFRoaXMgYmVoYXZpb3IgaXMgaW50cm9kdWNlZCBieSB1c2luZyB0aGUgUERGU2luZ2xlUGFnZVZpZXdlclxuICAgICAgICB0aGlzLnBkZlZpZXdlci5zY3JvbGxQYWdlSW50b1ZpZXcoeyBwYWdlTnVtYmVyOiB0aGlzLl9wYWdlIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZVNpemUoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMudXBkYXRlU2l6ZVN1YiQpIHtcbiAgICAgIHRoaXMudXBkYXRlU2l6ZVN1YiQudW5zdWJzY3JpYmUoKTtcbiAgICB9XG5cbiAgICB0aGlzLnVwZGF0ZVNpemVTdWIkID0gY29tYmluZUxhdGVzdChbXG4gICAgICBmcm9tKHRoaXMuX3BkZiEuZ2V0UGFnZSh0aGlzLnBkZlZpZXdlci5jdXJyZW50UGFnZU51bWJlcikpLFxuICAgICAgdGhpcy56b29tU2VydmljZS50cmlnZ2VyVXBkYXRlU2l6ZSQsXG4gICAgXSlcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoe1xuICAgICAgICBuZXh0OiAoW3BhZ2VdOiBbUERGUGFnZVByb3h5LCB2b2lkXSkgPT4ge1xuICAgICAgICAgIGlmICh0aGlzLmlzT3B0aW1pemVab29tIHx8IHRoaXMuaXNXaGVlbFpvb20pIHtcbiAgICAgICAgICAgIHRoaXMuem9vbVNlcnZpY2Uuc2F2ZVNjcm9sbFBvc2l0aW9uKFxuICAgICAgICAgICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByb3RhdGlvbiA9IHRoaXMuX3JvdGF0aW9uICsgcGFnZS5yb3RhdGU7XG4gICAgICAgICAgY29uc3Qgdmlld3BvcnRXaWR0aCA9XG4gICAgICAgICAgICBwYWdlLmdldFZpZXdwb3J0KHtcbiAgICAgICAgICAgICAgc2NhbGU6IHRoaXMuem9vbVNlcnZpY2Uuem9vbSxcbiAgICAgICAgICAgICAgcm90YXRpb24sXG4gICAgICAgICAgICB9KS53aWR0aCAqIFBkZlZpZXdlckNvbXBvbmVudC5DU1NfVU5JVFM7XG4gICAgICAgICAgbGV0IHNjYWxlID0gdGhpcy56b29tU2VydmljZS56b29tO1xuICAgICAgICAgIGxldCBzdGlja1RvUGFnZSA9IHRydWU7XG5cbiAgICAgICAgICAvLyBTY2FsZSB0aGUgZG9jdW1lbnQgd2hlbiBpdCBzaG91bGRuJ3QgYmUgaW4gb3JpZ2luYWwgc2l6ZSBvciBkb2Vzbid0IGZpdCBpbnRvIHRoZSB2aWV3cG9ydFxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLl9vcmlnaW5hbFNpemUgfHxcbiAgICAgICAgICAgICh0aGlzLl9maXRUb1BhZ2UgJiZcbiAgICAgICAgICAgICAgdmlld3BvcnRXaWR0aCA+XG4gICAgICAgICAgICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQuY2xpZW50V2lkdGgpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zdCB2aWV3UG9ydCA9IHBhZ2UuZ2V0Vmlld3BvcnQoeyBzY2FsZTogMSwgcm90YXRpb24gfSk7XG4gICAgICAgICAgICBzY2FsZSA9IHRoaXMuZ2V0U2NhbGUodmlld1BvcnQud2lkdGgsIHZpZXdQb3J0LmhlaWdodCk7XG4gICAgICAgICAgICBzdGlja1RvUGFnZSA9ICF0aGlzLl9zdGlja1RvUGFnZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLnBkZlZpZXdlci5jdXJyZW50U2NhbGUgPSBzY2FsZTtcblxuICAgICAgICAgIGlmIChzdGlja1RvUGFnZSlcbiAgICAgICAgICAgIHRoaXMucGRmVmlld2VyLnNjcm9sbFBhZ2VJbnRvVmlldyh7XG4gICAgICAgICAgICAgIHBhZ2VOdW1iZXI6IHBhZ2UucGFnZU51bWJlcixcbiAgICAgICAgICAgICAgaWdub3JlRGVzdGluYXRpb25ab29tOiB0cnVlLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICBpZiAodGhpcy5pc09wdGltaXplWm9vbSB8fCB0aGlzLmlzV2hlZWxab29tKSB7XG4gICAgICAgICAgICB0aGlzLnpvb21TZXJ2aWNlLnJlc3RvcmVTY3JvbGxQb3NpdGlvbihcbiAgICAgICAgICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy56b29tQ2hhbmdlLmVtaXQodGhpcy56b29tU2VydmljZS56b29tKTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICB9XG5cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0KTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sb2FkaW5nVGFzayAmJiAhdGhpcy5sb2FkaW5nVGFzay5kZXN0cm95ZWQpIHtcbiAgICAgIHRoaXMubG9hZGluZ1Rhc2suZGVzdHJveSgpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIHRoaXMuX2xhdGVzdFNjcm9sbGVkUGFnZSA9IDA7XG4gICAgICB0aGlzLl9wZGYuZGVzdHJveSgpO1xuICAgICAgdGhpcy5fcGRmID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIHRoaXMucGRmVmlld2VyICYmIHRoaXMucGRmVmlld2VyLnNldERvY3VtZW50KG51bGwgYXMgYW55KTtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlICYmIHRoaXMucGRmTGlua1NlcnZpY2Uuc2V0RG9jdW1lbnQobnVsbCwgbnVsbCk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlciAmJiB0aGlzLnBkZkZpbmRDb250cm9sbGVyLnNldERvY3VtZW50KG51bGwgYXMgYW55KTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0UERGTGlua1NlcnZpY2VDb25maWcoKToge30ge1xuICAgIGNvbnN0IGxpbmtUYXJnZXQgPSBQZGZWaWV3ZXJDb21wb25lbnQuZ2V0TGlua1RhcmdldChcbiAgICAgIHRoaXMuX2V4dGVybmFsTGlua1RhcmdldFxuICAgICk7XG5cbiAgICBpZiAobGlua1RhcmdldCkge1xuICAgICAgcmV0dXJuIHsgZXh0ZXJuYWxMaW5rVGFyZ2V0OiBsaW5rVGFyZ2V0IH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgcHJpdmF0ZSBpbml0RXZlbnRCdXMoKTogdm9pZCB7XG4gICAgdGhpcy5ldmVudEJ1cyA9IGNyZWF0ZUV2ZW50QnVzKFBERkpTVmlld2VyLCB0aGlzLmRlc3Ryb3kkKTtcblxuICAgIGZyb21FdmVudDxDdXN0b21FdmVudD4odGhpcy5ldmVudEJ1cywgJ3BhZ2VyZW5kZXJlZCcpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICB0aGlzLnBhZ2VSZW5kZXJlZC5lbWl0KGV2ZW50KTtcbiAgICAgIH0pO1xuXG4gICAgZnJvbUV2ZW50PEN1c3RvbUV2ZW50Pih0aGlzLmV2ZW50QnVzLCAncGFnZXNpbml0JylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMucGFnZUluaXRpYWxpemVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQodGhpcy5ldmVudEJ1cywgJ3BhZ2VjaGFuZ2luZycpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKCh7IHBhZ2VOdW1iZXIgfTogYW55KSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wYWdlU2Nyb2xsVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UgPSBwYWdlTnVtYmVyO1xuICAgICAgICAgIHRoaXMucGFnZUNoYW5nZS5lbWl0KHBhZ2VOdW1iZXIpO1xuICAgICAgICB9LCAxMDApO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQ8Q3VzdG9tRXZlbnQ+KHRoaXMuZXZlbnRCdXMsICd0ZXh0bGF5ZXJyZW5kZXJlZCcpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICB0aGlzLnRleHRMYXllclJlbmRlcmVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGluaXRQREZTZXJ2aWNlcygpOiB2b2lkIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlID0gbmV3IFBERkpTVmlld2VyLlBERkxpbmtTZXJ2aWNlKHtcbiAgICAgIGV2ZW50QnVzOiB0aGlzLmV2ZW50QnVzLFxuICAgICAgLi4udGhpcy5nZXRQREZMaW5rU2VydmljZUNvbmZpZygpLFxuICAgIH0pO1xuICAgIHRoaXMucGRmRmluZENvbnRyb2xsZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGRmluZENvbnRyb2xsZXIoe1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICBsaW5rU2VydmljZTogdGhpcy5wZGZMaW5rU2VydmljZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0UERGT3B0aW9ucygpOiBQREZWaWV3ZXJPcHRpb25zIHtcbiAgICByZXR1cm4ge1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICBjb250YWluZXI6IHRoaXMuZWxlbWVudC5uYXRpdmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2RpdicpISxcbiAgICAgIHJlbW92ZVBhZ2VCb3JkZXJzOiAhdGhpcy5fc2hvd0JvcmRlcnMsXG4gICAgICBsaW5rU2VydmljZTogdGhpcy5wZGZMaW5rU2VydmljZSxcbiAgICAgIHRleHRMYXllck1vZGU6IHRoaXMuX3JlbmRlclRleHRcbiAgICAgICAgPyB0aGlzLl9yZW5kZXJUZXh0TW9kZVxuICAgICAgICA6IFJlbmRlclRleHRNb2RlLkRJU0FCTEVELFxuICAgICAgZmluZENvbnRyb2xsZXI6IHRoaXMucGRmRmluZENvbnRyb2xsZXIsXG4gICAgICBsMTBuOiBuZXcgUERGSlNWaWV3ZXIuR2VuZXJpY0wxMG4oJ2VuJyksXG4gICAgICBpbWFnZVJlc291cmNlc1BhdGg6IHRoaXMuX2ltYWdlUmVzb3VyY2VzUGF0aCxcbiAgICAgIGFubm90YXRpb25FZGl0b3JNb2RlOiBQREZKUy5Bbm5vdGF0aW9uRWRpdG9yVHlwZS5ESVNBQkxFLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNldHVwVmlld2VyKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnBkZlZpZXdlcikge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICAgIH1cblxuICAgIGFzc2lnbihQREZKUywgJ2Rpc2FibGVUZXh0TGF5ZXInLCAhdGhpcy5fcmVuZGVyVGV4dCk7XG5cbiAgICB0aGlzLmluaXRQREZTZXJ2aWNlcygpO1xuXG4gICAgaWYgKHRoaXMuX3Nob3dBbGwpIHtcbiAgICAgIHRoaXMucGRmVmlld2VyID0gbmV3IFBERkpTVmlld2VyLlBERlZpZXdlcih0aGlzLmdldFBERk9wdGlvbnMoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGRmVmlld2VyID0gbmV3IFBERkpTVmlld2VyLlBERlNpbmdsZVBhZ2VWaWV3ZXIoXG4gICAgICAgIHRoaXMuZ2V0UERGT3B0aW9ucygpXG4gICAgICApO1xuICAgIH1cbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldFZpZXdlcih0aGlzLnBkZlZpZXdlcik7XG5cbiAgICB0aGlzLnBkZlZpZXdlci5fY3VycmVudFBhZ2VOdW1iZXIgPSB0aGlzLl9wYWdlO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYWxpZFBhZ2VOdW1iZXIocGFnZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAocGFnZSA8IDEpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIGlmIChwYWdlID4gdGhpcy5fcGRmIS5udW1QYWdlcykge1xuICAgICAgcmV0dXJuIHRoaXMuX3BkZiEubnVtUGFnZXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhZ2U7XG4gIH1cblxuICBwcml2YXRlIGdldERvY3VtZW50UGFyYW1zKCk6XG4gICAgfCBzdHJpbmdcbiAgICB8IFVpbnQ4QXJyYXlcbiAgICB8IERvY3VtZW50SW5pdFBhcmFtZXRlcnNcbiAgICB8IHVuZGVmaW5lZCB7XG4gICAgY29uc3Qgc3JjVHlwZSA9IHR5cGVvZiB0aGlzLnNyYztcblxuICAgIGlmICghdGhpcy5fY01hcHNVcmwpIHtcbiAgICAgIHJldHVybiB0aGlzLnNyYztcbiAgICB9XG5cbiAgICBjb25zdCBwYXJhbXM6IGFueSA9IHtcbiAgICAgIGNNYXBVcmw6IHRoaXMuX2NNYXBzVXJsLFxuICAgICAgY01hcFBhY2tlZDogdHJ1ZSxcbiAgICAgIGVuYWJsZVhmYTogdHJ1ZSxcbiAgICB9O1xuICAgIHBhcmFtcy5pc0V2YWxTdXBwb3J0ZWQgPSBmYWxzZTsgLy8gaHR0cDovL2N2ZS5vcmcvQ1ZFUmVjb3JkP2lkPUNWRS0yMDI0LTQzNjdcblxuICAgIGlmIChzcmNUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgcGFyYW1zLnVybCA9IHRoaXMuc3JjO1xuICAgIH0gZWxzZSBpZiAoc3JjVHlwZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmICgodGhpcy5zcmMgYXMgYW55KS5ieXRlTGVuZ3RoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcGFyYW1zLmRhdGEgPSB0aGlzLnNyYztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIE9iamVjdC5hc3NpZ24ocGFyYW1zLCB0aGlzLnNyYyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcGFyYW1zLmRpc2FibGVTdHJlYW0gPSB0aGlzLmRpc2FibGVTdHJlYW07XG4gICAgcGFyYW1zLmRpc2FibGVSYW5nZSA9IHRoaXMuZGlzYWJsZVJhbmdlO1xuXG4gICAgcmV0dXJuIHBhcmFtcztcbiAgfVxuXG4gIHByaXZhdGUgbG9hZFBERigpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc3JjKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMubGFzdExvYWRlZCA9PT0gdGhpcy5zcmMpIHtcbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5jbGVhcigpO1xuXG4gICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuXG4gICAgdGhpcy5sb2FkaW5nVGFzayA9IGdldERvY3VtZW50KHRoaXMuZ2V0RG9jdW1lbnRQYXJhbXMoKSk7XG5cbiAgICB0aGlzLmxvYWRpbmdUYXNrIS5vblByb2dyZXNzID0gKHByb2dyZXNzRGF0YTogUERGUHJvZ3Jlc3NEYXRhKSA9PiB7XG4gICAgICB0aGlzLm9uUHJvZ3Jlc3MuZW1pdChwcm9ncmVzc0RhdGEpO1xuICAgIH07XG5cbiAgICBjb25zdCBzcmMgPSB0aGlzLnNyYztcblxuICAgIGZyb20odGhpcy5sb2FkaW5nVGFzayEucHJvbWlzZSBhcyBQcm9taXNlPFBERkRvY3VtZW50UHJveHk+KVxuICAgICAgLnBpcGUodGFrZVVudGlsKHRoaXMuZGVzdHJveSQpKVxuICAgICAgLnN1YnNjcmliZSh7XG4gICAgICAgIG5leHQ6IChwZGYpID0+IHtcbiAgICAgICAgICB0aGlzLl9wZGYgPSBwZGY7XG4gICAgICAgICAgdGhpcy5sYXN0TG9hZGVkID0gc3JjO1xuXG4gICAgICAgICAgdGhpcy5hZnRlckxvYWRDb21wbGV0ZS5lbWl0KHBkZik7XG4gICAgICAgICAgdGhpcy5yZXNldFBkZkRvY3VtZW50KCk7XG5cbiAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgICB9LFxuICAgICAgICBlcnJvcjogKGVycm9yKSA9PiB7XG4gICAgICAgICAgdGhpcy5sYXN0TG9hZGVkID0gbnVsbDtcbiAgICAgICAgICB0aGlzLm9uRXJyb3IuZW1pdChlcnJvcik7XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuICAgIHRoaXMucGFnZSA9IHRoaXMuX3BhZ2U7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXIoKTogdm9pZCB7XG4gICAgdGhpcy5fcGFnZSA9IHRoaXMuZ2V0VmFsaWRQYWdlTnVtYmVyKHRoaXMuX3BhZ2UpO1xuXG4gICAgaWYgKFxuICAgICAgdGhpcy5fcm90YXRpb24gIT09IDAgfHxcbiAgICAgIHRoaXMucGRmVmlld2VyLnBhZ2VzUm90YXRpb24gIT09IHRoaXMuX3JvdGF0aW9uXG4gICAgKSB7XG4gICAgICAvLyB3YWl0IHVudGlsIGF0IGxlYXN0IHRoZSBmaXJzdCBwYWdlIGlzIGF2YWlsYWJsZS5cbiAgICAgIHRoaXMucGRmVmlld2VyLmZpcnN0UGFnZVByb21pc2U/LnRoZW4oXG4gICAgICAgICgpID0+ICh0aGlzLnBkZlZpZXdlci5wYWdlc1JvdGF0aW9uID0gdGhpcy5fcm90YXRpb24pXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9zdGlja1RvUGFnZSkge1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXMucGRmVmlld2VyLmN1cnJlbnRQYWdlTnVtYmVyID0gdGhpcy5fcGFnZTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5wZGZWaWV3ZXIuX3BhZ2VzPy5sZW5ndGgpIHtcbiAgICAgIC8vIHRoZSBmaXJzdCB0aW1lIHdlIHdhaXQgdW50aWwgcGFnZXMgaW5pdFxuICAgICAgY29uc3Qgc3ViID0gdGhpcy5wYWdlSW5pdGlhbGl6ZWQuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgdGhpcy51cGRhdGVTaXplKCk7XG4gICAgICAgIHN1Yi51bnN1YnNjcmliZSgpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXBkYXRlU2l6ZSgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0U2NhbGUodmlld3BvcnRXaWR0aDogbnVtYmVyLCB2aWV3cG9ydEhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBib3JkZXJTaXplID0gdGhpcy5fc2hvd0JvcmRlcnNcbiAgICAgID8gMiAqIFBkZlZpZXdlckNvbXBvbmVudC5CT1JERVJfV0lEVEhcbiAgICAgIDogMDtcbiAgICBjb25zdCBwZGZDb250YWluZXJXaWR0aCA9XG4gICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudC5jbGllbnRXaWR0aCAtIGJvcmRlclNpemU7XG4gICAgY29uc3QgcGRmQ29udGFpbmVySGVpZ2h0ID1cbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudEhlaWdodCAtIGJvcmRlclNpemU7XG5cbiAgICBpZiAoXG4gICAgICBwZGZDb250YWluZXJIZWlnaHQgPT09IDAgfHxcbiAgICAgIHZpZXdwb3J0SGVpZ2h0ID09PSAwIHx8XG4gICAgICBwZGZDb250YWluZXJXaWR0aCA9PT0gMCB8fFxuICAgICAgdmlld3BvcnRXaWR0aCA9PT0gMFxuICAgICkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgbGV0IHJhdGlvID0gMTtcbiAgICBzd2l0Y2ggKHRoaXMuX3pvb21TY2FsZSkge1xuICAgICAgY2FzZSAncGFnZS1maXQnOlxuICAgICAgICByYXRpbyA9IE1hdGgubWluKFxuICAgICAgICAgIHBkZkNvbnRhaW5lckhlaWdodCAvIHZpZXdwb3J0SGVpZ2h0LFxuICAgICAgICAgIHBkZkNvbnRhaW5lcldpZHRoIC8gdmlld3BvcnRXaWR0aFxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZ2UtaGVpZ2h0JzpcbiAgICAgICAgcmF0aW8gPSBwZGZDb250YWluZXJIZWlnaHQgLyB2aWV3cG9ydEhlaWdodDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwYWdlLXdpZHRoJzpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJhdGlvID0gcGRmQ29udGFpbmVyV2lkdGggLyB2aWV3cG9ydFdpZHRoO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gKHRoaXMuem9vbVNlcnZpY2Uuem9vbSAqIHJhdGlvKSAvIFBkZlZpZXdlckNvbXBvbmVudC5DU1NfVU5JVFM7XG4gIH1cblxuICBwcml2YXRlIHJlc2V0UGRmRG9jdW1lbnQoKTogdm9pZCB7XG4gICAgdGhpcy5wZGZMaW5rU2VydmljZS5zZXREb2N1bWVudCh0aGlzLl9wZGYsIG51bGwpO1xuICAgIHRoaXMucGRmRmluZENvbnRyb2xsZXIuc2V0RG9jdW1lbnQodGhpcy5fcGRmISk7XG4gICAgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQodGhpcy5fcGRmISk7XG4gIH1cblxuICBwcml2YXRlIGluaXRpYWxpemUoKTogdm9pZCB7XG4gICAgaWYgKGlzU1NSKCkgfHwgIXRoaXMuaXNWaXNpYmxlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5pc0luaXRpYWxpemVkID0gdHJ1ZTtcbiAgICB0aGlzLmluaXRFdmVudEJ1cygpO1xuICAgIHRoaXMuc2V0dXBWaWV3ZXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBSZXNpemVMaXN0ZW5lcigpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubmdab25lLnJ1bk91dHNpZGVBbmd1bGFyKCgpID0+IHtcbiAgICAgIGZyb21FdmVudCh3aW5kb3csICdyZXNpemUnKVxuICAgICAgICAucGlwZShcbiAgICAgICAgICBkZWJvdW5jZVRpbWUoMTAwKSxcbiAgICAgICAgICBmaWx0ZXIoKCkgPT4gdGhpcy5fY2FuQXV0b1Jlc2l6ZSAmJiAhIXRoaXMuX3BkZiksXG4gICAgICAgICAgdGFrZVVudGlsKHRoaXMuZGVzdHJveSQpXG4gICAgICAgIClcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgdGhpcy51cGRhdGVTaXplKCk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG4iXX0=