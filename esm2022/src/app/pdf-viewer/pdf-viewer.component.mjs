/**
 * Created by vadimdez on 21/06/16.
 */
import { Component, Input, Output, ElementRef, EventEmitter, ViewChild, NgZone, inject, } from '@angular/core';
import { combineLatest, from, fromEvent, Subject } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import * as PDFJS from 'pdfjs-dist';
import * as PDFJSViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import { createEventBus } from '../utils/event-bus-utils';
import { assign, isSSR } from '../utils/helpers';
import { GlobalWorkerOptions, VerbosityLevel, getDocument } from 'pdfjs-dist';
import { ZoomService } from './services/zoom.service';
import { PanService } from './services/pan.service';
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
        this.clear();
        this.destroy$.next();
        this.loadingTask = null;
        this.zoomService.removeListeners(this.pdfViewerContainer?.nativeElement);
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
        combineLatest([
            from(this._pdf.getPage(this.pdfViewer.currentPageNumber)),
            this.zoomService.triggerUpdateSize,
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
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.0", type: PdfViewerComponent, selector: "pdf-viewer", inputs: { src: "src", cMapsUrl: ["c-maps-url", "cMapsUrl"], page: "page", renderText: ["render-text", "renderText"], renderTextMode: ["render-text-mode", "renderTextMode"], originalSize: ["original-size", "originalSize"], showAll: ["show-all", "showAll"], stickToPage: ["stick-to-page", "stickToPage"], zoom: "zoom", zoomScale: ["zoom-scale", "zoomScale"], rotation: "rotation", externalLinkTarget: ["external-link-target", "externalLinkTarget"], autoresize: "autoresize", fitToPage: ["fit-to-page", "fitToPage"], showBorders: ["show-borders", "showBorders"], isWheelZoom: "isWheelZoom", isWheelCtrlZoom: "isWheelCtrlZoom", isOptimizeZoom: "isOptimizeZoom", minZoom: "minZoom", maxZoom: "maxZoom", enablePan: "enablePan" }, outputs: { afterLoadComplete: "after-load-complete", pageRendered: "page-rendered", pageInitialized: "pages-initialized", textLayerRendered: "text-layer-rendered", onError: "error", onProgress: "on-progress", pageChange: "pageChange", zoomChange: "zoomChange" }, viewQueries: [{ propertyName: "pdfViewerContainer", first: true, predicate: ["pdfViewerContainer"], descendants: true }], usesOnChanges: true, ngImport: i0, template: `
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
  `, styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .canvasWrapper canvas{width:100%}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,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) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] }]
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLXZpZXdlci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvcGRmLXZpZXdlci5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFDSCxPQUFPLEVBQ0wsU0FBUyxFQUNULEtBQUssRUFDTCxNQUFNLEVBQ04sVUFBVSxFQUNWLFlBQVksRUFLWixTQUFTLEVBRVQsTUFBTSxFQUVOLE1BQU0sR0FDUCxNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQy9ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pFLE9BQU8sS0FBSyxLQUFLLE1BQU0sWUFBWSxDQUFDO0FBQ3BDLE9BQU8sS0FBSyxXQUFXLE1BQU0sK0JBQStCLENBQUM7QUFFN0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFXakQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRXRELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQzs7QUFFcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFO0lBQ1osTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0NBQ2xEO0FBRUQsK0VBQStFO0FBQy9FLElBQUksT0FBTyxPQUFPLENBQUMsYUFBYSxLQUFLLFdBQVcsSUFBSSxNQUFNLEVBQUU7SUFD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QVM7c0JBQWhDLEtBQUs7dUJBQUMsV0FBVyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ3JlYXRlZCBieSB2YWRpbWRleiBvbiAyMS8wNi8xNi5cbiAqL1xuaW1wb3J0IHtcbiAgQ29tcG9uZW50LFxuICBJbnB1dCxcbiAgT3V0cHV0LFxuICBFbGVtZW50UmVmLFxuICBFdmVudEVtaXR0ZXIsXG4gIE9uQ2hhbmdlcyxcbiAgU2ltcGxlQ2hhbmdlcyxcbiAgT25Jbml0LFxuICBPbkRlc3Ryb3ksXG4gIFZpZXdDaGlsZCxcbiAgQWZ0ZXJWaWV3Q2hlY2tlZCxcbiAgTmdab25lLFxuICBBZnRlclZpZXdJbml0LFxuICBpbmplY3QsXG59IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuaW1wb3J0IHsgY29tYmluZUxhdGVzdCwgZnJvbSwgZnJvbUV2ZW50LCBTdWJqZWN0IH0gZnJvbSAncnhqcyc7XG5pbXBvcnQgeyBkZWJvdW5jZVRpbWUsIGZpbHRlciwgdGFrZVVudGlsIH0gZnJvbSAncnhqcy9vcGVyYXRvcnMnO1xuaW1wb3J0ICogYXMgUERGSlMgZnJvbSAncGRmanMtZGlzdCc7XG5pbXBvcnQgKiBhcyBQREZKU1ZpZXdlciBmcm9tICdwZGZqcy1kaXN0L3dlYi9wZGZfdmlld2VyLm1qcyc7XG5cbmltcG9ydCB7IGNyZWF0ZUV2ZW50QnVzIH0gZnJvbSAnLi4vdXRpbHMvZXZlbnQtYnVzLXV0aWxzJztcbmltcG9ydCB7IGFzc2lnbiwgaXNTU1IgfSBmcm9tICcuLi91dGlscy9oZWxwZXJzJztcblxuaW1wb3J0IHR5cGUge1xuICBQREZTb3VyY2UsXG4gIFBERlBhZ2VQcm94eSxcbiAgUERGUHJvZ3Jlc3NEYXRhLFxuICBQREZEb2N1bWVudFByb3h5LFxuICBQREZEb2N1bWVudExvYWRpbmdUYXNrLFxuICBQREZWaWV3ZXJPcHRpb25zLFxuICBab29tU2NhbGUsXG59IGZyb20gJy4vdHlwaW5ncyc7XG5pbXBvcnQgeyBHbG9iYWxXb3JrZXJPcHRpb25zLCBWZXJib3NpdHlMZXZlbCwgZ2V0RG9jdW1lbnQgfSBmcm9tICdwZGZqcy1kaXN0JztcbmltcG9ydCB7IFpvb21TZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy96b29tLnNlcnZpY2UnO1xuaW1wb3J0IHsgRG9jdW1lbnRJbml0UGFyYW1ldGVycyB9IGZyb20gJ3BkZmpzLWRpc3QvdHlwZXMvc3JjL2Rpc3BsYXkvYXBpJztcbmltcG9ydCB7IFBhblNlcnZpY2UgfSBmcm9tICcuL3NlcnZpY2VzL3Bhbi5zZXJ2aWNlJztcblxuaWYgKCFpc1NTUigpKSB7XG4gIGFzc2lnbihQREZKUywgJ3ZlcmJvc2l0eScsIFZlcmJvc2l0eUxldmVsLklORk9TKTtcbn1cblxuLy8gQHRzLWV4cGVjdC1lcnJvciBUaGlzIGRvZXMgbm90IGV4aXN0IG91dHNpZGUgb2YgcG9seWZpbGwgd2hpY2ggdGhpcyBpcyBkb2luZ1xuaWYgKHR5cGVvZiBQcm9taXNlLndpdGhSZXNvbHZlcnMgPT09ICd1bmRlZmluZWQnICYmIHdpbmRvdykge1xuICAvLyBAdHMtZXhwZWN0LWVycm9yIFRoaXMgZG9lcyBub3QgZXhpc3Qgb3V0c2lkZSBvZiBwb2x5ZmlsbCB3aGljaCB0aGlzIGlzIGRvaW5nXG4gIHdpbmRvdy5Qcm9taXNlLndpdGhSZXNvbHZlcnMgPSAoKSA9PiB7XG4gICAgbGV0IHJlc29sdmU7XG4gICAgbGV0IHJlamVjdDtcbiAgICBjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlcywgcmVqKSA9PiB7XG4gICAgICByZXNvbHZlID0gcmVzO1xuICAgICAgcmVqZWN0ID0gcmVqO1xuICAgIH0pO1xuICAgIHJldHVybiB7IHByb21pc2UsIHJlc29sdmUsIHJlamVjdCB9O1xuICB9O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZW5kZXJUZXh0TW9kZSB7XG4gIERJU0FCTEVELFxuICBFTkFCTEVELFxuICBFTkhBTkNFRCxcbn1cblxuQENvbXBvbmVudCh7XG4gIHNlbGVjdG9yOiAncGRmLXZpZXdlcicsXG4gIHRlbXBsYXRlOiBgXG4gICAgPGRpdlxuICAgICAgI3BkZlZpZXdlckNvbnRhaW5lclxuICAgICAgY2xhc3M9XCJuZzItcGRmLXZpZXdlci1jb250YWluZXJcIlxuICAgICAgKG1vdXNlZG93bik9XCJwYW5TZXJ2aWNlLnN0YXJ0UGFuKCRldmVudCwgcGRmVmlld2VyQ29udGFpbmVyKVwiXG4gICAgICAobW91c2V1cCk9XCJwYW5TZXJ2aWNlLmVuZFBhbihwZGZWaWV3ZXJDb250YWluZXIpXCJcbiAgICAgIChtb3VzZWxlYXZlKT1cInBhblNlcnZpY2UuZW5kUGFuKHBkZlZpZXdlckNvbnRhaW5lcilcIlxuICAgICAgKG1vdXNlbW92ZSk9XCJwYW5TZXJ2aWNlLnBhbigkZXZlbnQsIHBkZlZpZXdlckNvbnRhaW5lcilcIlxuICAgID5cbiAgICAgIDxkaXYgY2xhc3M9XCJwZGZWaWV3ZXJcIj48L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYCxcbiAgc3R5bGVVcmxzOiBbJy4vcGRmLXZpZXdlci5jb21wb25lbnQuc2NzcyddLFxufSlcbmV4cG9ydCBjbGFzcyBQZGZWaWV3ZXJDb21wb25lbnRcbiAgaW1wbGVtZW50cyBPbkNoYW5nZXMsIE9uSW5pdCwgT25EZXN0cm95LCBBZnRlclZpZXdDaGVja2VkLCBBZnRlclZpZXdJbml0XG57XG4gIHN0YXRpYyBDU1NfVU5JVFMgPSA5Ni4wIC8gNzIuMDtcbiAgc3RhdGljIEJPUkRFUl9XSURUSCA9IDk7XG5cbiAgQFZpZXdDaGlsZCgncGRmVmlld2VyQ29udGFpbmVyJylcbiAgcGRmVmlld2VyQ29udGFpbmVyITogRWxlbWVudFJlZjxIVE1MRGl2RWxlbWVudD47XG5cbiAgZXZlbnRCdXMhOiBQREZKU1ZpZXdlci5FdmVudEJ1cztcbiAgcGRmTGlua1NlcnZpY2UhOiBQREZKU1ZpZXdlci5QREZMaW5rU2VydmljZTtcbiAgcGRmRmluZENvbnRyb2xsZXIhOiBQREZKU1ZpZXdlci5QREZGaW5kQ29udHJvbGxlcjtcbiAgcGRmVmlld2VyITogUERGSlNWaWV3ZXIuUERGVmlld2VyIHwgUERGSlNWaWV3ZXIuUERGU2luZ2xlUGFnZVZpZXdlcjtcblxuICBwcml2YXRlIGlzVmlzaWJsZSA9IGZhbHNlO1xuXG4gIHByaXZhdGUgX2NNYXBzVXJsID1cbiAgICB0eXBlb2YgUERGSlMgIT09ICd1bmRlZmluZWQnXG4gICAgICA/IGBodHRwczovL3VucGtnLmNvbS9wZGZqcy1kaXN0QCR7KFBERkpTIGFzIGFueSkudmVyc2lvbn0vY21hcHMvYFxuICAgICAgOiBudWxsO1xuICBwcml2YXRlIF9pbWFnZVJlc291cmNlc1BhdGggPVxuICAgIHR5cGVvZiBQREZKUyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgID8gYGh0dHBzOi8vdW5wa2cuY29tL3BkZmpzLWRpc3RAJHsoUERGSlMgYXMgYW55KS52ZXJzaW9ufS93ZWIvaW1hZ2VzL2BcbiAgICAgIDogdW5kZWZpbmVkO1xuICBwcml2YXRlIF9yZW5kZXJUZXh0ID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfcmVuZGVyVGV4dE1vZGU6IFJlbmRlclRleHRNb2RlID0gUmVuZGVyVGV4dE1vZGUuRU5BQkxFRDtcbiAgcHJpdmF0ZSBfc3RpY2tUb1BhZ2UgPSBmYWxzZTtcbiAgcHJpdmF0ZSBfb3JpZ2luYWxTaXplID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfcGRmOiBQREZEb2N1bWVudFByb3h5IHwgdW5kZWZpbmVkO1xuICBwcml2YXRlIF9wYWdlID0gMTtcblxuICBwcml2YXRlIF96b29tU2NhbGU6IFpvb21TY2FsZSA9ICdwYWdlLXdpZHRoJztcbiAgcHJpdmF0ZSBfcm90YXRpb24gPSAwO1xuICBwcml2YXRlIF9zaG93QWxsID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfY2FuQXV0b1Jlc2l6ZSA9IHRydWU7XG4gIHByaXZhdGUgX2ZpdFRvUGFnZSA9IGZhbHNlO1xuICBwcml2YXRlIF9leHRlcm5hbExpbmtUYXJnZXQgPSAnYmxhbmsnO1xuICBwcml2YXRlIF9zaG93Qm9yZGVycyA9IGZhbHNlO1xuICBwcml2YXRlIGxhc3RMb2FkZWQhOiBzdHJpbmcgfCBVaW50OEFycmF5IHwgUERGU291cmNlIHwgbnVsbDtcbiAgcHJpdmF0ZSBfbGF0ZXN0U2Nyb2xsZWRQYWdlITogbnVtYmVyO1xuXG4gIHByaXZhdGUgcGFnZVNjcm9sbFRpbWVvdXQ6IG51bWJlciB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGlzSW5pdGlhbGl6ZWQgPSBmYWxzZTtcbiAgcHJpdmF0ZSBsb2FkaW5nVGFzaz86IFBERkRvY3VtZW50TG9hZGluZ1Rhc2sgfCBudWxsO1xuICBwcml2YXRlIGRlc3Ryb3kkID0gbmV3IFN1YmplY3Q8dm9pZD4oKTtcblxuICBAT3V0cHV0KCdhZnRlci1sb2FkLWNvbXBsZXRlJykgYWZ0ZXJMb2FkQ29tcGxldGUgPVxuICAgIG5ldyBFdmVudEVtaXR0ZXI8UERGRG9jdW1lbnRQcm94eT4oKTtcbiAgQE91dHB1dCgncGFnZS1yZW5kZXJlZCcpIHBhZ2VSZW5kZXJlZCA9IG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ3BhZ2VzLWluaXRpYWxpemVkJykgcGFnZUluaXRpYWxpemVkID1cbiAgICBuZXcgRXZlbnRFbWl0dGVyPEN1c3RvbUV2ZW50PigpO1xuICBAT3V0cHV0KCd0ZXh0LWxheWVyLXJlbmRlcmVkJykgdGV4dExheWVyUmVuZGVyZWQgPVxuICAgIG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ2Vycm9yJykgb25FcnJvciA9IG5ldyBFdmVudEVtaXR0ZXI8YW55PigpO1xuICBAT3V0cHV0KCdvbi1wcm9ncmVzcycpIG9uUHJvZ3Jlc3MgPSBuZXcgRXZlbnRFbWl0dGVyPFBERlByb2dyZXNzRGF0YT4oKTtcbiAgQE91dHB1dCgpIHBhZ2VDaGFuZ2U6IEV2ZW50RW1pdHRlcjxudW1iZXI+ID0gbmV3IEV2ZW50RW1pdHRlcjxudW1iZXI+KHRydWUpO1xuICBASW5wdXQoKSBzcmM/OiBzdHJpbmcgfCBVaW50OEFycmF5IHwgUERGU291cmNlO1xuXG4gIEBJbnB1dCgnYy1tYXBzLXVybCcpXG4gIHNldCBjTWFwc1VybChjTWFwc1VybDogc3RyaW5nKSB7XG4gICAgdGhpcy5fY01hcHNVcmwgPSBjTWFwc1VybDtcbiAgfVxuXG4gIEBJbnB1dCgncGFnZScpXG4gIHNldCBwYWdlKF9wYWdlOiBudW1iZXIgfCBzdHJpbmcgfCBhbnkpIHtcbiAgICBfcGFnZSA9IHBhcnNlSW50KF9wYWdlLCAxMCkgfHwgMTtcbiAgICBjb25zdCBvcmlnaW5hbFBhZ2UgPSBfcGFnZTtcblxuICAgIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIF9wYWdlID0gdGhpcy5nZXRWYWxpZFBhZ2VOdW1iZXIoX3BhZ2UpO1xuICAgIH1cblxuICAgIHRoaXMuX3BhZ2UgPSBfcGFnZTtcbiAgICBpZiAob3JpZ2luYWxQYWdlICE9PSBfcGFnZSkge1xuICAgICAgdGhpcy5wYWdlQ2hhbmdlLmVtaXQoX3BhZ2UpO1xuICAgIH1cbiAgfVxuXG4gIEBJbnB1dCgncmVuZGVyLXRleHQnKVxuICBzZXQgcmVuZGVyVGV4dChyZW5kZXJUZXh0OiBib29sZWFuKSB7XG4gICAgdGhpcy5fcmVuZGVyVGV4dCA9IHJlbmRlclRleHQ7XG4gIH1cblxuICBASW5wdXQoJ3JlbmRlci10ZXh0LW1vZGUnKVxuICBzZXQgcmVuZGVyVGV4dE1vZGUocmVuZGVyVGV4dE1vZGU6IFJlbmRlclRleHRNb2RlKSB7XG4gICAgdGhpcy5fcmVuZGVyVGV4dE1vZGUgPSByZW5kZXJUZXh0TW9kZTtcbiAgfVxuXG4gIEBJbnB1dCgnb3JpZ2luYWwtc2l6ZScpXG4gIHNldCBvcmlnaW5hbFNpemUob3JpZ2luYWxTaXplOiBib29sZWFuKSB7XG4gICAgdGhpcy5fb3JpZ2luYWxTaXplID0gb3JpZ2luYWxTaXplO1xuICB9XG5cbiAgQElucHV0KCdzaG93LWFsbCcpXG4gIHNldCBzaG93QWxsKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc2hvd0FsbCA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KCdzdGljay10by1wYWdlJylcbiAgc2V0IHN0aWNrVG9QYWdlKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc3RpY2tUb1BhZ2UgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgpXG4gIHNldCB6b29tKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAodmFsdWUgPD0gMCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuem9vbVNlcnZpY2Uuem9vbSA9IHZhbHVlO1xuICAgIHRoaXMuem9vbVNlcnZpY2UubGltaXRab29tKCk7XG4gIH1cbiAgZ2V0IHpvb20oKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy56b29tU2VydmljZS56b29tO1xuICB9XG4gIEBPdXRwdXQoKSB6b29tQ2hhbmdlID0gbmV3IEV2ZW50RW1pdHRlcjxudW1iZXI+KCk7XG5cbiAgQElucHV0KCd6b29tLXNjYWxlJylcbiAgc2V0IHpvb21TY2FsZSh2YWx1ZTogWm9vbVNjYWxlKSB7XG4gICAgdGhpcy5fem9vbVNjYWxlID0gdmFsdWU7XG4gIH1cbiAgZ2V0IHpvb21TY2FsZSgpOiBab29tU2NhbGUge1xuICAgIHJldHVybiB0aGlzLl96b29tU2NhbGU7XG4gIH1cblxuICBASW5wdXQoJ3JvdGF0aW9uJylcbiAgc2V0IHJvdGF0aW9uKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIHZhbHVlICUgOTAgPT09IDApKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ0ludmFsaWQgcGFnZXMgcm90YXRpb24gYW5nbGUuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcm90YXRpb24gPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnZXh0ZXJuYWwtbGluay10YXJnZXQnKVxuICBzZXQgZXh0ZXJuYWxMaW5rVGFyZ2V0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9leHRlcm5hbExpbmtUYXJnZXQgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnYXV0b3Jlc2l6ZScpXG4gIHNldCBhdXRvcmVzaXplKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fY2FuQXV0b1Jlc2l6ZSA9IEJvb2xlYW4odmFsdWUpO1xuICB9XG5cbiAgQElucHV0KCdmaXQtdG8tcGFnZScpXG4gIHNldCBmaXRUb1BhZ2UodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9maXRUb1BhZ2UgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgnc2hvdy1ib3JkZXJzJylcbiAgc2V0IHNob3dCb3JkZXJzKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc2hvd0JvcmRlcnMgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgpIGlzV2hlZWxab29tID0gdHJ1ZTtcbiAgQElucHV0KCkgaXNXaGVlbEN0cmxab29tID0gdHJ1ZTtcbiAgQElucHV0KCkgaXNPcHRpbWl6ZVpvb20gPSB0cnVlO1xuICBASW5wdXQoJ21pblpvb20nKSBzZXQgbWluWm9vbSh2YWx1ZTogbnVtYmVyKSB7XG4gICAgdGhpcy56b29tU2VydmljZS5taW5ab29tID0gdmFsdWU7XG4gICAgdGhpcy56b29tU2VydmljZS5saW1pdFpvb20oKTtcbiAgfVxuICBASW5wdXQoJ21heFpvb20nKSBzZXQgbWF4Wm9vbSh2YWx1ZTogbnVtYmVyKSB7XG4gICAgdGhpcy56b29tU2VydmljZS5tYXhab29tID0gdmFsdWU7XG4gICAgdGhpcy56b29tU2VydmljZS5saW1pdFpvb20oKTtcbiAgfVxuICBASW5wdXQoJ2VuYWJsZVBhbicpIHNldCBlbmFibGVQYW4oZW5hYmxlUGFuOiBib29sZWFuKSB7XG4gICAgdGhpcy5wYW5TZXJ2aWNlLmVuYWJsZVBhbiA9IGVuYWJsZVBhbjtcblxuICAgIGNvbnN0IGN1cnNvciA9IGVuYWJsZVBhbiA/ICdncmFiJyA6ICdkZWZhdWx0JztcbiAgICBpZiAodGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQpIHtcbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyLm5hdGl2ZUVsZW1lbnQuc3R5bGUuY3Vyc29yID0gY3Vyc29yO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyBnZXRMaW5rVGFyZ2V0KHR5cGU6IHN0cmluZykge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnYmxhbmsnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5CTEFOSztcbiAgICAgIGNhc2UgJ25vbmUnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5OT05FO1xuICAgICAgY2FzZSAnc2VsZic6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LlNFTEY7XG4gICAgICBjYXNlICdwYXJlbnQnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5QQVJFTlQ7XG4gICAgICBjYXNlICd0b3AnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5UT1A7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQgPSBpbmplY3QoRWxlbWVudFJlZjxIVE1MRWxlbWVudD4pO1xuICBwcml2YXRlIHJlYWRvbmx5IG5nWm9uZSA9IGluamVjdChOZ1pvbmUpO1xuICBwcml2YXRlIHJlYWRvbmx5IHpvb21TZXJ2aWNlID0gaW5qZWN0KFpvb21TZXJ2aWNlKTtcbiAgcHJvdGVjdGVkIHJlYWRvbmx5IHBhblNlcnZpY2UgPSBpbmplY3QoUGFuU2VydmljZSk7XG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgaWYgKGlzU1NSKCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgcGRmV29ya2VyU3JjOiBzdHJpbmc7XG5cbiAgICBjb25zdCBwZGZKc1ZlcnNpb246IHN0cmluZyA9IChQREZKUyBhcyBhbnkpLnZlcnNpb247XG4gICAgY29uc3QgdmVyc2lvblNwZWNpZmljUGRmV29ya2VyVXJsOiBzdHJpbmcgPSAod2luZG93IGFzIGFueSlbXG4gICAgICBgcGRmV29ya2VyU3JjJHtwZGZKc1ZlcnNpb259YFxuICAgIF07XG5cbiAgICBpZiAodmVyc2lvblNwZWNpZmljUGRmV29ya2VyVXJsKSB7XG4gICAgICBwZGZXb3JrZXJTcmMgPSB2ZXJzaW9uU3BlY2lmaWNQZGZXb3JrZXJVcmw7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHdpbmRvdy5oYXNPd25Qcm9wZXJ0eSgncGRmV29ya2VyU3JjJykgJiZcbiAgICAgIHR5cGVvZiAod2luZG93IGFzIGFueSkucGRmV29ya2VyU3JjID09PSAnc3RyaW5nJyAmJlxuICAgICAgKHdpbmRvdyBhcyBhbnkpLnBkZldvcmtlclNyY1xuICAgICkge1xuICAgICAgcGRmV29ya2VyU3JjID0gKHdpbmRvdyBhcyBhbnkpLnBkZldvcmtlclNyYztcbiAgICB9IGVsc2Uge1xuICAgICAgcGRmV29ya2VyU3JjID0gYGh0dHBzOi8vY2RuLmpzZGVsaXZyLm5ldC9ucG0vcGRmanMtZGlzdEAke3BkZkpzVmVyc2lvbn0vbGVnYWN5L2J1aWxkL3BkZi53b3JrZXIubWluLm1qc2A7XG4gICAgfVxuXG4gICAgYXNzaWduKEdsb2JhbFdvcmtlck9wdGlvbnMsICd3b3JrZXJTcmMnLCBwZGZXb3JrZXJTcmMpO1xuICB9XG5cbiAgbmdBZnRlclZpZXdDaGVja2VkKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmlzSW5pdGlhbGl6ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBvZmZzZXQgPSB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudC5vZmZzZXRQYXJlbnQ7XG5cbiAgICBpZiAodGhpcy5pc1Zpc2libGUgPT09IHRydWUgJiYgb2Zmc2V0ID09IG51bGwpIHtcbiAgICAgIHRoaXMuaXNWaXNpYmxlID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNWaXNpYmxlID09PSBmYWxzZSAmJiBvZmZzZXQgIT0gbnVsbCkge1xuICAgICAgdGhpcy5pc1Zpc2libGUgPSB0cnVlO1xuXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplKCk7XG4gICAgICAgIHRoaXMubmdPbkNoYW5nZXMoeyBzcmM6IHRoaXMuc3JjIH0gYXMgYW55KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIG5nQWZ0ZXJWaWV3SW5pdCgpOiB2b2lkIHtcbiAgICB0aGlzLnpvb21TZXJ2aWNlLmluaXRTZXR0aW5ncyhcbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LFxuICAgICAgdGhpcy5pc1doZWVsWm9vbSxcbiAgICAgIHRoaXMuaXNXaGVlbEN0cmxab29tXG4gICAgKTtcbiAgfVxuXG4gIG5nT25Jbml0KCk6IHZvaWQge1xuICAgIHRoaXMuaW5pdGlhbGl6ZSgpO1xuICAgIHRoaXMuc2V0dXBSZXNpemVMaXN0ZW5lcigpO1xuICB9XG5cbiAgbmdPbkRlc3Ryb3koKTogdm9pZCB7XG4gICAgdGhpcy5jbGVhcigpO1xuICAgIHRoaXMuZGVzdHJveSQubmV4dCgpO1xuICAgIHRoaXMubG9hZGluZ1Rhc2sgPSBudWxsO1xuICAgIHRoaXMuem9vbVNlcnZpY2UucmVtb3ZlTGlzdGVuZXJzKHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50KTtcbiAgfVxuXG4gIG5nT25DaGFuZ2VzKGNoYW5nZXM6IFNpbXBsZUNoYW5nZXMpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoJ3NyYycgaW4gY2hhbmdlcykge1xuICAgICAgdGhpcy5sb2FkUERGKCk7XG4gICAgfSBlbHNlIGlmICh0aGlzLl9wZGYpIHtcbiAgICAgIGlmICgncmVuZGVyVGV4dCcgaW4gY2hhbmdlcyB8fCAnc2hvd0FsbCcgaW4gY2hhbmdlcykge1xuICAgICAgICB0aGlzLnNldHVwVmlld2VyKCk7XG4gICAgICAgIHRoaXMucmVzZXRQZGZEb2N1bWVudCgpO1xuICAgICAgfVxuICAgICAgaWYgKCdwYWdlJyBpbiBjaGFuZ2VzKSB7XG4gICAgICAgIGNvbnN0IHsgcGFnZSB9ID0gY2hhbmdlcztcbiAgICAgICAgaWYgKHBhZ2UuY3VycmVudFZhbHVlID09PSB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBOZXcgZm9ybSBvZiBwYWdlIGNoYW5naW5nOiBUaGUgdmlld2VyIHdpbGwgbm93IGp1bXAgdG8gdGhlIHNwZWNpZmllZCBwYWdlIHdoZW4gaXQgaXMgY2hhbmdlZC5cbiAgICAgICAgLy8gVGhpcyBiZWhhdmlvciBpcyBpbnRyb2R1Y2VkIGJ5IHVzaW5nIHRoZSBQREZTaW5nbGVQYWdlVmlld2VyXG4gICAgICAgIHRoaXMucGRmVmlld2VyLnNjcm9sbFBhZ2VJbnRvVmlldyh7IHBhZ2VOdW1iZXI6IHRoaXMuX3BhZ2UgfSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlU2l6ZSgpOiB2b2lkIHtcbiAgICBjb21iaW5lTGF0ZXN0KFtcbiAgICAgIGZyb20odGhpcy5fcGRmIS5nZXRQYWdlKHRoaXMucGRmVmlld2VyLmN1cnJlbnRQYWdlTnVtYmVyKSksXG4gICAgICB0aGlzLnpvb21TZXJ2aWNlLnRyaWdnZXJVcGRhdGVTaXplLFxuICAgIF0pXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKHtcbiAgICAgICAgbmV4dDogKFtwYWdlXTogW1BERlBhZ2VQcm94eSwgdm9pZF0pID0+IHtcbiAgICAgICAgICBpZiAodGhpcy5pc09wdGltaXplWm9vbSB8fCB0aGlzLmlzV2hlZWxab29tKSB7XG4gICAgICAgICAgICB0aGlzLnpvb21TZXJ2aWNlLnNhdmVTY3JvbGxQb3NpdGlvbihcbiAgICAgICAgICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgcm90YXRpb24gPSB0aGlzLl9yb3RhdGlvbiArIHBhZ2Uucm90YXRlO1xuICAgICAgICAgIGNvbnN0IHZpZXdwb3J0V2lkdGggPVxuICAgICAgICAgICAgcGFnZS5nZXRWaWV3cG9ydCh7XG4gICAgICAgICAgICAgIHNjYWxlOiB0aGlzLnpvb21TZXJ2aWNlLnpvb20sXG4gICAgICAgICAgICAgIHJvdGF0aW9uLFxuICAgICAgICAgICAgfSkud2lkdGggKiBQZGZWaWV3ZXJDb21wb25lbnQuQ1NTX1VOSVRTO1xuICAgICAgICAgIGxldCBzY2FsZSA9IHRoaXMuem9vbVNlcnZpY2Uuem9vbTtcbiAgICAgICAgICBsZXQgc3RpY2tUb1BhZ2UgPSB0cnVlO1xuXG4gICAgICAgICAgLy8gU2NhbGUgdGhlIGRvY3VtZW50IHdoZW4gaXQgc2hvdWxkbid0IGJlIGluIG9yaWdpbmFsIHNpemUgb3IgZG9lc24ndCBmaXQgaW50byB0aGUgdmlld3BvcnRcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhdGhpcy5fb3JpZ2luYWxTaXplIHx8XG4gICAgICAgICAgICAodGhpcy5fZml0VG9QYWdlICYmXG4gICAgICAgICAgICAgIHZpZXdwb3J0V2lkdGggPlxuICAgICAgICAgICAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudFdpZHRoKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3Qgdmlld1BvcnQgPSBwYWdlLmdldFZpZXdwb3J0KHsgc2NhbGU6IDEsIHJvdGF0aW9uIH0pO1xuICAgICAgICAgICAgc2NhbGUgPSB0aGlzLmdldFNjYWxlKHZpZXdQb3J0LndpZHRoLCB2aWV3UG9ydC5oZWlnaHQpO1xuICAgICAgICAgICAgc3RpY2tUb1BhZ2UgPSAhdGhpcy5fc3RpY2tUb1BhZ2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFNjYWxlID0gc2NhbGU7XG5cbiAgICAgICAgICBpZiAoc3RpY2tUb1BhZ2UpXG4gICAgICAgICAgICB0aGlzLnBkZlZpZXdlci5zY3JvbGxQYWdlSW50b1ZpZXcoe1xuICAgICAgICAgICAgICBwYWdlTnVtYmVyOiBwYWdlLnBhZ2VOdW1iZXIsXG4gICAgICAgICAgICAgIGlnbm9yZURlc3RpbmF0aW9uWm9vbTogdHJ1ZSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKHRoaXMuaXNPcHRpbWl6ZVpvb20gfHwgdGhpcy5pc1doZWVsWm9vbSkge1xuICAgICAgICAgICAgdGhpcy56b29tU2VydmljZS5yZXN0b3JlU2Nyb2xsUG9zaXRpb24oXG4gICAgICAgICAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuem9vbUNoYW5nZS5lbWl0KHRoaXMuem9vbVNlcnZpY2Uuem9vbSk7XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgfVxuXG4gIGNsZWFyKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmxvYWRpbmdUYXNrICYmICF0aGlzLmxvYWRpbmdUYXNrLmRlc3Ryb3llZCkge1xuICAgICAgdGhpcy5sb2FkaW5nVGFzay5kZXN0cm95KCk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3BkZikge1xuICAgICAgdGhpcy5fbGF0ZXN0U2Nyb2xsZWRQYWdlID0gMDtcbiAgICAgIHRoaXMuX3BkZi5kZXN0cm95KCk7XG4gICAgICB0aGlzLl9wZGYgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgdGhpcy5wZGZWaWV3ZXIgJiYgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgJiYgdGhpcy5wZGZMaW5rU2VydmljZS5zZXREb2N1bWVudChudWxsLCBudWxsKTtcbiAgICB0aGlzLnBkZkZpbmRDb250cm9sbGVyICYmIHRoaXMucGRmRmluZENvbnRyb2xsZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRQREZMaW5rU2VydmljZUNvbmZpZygpOiB7fSB7XG4gICAgY29uc3QgbGlua1RhcmdldCA9IFBkZlZpZXdlckNvbXBvbmVudC5nZXRMaW5rVGFyZ2V0KFxuICAgICAgdGhpcy5fZXh0ZXJuYWxMaW5rVGFyZ2V0XG4gICAgKTtcblxuICAgIGlmIChsaW5rVGFyZ2V0KSB7XG4gICAgICByZXR1cm4geyBleHRlcm5hbExpbmtUYXJnZXQ6IGxpbmtUYXJnZXQgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge307XG4gIH1cblxuICBwcml2YXRlIGluaXRFdmVudEJ1cygpOiB2b2lkIHtcbiAgICB0aGlzLmV2ZW50QnVzID0gY3JlYXRlRXZlbnRCdXMoUERGSlNWaWV3ZXIsIHRoaXMuZGVzdHJveSQpO1xuXG4gICAgZnJvbUV2ZW50PEN1c3RvbUV2ZW50Pih0aGlzLmV2ZW50QnVzLCAncGFnZXJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMucGFnZVJlbmRlcmVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQ8Q3VzdG9tRXZlbnQ+KHRoaXMuZXZlbnRCdXMsICdwYWdlc2luaXQnKVxuICAgICAgLnBpcGUodGFrZVVudGlsKHRoaXMuZGVzdHJveSQpKVxuICAgICAgLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5wYWdlSW5pdGlhbGl6ZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudCh0aGlzLmV2ZW50QnVzLCAncGFnZWNoYW5naW5nJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKHsgcGFnZU51bWJlciB9OiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5wYWdlU2Nyb2xsVGltZW91dCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0ID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHRoaXMuX2xhdGVzdFNjcm9sbGVkUGFnZSA9IHBhZ2VOdW1iZXI7XG4gICAgICAgICAgdGhpcy5wYWdlQ2hhbmdlLmVtaXQocGFnZU51bWJlcik7XG4gICAgICAgIH0sIDEwMCk7XG4gICAgICB9KTtcblxuICAgIGZyb21FdmVudDxDdXN0b21FdmVudD4odGhpcy5ldmVudEJ1cywgJ3RleHRsYXllcnJlbmRlcmVkJylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMudGV4dExheWVyUmVuZGVyZWQuZW1pdChldmVudCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdFBERlNlcnZpY2VzKCk6IHZvaWQge1xuICAgIHRoaXMucGRmTGlua1NlcnZpY2UgPSBuZXcgUERGSlNWaWV3ZXIuUERGTGlua1NlcnZpY2Uoe1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICAuLi50aGlzLmdldFBERkxpbmtTZXJ2aWNlQ29uZmlnKCksXG4gICAgfSk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlciA9IG5ldyBQREZKU1ZpZXdlci5QREZGaW5kQ29udHJvbGxlcih7XG4gICAgICBldmVudEJ1czogdGhpcy5ldmVudEJ1cyxcbiAgICAgIGxpbmtTZXJ2aWNlOiB0aGlzLnBkZkxpbmtTZXJ2aWNlLFxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRQREZPcHRpb25zKCk6IFBERlZpZXdlck9wdGlvbnMge1xuICAgIHJldHVybiB7XG4gICAgICBldmVudEJ1czogdGhpcy5ldmVudEJ1cyxcbiAgICAgIGNvbnRhaW5lcjogdGhpcy5lbGVtZW50Lm5hdGl2ZUVsZW1lbnQucXVlcnlTZWxlY3RvcignZGl2JykhLFxuICAgICAgcmVtb3ZlUGFnZUJvcmRlcnM6ICF0aGlzLl9zaG93Qm9yZGVycyxcbiAgICAgIGxpbmtTZXJ2aWNlOiB0aGlzLnBkZkxpbmtTZXJ2aWNlLFxuICAgICAgdGV4dExheWVyTW9kZTogdGhpcy5fcmVuZGVyVGV4dFxuICAgICAgICA/IHRoaXMuX3JlbmRlclRleHRNb2RlXG4gICAgICAgIDogUmVuZGVyVGV4dE1vZGUuRElTQUJMRUQsXG4gICAgICBmaW5kQ29udHJvbGxlcjogdGhpcy5wZGZGaW5kQ29udHJvbGxlcixcbiAgICAgIGwxMG46IG5ldyBQREZKU1ZpZXdlci5HZW5lcmljTDEwbignZW4nKSxcbiAgICAgIGltYWdlUmVzb3VyY2VzUGF0aDogdGhpcy5faW1hZ2VSZXNvdXJjZXNQYXRoLFxuICAgICAgYW5ub3RhdGlvbkVkaXRvck1vZGU6IFBERkpTLkFubm90YXRpb25FZGl0b3JUeXBlLkRJU0FCTEUsXG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBWaWV3ZXIoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMucGRmVmlld2VyKSB7XG4gICAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudChudWxsIGFzIGFueSk7XG4gICAgfVxuXG4gICAgYXNzaWduKFBERkpTLCAnZGlzYWJsZVRleHRMYXllcicsICF0aGlzLl9yZW5kZXJUZXh0KTtcblxuICAgIHRoaXMuaW5pdFBERlNlcnZpY2VzKCk7XG5cbiAgICBpZiAodGhpcy5fc2hvd0FsbCkge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGVmlld2VyKHRoaXMuZ2V0UERGT3B0aW9ucygpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGU2luZ2xlUGFnZVZpZXdlcihcbiAgICAgICAgdGhpcy5nZXRQREZPcHRpb25zKClcbiAgICAgICk7XG4gICAgfVxuICAgIHRoaXMucGRmTGlua1NlcnZpY2Uuc2V0Vmlld2VyKHRoaXMucGRmVmlld2VyKTtcblxuICAgIHRoaXMucGRmVmlld2VyLl9jdXJyZW50UGFnZU51bWJlciA9IHRoaXMuX3BhZ2U7XG4gIH1cblxuICBwcml2YXRlIGdldFZhbGlkUGFnZU51bWJlcihwYWdlOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChwYWdlIDwgMSkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgaWYgKHBhZ2UgPiB0aGlzLl9wZGYhLm51bVBhZ2VzKSB7XG4gICAgICByZXR1cm4gdGhpcy5fcGRmIS5udW1QYWdlcztcbiAgICB9XG5cbiAgICByZXR1cm4gcGFnZTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0RG9jdW1lbnRQYXJhbXMoKTpcbiAgICB8IHN0cmluZ1xuICAgIHwgVWludDhBcnJheVxuICAgIHwgRG9jdW1lbnRJbml0UGFyYW1ldGVyc1xuICAgIHwgdW5kZWZpbmVkIHtcbiAgICBjb25zdCBzcmNUeXBlID0gdHlwZW9mIHRoaXMuc3JjO1xuXG4gICAgaWYgKCF0aGlzLl9jTWFwc1VybCkge1xuICAgICAgcmV0dXJuIHRoaXMuc3JjO1xuICAgIH1cblxuICAgIGNvbnN0IHBhcmFtczogYW55ID0ge1xuICAgICAgY01hcFVybDogdGhpcy5fY01hcHNVcmwsXG4gICAgICBjTWFwUGFja2VkOiB0cnVlLFxuICAgICAgZW5hYmxlWGZhOiB0cnVlLFxuICAgIH07XG4gICAgcGFyYW1zLmlzRXZhbFN1cHBvcnRlZCA9IGZhbHNlOyAvLyBodHRwOi8vY3ZlLm9yZy9DVkVSZWNvcmQ/aWQ9Q1ZFLTIwMjQtNDM2N1xuXG4gICAgaWYgKHNyY1R5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXJhbXMudXJsID0gdGhpcy5zcmM7XG4gICAgfSBlbHNlIGlmIChzcmNUeXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgaWYgKCh0aGlzLnNyYyBhcyBhbnkpLmJ5dGVMZW5ndGggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBwYXJhbXMuZGF0YSA9IHRoaXMuc3JjO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmFzc2lnbihwYXJhbXMsIHRoaXMuc3JjKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gcGFyYW1zO1xuICB9XG5cbiAgcHJpdmF0ZSBsb2FkUERGKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5zcmMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5sYXN0TG9hZGVkID09PSB0aGlzLnNyYykge1xuICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmNsZWFyKCk7XG5cbiAgICB0aGlzLnNldHVwVmlld2VyKCk7XG5cbiAgICB0aGlzLmxvYWRpbmdUYXNrID0gZ2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudFBhcmFtcygpKTtcblxuICAgIHRoaXMubG9hZGluZ1Rhc2shLm9uUHJvZ3Jlc3MgPSAocHJvZ3Jlc3NEYXRhOiBQREZQcm9ncmVzc0RhdGEpID0+IHtcbiAgICAgIHRoaXMub25Qcm9ncmVzcy5lbWl0KHByb2dyZXNzRGF0YSk7XG4gICAgfTtcblxuICAgIGNvbnN0IHNyYyA9IHRoaXMuc3JjO1xuXG4gICAgZnJvbSh0aGlzLmxvYWRpbmdUYXNrIS5wcm9taXNlIGFzIFByb21pc2U8UERGRG9jdW1lbnRQcm94eT4pXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKHtcbiAgICAgICAgbmV4dDogKHBkZikgPT4ge1xuICAgICAgICAgIHRoaXMuX3BkZiA9IHBkZjtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBzcmM7XG5cbiAgICAgICAgICB0aGlzLmFmdGVyTG9hZENvbXBsZXRlLmVtaXQocGRmKTtcbiAgICAgICAgICB0aGlzLnJlc2V0UGRmRG9jdW1lbnQoKTtcblxuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGVycm9yOiAoZXJyb3IpID0+IHtcbiAgICAgICAgICB0aGlzLmxhc3RMb2FkZWQgPSBudWxsO1xuICAgICAgICAgIHRoaXMub25FcnJvci5lbWl0KGVycm9yKTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG4gICAgdGhpcy5wYWdlID0gdGhpcy5fcGFnZTtcblxuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcbiAgICB0aGlzLl9wYWdlID0gdGhpcy5nZXRWYWxpZFBhZ2VOdW1iZXIodGhpcy5fcGFnZSk7XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLl9yb3RhdGlvbiAhPT0gMCB8fFxuICAgICAgdGhpcy5wZGZWaWV3ZXIucGFnZXNSb3RhdGlvbiAhPT0gdGhpcy5fcm90YXRpb25cbiAgICApIHtcbiAgICAgIC8vIHdhaXQgdW50aWwgYXQgbGVhc3QgdGhlIGZpcnN0IHBhZ2UgaXMgYXZhaWxhYmxlLlxuICAgICAgdGhpcy5wZGZWaWV3ZXIuZmlyc3RQYWdlUHJvbWlzZT8udGhlbihcbiAgICAgICAgKCkgPT4gKHRoaXMucGRmVmlld2VyLnBhZ2VzUm90YXRpb24gPSB0aGlzLl9yb3RhdGlvbilcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3N0aWNrVG9QYWdlKSB7XG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFBhZ2VOdW1iZXIgPSB0aGlzLl9wYWdlO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnBkZlZpZXdlci5fcGFnZXM/Lmxlbmd0aCkge1xuICAgICAgLy8gdGhlIGZpcnN0IHRpbWUgd2Ugd2FpdCB1bnRpbCBwYWdlcyBpbml0XG4gICAgICBjb25zdCBzdWIgPSB0aGlzLnBhZ2VJbml0aWFsaXplZC5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgc3ViLnVuc3Vic2NyaWJlKCk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51cGRhdGVTaXplKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRTY2FsZSh2aWV3cG9ydFdpZHRoOiBudW1iZXIsIHZpZXdwb3J0SGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IGJvcmRlclNpemUgPSB0aGlzLl9zaG93Qm9yZGVyc1xuICAgICAgPyAyICogUGRmVmlld2VyQ29tcG9uZW50LkJPUkRFUl9XSURUSFxuICAgICAgOiAwO1xuICAgIGNvbnN0IHBkZkNvbnRhaW5lcldpZHRoID1cbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudFdpZHRoIC0gYm9yZGVyU2l6ZTtcbiAgICBjb25zdCBwZGZDb250YWluZXJIZWlnaHQgPVxuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQuY2xpZW50SGVpZ2h0IC0gYm9yZGVyU2l6ZTtcblxuICAgIGlmIChcbiAgICAgIHBkZkNvbnRhaW5lckhlaWdodCA9PT0gMCB8fFxuICAgICAgdmlld3BvcnRIZWlnaHQgPT09IDAgfHxcbiAgICAgIHBkZkNvbnRhaW5lcldpZHRoID09PSAwIHx8XG4gICAgICB2aWV3cG9ydFdpZHRoID09PSAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBsZXQgcmF0aW8gPSAxO1xuICAgIHN3aXRjaCAodGhpcy5fem9vbVNjYWxlKSB7XG4gICAgICBjYXNlICdwYWdlLWZpdCc6XG4gICAgICAgIHJhdGlvID0gTWF0aC5taW4oXG4gICAgICAgICAgcGRmQ29udGFpbmVySGVpZ2h0IC8gdmlld3BvcnRIZWlnaHQsXG4gICAgICAgICAgcGRmQ29udGFpbmVyV2lkdGggLyB2aWV3cG9ydFdpZHRoXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncGFnZS1oZWlnaHQnOlxuICAgICAgICByYXRpbyA9IHBkZkNvbnRhaW5lckhlaWdodCAvIHZpZXdwb3J0SGVpZ2h0O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZ2Utd2lkdGgnOlxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmF0aW8gPSBwZGZDb250YWluZXJXaWR0aCAvIHZpZXdwb3J0V2lkdGg7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiAodGhpcy56b29tU2VydmljZS56b29tICogcmF0aW8pIC8gUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRQZGZEb2N1bWVudCgpOiB2b2lkIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldERvY3VtZW50KHRoaXMuX3BkZiwgbnVsbCk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIHRoaXMuaW5pdEV2ZW50QnVzKCk7XG4gICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFJlc2l6ZUxpc3RlbmVyKCk6IHZvaWQge1xuICAgIGlmIChpc1NTUigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5uZ1pvbmUucnVuT3V0c2lkZUFuZ3VsYXIoKCkgPT4ge1xuICAgICAgZnJvbUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpXG4gICAgICAgIC5waXBlKFxuICAgICAgICAgIGRlYm91bmNlVGltZSgxMDApLFxuICAgICAgICAgIGZpbHRlcigoKSA9PiB0aGlzLl9jYW5BdXRvUmVzaXplICYmICEhdGhpcy5fcGRmKSxcbiAgICAgICAgICB0YWtlVW50aWwodGhpcy5kZXN0cm95JClcbiAgICAgICAgKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==