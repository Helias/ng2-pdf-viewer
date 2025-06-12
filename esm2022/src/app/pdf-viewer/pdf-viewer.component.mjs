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
import { ZoomService } from './zoom.service';
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
    }
    get zoom() {
        return this.zoomService.zoom;
    }
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
                        viewportWidth > this.pdfViewerContainer?.nativeElement.clientWidth)) {
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
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "16.1.0", type: PdfViewerComponent, selector: "pdf-viewer", inputs: { src: "src", cMapsUrl: ["c-maps-url", "cMapsUrl"], page: "page", renderText: ["render-text", "renderText"], renderTextMode: ["render-text-mode", "renderTextMode"], originalSize: ["original-size", "originalSize"], showAll: ["show-all", "showAll"], stickToPage: ["stick-to-page", "stickToPage"], zoom: "zoom", zoomScale: ["zoom-scale", "zoomScale"], rotation: "rotation", externalLinkTarget: ["external-link-target", "externalLinkTarget"], autoresize: "autoresize", fitToPage: ["fit-to-page", "fitToPage"], showBorders: ["show-borders", "showBorders"], isWheelZoom: "isWheelZoom", isWheelCtrlZoom: "isWheelCtrlZoom", isOptimizeZoom: "isOptimizeZoom" }, outputs: { afterLoadComplete: "after-load-complete", pageRendered: "page-rendered", pageInitialized: "pages-initialized", textLayerRendered: "text-layer-rendered", onError: "error", onProgress: "on-progress", pageChange: "pageChange" }, viewQueries: [{ propertyName: "pdfViewerContainer", first: true, predicate: ["pdfViewerContainer"], descendants: true }], usesOnChanges: true, ngImport: i0, template: `
    <div #pdfViewerContainer class="ng2-pdf-viewer-container">
      <div class="pdfViewer"></div>
    </div>
  `, isInline: true, styles: [".ng2-pdf-viewer-container{overflow-x:auto;position:absolute;height:100%;width:100%;-webkit-overflow-scrolling:touch}:host{display:block;position:relative}:host ::ng-deep{--pdfViewer-padding-bottom: 0;--page-margin: 1px auto -8px;--page-border: 9px solid transparent;--spreadHorizontalWrapped-margin-LR: -3.5px;--viewer-container-height: 0;--annotation-unfocused-field-background: url(\"data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>\");--xfa-unfocused-field-background: var( --annotation-unfocused-field-background );--page-border-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAATCAYAAAByUDbMAAAA1ElEQVQ4jbWUWw6EIAxFy2NFs/8NzR4UJhpqLsdi5mOmSSMUOfYWqv3S0gMr4XlYH/64gZa/gN3ANYA7KAXALt4ktoQ5MI9YxqaG8bWmsIysMuT6piSQCa4whZThCu8CM4zP9YJaKci9jicPq3NcBWYoPMGUlhG7ivtkB+gVyFY75wXghOvh8t5mto1Mdim6e+MBqH6XsY+YAwjpq3vGF7weTWQptLEDVCZvPTMl5JZZsdh47FHW6qFMyvLYqjcnmdFfY9Xk/KDOlzCusX2mi/ofM7MPkzBcSp4Q1/wAAAAASUVORK5CYII=) 9 9 repeat;--scale-factor: 1;--focus-outline: solid 2px blue;--hover-outline: dashed 2px blue;--freetext-line-height: 1.35;--freetext-padding: 2px;--editorInk-editing-cursor: pointer}@media screen and (forced-colors: active){:host ::ng-deep{--pdfViewer-padding-bottom: 9px;--page-margin: 8px auto -1px;--page-border: 1px solid CanvasText;--page-border-image: none;--spreadHorizontalWrapped-margin-LR: 3.5px}}@media (forced-colors: active){:host ::ng-deep{--focus-outline: solid 3px ButtonText;--hover-outline: dashed 3px ButtonText}}:host ::ng-deep .textLayer{position:absolute;text-align:initial;inset:0;overflow:hidden;opacity:.2;line-height:1;-webkit-text-size-adjust:none;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0}:host ::ng-deep .textLayer span,:host ::ng-deep .textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}:host ::ng-deep .textLayer span.markedContent{top:0;height:0}:host ::ng-deep .textLayer .highlight{margin:-1px;padding:1px;background-color:#b400aa;border-radius:4px}:host ::ng-deep .textLayer .highlight.appended{position:initial}:host ::ng-deep .textLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .textLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .textLayer .highlight.middle{border-radius:0}:host ::ng-deep .textLayer .highlight.selected{background-color:#006400}:host ::ng-deep .textLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .textLayer br::selection{background:transparent}:host ::ng-deep .textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;z-index:-1;cursor:default;-webkit-user-select:none;user-select:none}:host ::ng-deep .textLayer .endOfContent.active{top:0}@media (forced-colors: active){:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid selectedItem}}:host ::ng-deep .annotationLayer{position:absolute;top:0;left:0;pointer-events:none;transform-origin:0 0}:host ::ng-deep .annotationLayer section{position:absolute;text-align:initial;pointer-events:auto;box-sizing:border-box;transform-origin:0 0}:host ::ng-deep .annotationLayer .linkAnnotation>a,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a{position:absolute;font-size:1em;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>canvas{width:100%;height:100%}:host ::ng-deep .annotationLayer .linkAnnotation>a:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.pushButton>a:hover{opacity:.2;background:rgb(255,255,0);box-shadow:0 2px 10px #ff0}:host ::ng-deep .annotationLayer .textAnnotation img{position:absolute;cursor:pointer;width:100%;height:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{background-image:var(--annotation-unfocused-field-background);border:1px solid transparent;box-sizing:border-box;font:calc(9px * var(--scale-factor)) sans-serif;height:100%;margin:0;vertical-align:top;width:100%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:required,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:required,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:required,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:required{outline:1.5px solid red}:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select option{padding:0}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{border-radius:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea{resize:none}:host ::ng-deep .annotationLayer .textWidgetAnnotation input[disabled],:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea[disabled],:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input[disabled],:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input[disabled]{background:none;border:1px solid transparent;cursor:not-allowed}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:hover,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:hover,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:hover,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:hover{border:1px solid rgb(0,0,0)}:host ::ng-deep .annotationLayer .textWidgetAnnotation input:focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea:focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select:focus{background:none;border:1px solid transparent}:host ::ng-deep .annotationLayer .textWidgetAnnotation input :focus,:host ::ng-deep .annotationLayer .textWidgetAnnotation textarea :focus,:host ::ng-deep .annotationLayer .choiceWidgetAnnotation select :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox :focus,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton :focus{background-image:none;background-color:transparent;outline:auto}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{background-color:CanvasText;content:\"\";display:block;position:absolute}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{height:80%;left:45%;width:1px}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:before{transform:rotate(45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input:checked:after{transform:rotate(-45deg)}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input:checked:before{border-radius:50%;height:50%;left:30%;top:20%;width:50%}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb{font-family:monospace;padding-left:2px;padding-right:0}:host ::ng-deep .annotationLayer .textWidgetAnnotation input.comb:focus{width:103%}:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.checkBox input,:host ::ng-deep .annotationLayer .buttonWidgetAnnotation.radioButton input{-webkit-appearance:none;appearance:none}:host ::ng-deep .annotationLayer .popupTriggerArea{height:100%;width:100%}:host ::ng-deep .annotationLayer .popupWrapper{position:absolute;font-size:calc(9px * var(--scale-factor));width:100%;min-width:calc(180px * var(--scale-factor));pointer-events:none}:host ::ng-deep .annotationLayer .popup{position:absolute;max-width:calc(180px * var(--scale-factor));background-color:#ff9;box-shadow:0 calc(2px * var(--scale-factor)) calc(5px * var(--scale-factor)) #888;border-radius:calc(2px * var(--scale-factor));padding:calc(6px * var(--scale-factor));margin-left:calc(5px * var(--scale-factor));cursor:pointer;font:message-box;white-space:normal;word-wrap:break-word;pointer-events:auto}:host ::ng-deep .annotationLayer .popup>*{font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popup h1{display:inline-block}:host ::ng-deep .annotationLayer .popupDate{display:inline-block;margin-left:calc(5px * var(--scale-factor))}:host ::ng-deep .annotationLayer .popupContent{border-top:1px solid rgb(51,51,51);margin-top:calc(2px * var(--scale-factor));padding-top:calc(2px * var(--scale-factor))}:host ::ng-deep .annotationLayer .richText>*{white-space:pre-wrap;font-size:calc(9px * var(--scale-factor))}:host ::ng-deep .annotationLayer .highlightAnnotation,:host ::ng-deep .annotationLayer .underlineAnnotation,:host ::ng-deep .annotationLayer .squigglyAnnotation,:host ::ng-deep .annotationLayer .strikeoutAnnotation,:host ::ng-deep .annotationLayer .freeTextAnnotation,:host ::ng-deep .annotationLayer .lineAnnotation svg line,:host ::ng-deep .annotationLayer .squareAnnotation svg rect,:host ::ng-deep .annotationLayer .circleAnnotation svg ellipse,:host ::ng-deep .annotationLayer .polylineAnnotation svg polyline,:host ::ng-deep .annotationLayer .polygonAnnotation svg polygon,:host ::ng-deep .annotationLayer .caretAnnotation,:host ::ng-deep .annotationLayer .inkAnnotation svg polyline,:host ::ng-deep .annotationLayer .stampAnnotation,:host ::ng-deep .annotationLayer .fileAttachmentAnnotation{cursor:pointer}:host ::ng-deep .annotationLayer section svg{position:absolute;width:100%;height:100%}:host ::ng-deep .annotationLayer .annotationTextContent{position:absolute;width:100%;height:100%;opacity:0;color:transparent;-webkit-user-select:none;user-select:none;pointer-events:none}:host ::ng-deep .annotationLayer .annotationTextContent span{width:100%;display:inline-block}@media (forced-colors: active){:host ::ng-deep .xfaLayer *:required{outline:1.5px solid selectedItem}}:host ::ng-deep .xfaLayer .highlight{margin:-1px;padding:1px;background-color:#efcbed;border-radius:4px}:host ::ng-deep .xfaLayer .highlight.appended{position:initial}:host ::ng-deep .xfaLayer .highlight.begin{border-radius:4px 0 0 4px}:host ::ng-deep .xfaLayer .highlight.end{border-radius:0 4px 4px 0}:host ::ng-deep .xfaLayer .highlight.middle{border-radius:0}:host ::ng-deep .xfaLayer .highlight.selected{background-color:#cbdfcb}:host ::ng-deep .xfaLayer ::selection{background:rgb(0,0,255)}:host ::ng-deep .xfaPage{overflow:hidden;position:relative}:host ::ng-deep .xfaContentarea{position:absolute}:host ::ng-deep .xfaPrintOnly{display:none}:host ::ng-deep .xfaLayer{position:absolute;text-align:initial;top:0;left:0;transform-origin:0 0;line-height:1.2}:host ::ng-deep .xfaLayer *{color:inherit;font:inherit;font-style:inherit;font-weight:inherit;font-kerning:inherit;letter-spacing:-.01px;text-align:inherit;text-decoration:inherit;box-sizing:border-box;background-color:transparent;padding:0;margin:0;pointer-events:auto;line-height:inherit}:host ::ng-deep .xfaLayer *:required{outline:1.5px solid red}:host ::ng-deep .xfaLayer div{pointer-events:none}:host ::ng-deep .xfaLayer svg{pointer-events:none}:host ::ng-deep .xfaLayer svg *{pointer-events:none}:host ::ng-deep .xfaLayer a{color:#00f}:host ::ng-deep .xfaRich li{margin-left:3em}:host ::ng-deep .xfaFont{color:#000;font-weight:400;font-kerning:none;font-size:10px;font-style:normal;letter-spacing:0;text-decoration:none;vertical-align:0}:host ::ng-deep .xfaCaption{overflow:hidden;flex:0 0 auto}:host ::ng-deep .xfaCaptionForCheckButton{overflow:hidden;flex:1 1 auto}:host ::ng-deep .xfaLabel{height:100%;width:100%}:host ::ng-deep .xfaLeft{display:flex;flex-direction:row;align-items:center}:host ::ng-deep .xfaRight{display:flex;flex-direction:row-reverse;align-items:center}:host ::ng-deep .xfaLeft>.xfaCaption,:host ::ng-deep .xfaLeft>.xfaCaptionForCheckButton,:host ::ng-deep .xfaRight>.xfaCaption,:host ::ng-deep .xfaRight>.xfaCaptionForCheckButton{max-height:100%}:host ::ng-deep .xfaTop{display:flex;flex-direction:column;align-items:flex-start}:host ::ng-deep .xfaBottom{display:flex;flex-direction:column-reverse;align-items:flex-start}:host ::ng-deep .xfaTop>.xfaCaption,:host ::ng-deep .xfaTop>.xfaCaptionForCheckButton,:host ::ng-deep .xfaBottom>.xfaCaption,:host ::ng-deep .xfaBottom>.xfaCaptionForCheckButton{width:100%}:host ::ng-deep .xfaBorder{background-color:transparent;position:absolute;pointer-events:none}:host ::ng-deep .xfaWrapped{width:100%;height:100%}:host ::ng-deep .xfaTextfield:focus,:host ::ng-deep .xfaSelect:focus{background-image:none;background-color:transparent;outline:auto;outline-offset:-1px}:host ::ng-deep .xfaCheckbox:focus,:host ::ng-deep .xfaRadio:focus{outline:auto}:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{height:100%;width:100%;flex:1 1 auto;border:none;resize:none;background-image:var(--xfa-unfocused-field-background)}:host ::ng-deep .xfaTop>.xfaTextfield,:host ::ng-deep .xfaTop>.xfaSelect,:host ::ng-deep .xfaBottom>.xfaTextfield,:host ::ng-deep .xfaBottom>.xfaSelect{flex:0 1 auto}:host ::ng-deep .xfaButton{cursor:pointer;width:100%;height:100%;border:none;text-align:center}:host ::ng-deep .xfaLink{width:100%;height:100%;position:absolute;top:0;left:0}:host ::ng-deep .xfaCheckbox,:host ::ng-deep .xfaRadio{width:100%;height:100%;flex:0 0 auto;border:none}:host ::ng-deep .xfaRich{white-space:pre-wrap;width:100%;height:100%}:host ::ng-deep .xfaImage{object-position:left top;object-fit:contain;width:100%;height:100%}:host ::ng-deep .xfaLrTb,:host ::ng-deep .xfaRlTb,:host ::ng-deep .xfaTb{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaLr{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaRl{display:flex;flex-direction:row-reverse;align-items:stretch}:host ::ng-deep .xfaTb>div{justify-content:left}:host ::ng-deep .xfaPosition{position:relative}:host ::ng-deep .xfaArea{position:relative}:host ::ng-deep .xfaValignMiddle{display:flex;align-items:center}:host ::ng-deep .xfaTable{display:flex;flex-direction:column;align-items:stretch}:host ::ng-deep .xfaTable .xfaRow{display:flex;flex-direction:row;align-items:stretch}:host ::ng-deep .xfaTable .xfaRlRow{display:flex;flex-direction:row-reverse;align-items:stretch;flex:1}:host ::ng-deep .xfaTable .xfaRlRow>div{flex:1}:host ::ng-deep .xfaNonInteractive input,:host ::ng-deep .xfaNonInteractive textarea,:host ::ng-deep .xfaDisabled input,:host ::ng-deep .xfaDisabled textarea,:host ::ng-deep .xfaReadOnly input,:host ::ng-deep .xfaReadOnly textarea{background:initial}@media print{:host ::ng-deep .xfaTextfield,:host ::ng-deep .xfaSelect{background:transparent}:host ::ng-deep .xfaSelect{-webkit-appearance:none;appearance:none;text-indent:1px;text-overflow:\"\"}}:host ::ng-deep [data-editor-rotation=\"90\"]{transform:rotate(90deg)}:host ::ng-deep [data-editor-rotation=\"180\"]{transform:rotate(180deg)}:host ::ng-deep [data-editor-rotation=\"270\"]{transform:rotate(270deg)}:host ::ng-deep .annotationEditorLayer{background:transparent;position:absolute;top:0;left:0;font-size:calc(100px * var(--scale-factor));transform-origin:0 0}:host ::ng-deep .annotationEditorLayer .selectedEditor{outline:var(--focus-outline);resize:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor{position:absolute;background:transparent;border-radius:3px;padding:calc(var(--freetext-padding) * var(--scale-factor));resize:none;width:auto;height:auto;z-index:1;transform-origin:0 0;touch-action:none}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal{background:transparent;border:none;top:0;left:0;overflow:visible;white-space:nowrap;resize:none;font:10px sans-serif;line-height:var(--freetext-line-height)}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay{position:absolute;display:none;background:transparent;top:0;left:0;width:100%;height:100%}:host ::ng-deep .annotationEditorLayer .freeTextEditor .overlay.enabled{display:block}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:empty:before{content:attr(default-content);color:gray}:host ::ng-deep .annotationEditorLayer .freeTextEditor .internal:focus{outline:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled{resize:none}:host ::ng-deep .annotationEditorLayer .inkEditor.disabled.selectedEditor{resize:horizontal}:host ::ng-deep .annotationEditorLayer .freeTextEditor:hover:not(.selectedEditor),:host ::ng-deep .annotationEditorLayer .inkEditor:hover:not(.selectedEditor){outline:var(--hover-outline)}:host ::ng-deep .annotationEditorLayer .inkEditor{position:absolute;background:transparent;border-radius:3px;overflow:auto;width:100%;height:100%;z-index:1;transform-origin:0 0;cursor:auto}:host ::ng-deep .annotationEditorLayer .inkEditor.editing{resize:none;cursor:var(--editorInk-editing-cursor),pointer}:host ::ng-deep .annotationEditorLayer .inkEditor .inkEditorCanvas{position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}:host ::ng-deep [data-main-rotation=\"90\"]{transform:rotate(90deg) translateY(-100%)}:host ::ng-deep [data-main-rotation=\"180\"]{transform:rotate(180deg) translate(-100%,-100%)}:host ::ng-deep [data-main-rotation=\"270\"]{transform:rotate(270deg) translate(-100%)}:host ::ng-deep .pdfViewer{padding-bottom:var(--pdfViewer-padding-bottom)}:host ::ng-deep .pdfViewer .canvasWrapper{overflow:hidden}:host ::ng-deep .pdfViewer .canvasWrapper canvas{width:100%}:host ::ng-deep .pdfViewer .page{direction:ltr;width:816px;height:1056px;margin:var(--page-margin);position:relative;overflow:visible;border:var(--page-border);border-image:var(--page-border-image);background-clip:content-box;background-color:#fff}:host ::ng-deep .pdfViewer .dummyPage{position:relative;width:0;height:var(--viewer-container-height)}:host ::ng-deep .pdfViewer.removePageBorders .page{margin:0 auto 10px;border:none}:host ::ng-deep .pdfViewer.singlePageView{display:inline-block}:host ::ng-deep .pdfViewer.singlePageView .page{margin:0;border:none}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .pdfViewer.scrollWrapped,:host ::ng-deep .spread{margin-left:3.5px;margin-right:3.5px;text-align:center}:host ::ng-deep .pdfViewer.scrollHorizontal,:host ::ng-deep .spread{white-space:nowrap}:host ::ng-deep .pdfViewer.removePageBorders,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{margin-left:0;margin-right:0}:host ::ng-deep .spread .page,:host ::ng-deep .spread .dummyPage,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page,:host ::ng-deep .pdfViewer.scrollHorizontal .spread,:host ::ng-deep .pdfViewer.scrollWrapped .spread{display:inline-block;vertical-align:middle}:host ::ng-deep .spread .page,:host ::ng-deep .pdfViewer.scrollHorizontal .page,:host ::ng-deep .pdfViewer.scrollWrapped .page{margin-left:var(--spreadHorizontalWrapped-margin-LR);margin-right:var(--spreadHorizontalWrapped-margin-LR)}:host ::ng-deep .pdfViewer.removePageBorders .spread .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollHorizontal .page,:host ::ng-deep .pdfViewer.removePageBorders.scrollWrapped .page{margin-left:5px;margin-right:5px}:host ::ng-deep .pdfViewer .page canvas{margin:0;display:block}:host ::ng-deep .pdfViewer .page canvas[hidden]{display:none}:host ::ng-deep .pdfViewer .page .loadingIcon{position:absolute;display:block;inset:0;background:url(data:image/gif;base64,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) center no-repeat}:host ::ng-deep .pdfViewer .page .loadingIcon.notVisible{background:none}:host ::ng-deep .pdfViewer.enablePermissions .textLayer span{-webkit-user-select:none!important;user-select:none!important;cursor:not-allowed}:host ::ng-deep .pdfPresentationMode .pdfViewer{padding-bottom:0}:host ::ng-deep .pdfPresentationMode .spread{margin:0}:host ::ng-deep .pdfPresentationMode .pdfViewer .page{margin:0 auto;border:2px solid transparent}\n"] });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PdfViewerComponent, decorators: [{
            type: Component,
            args: [{ selector: 'pdf-viewer', template: `
    <div #pdfViewerContainer class="ng2-pdf-viewer-container">
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
                type: Input,
                args: ['zoom']
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
            }] } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLXZpZXdlci5jb21wb25lbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvcGRmLXZpZXdlci5jb21wb25lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFDSCxPQUFPLEVBQ0wsU0FBUyxFQUNULEtBQUssRUFDTCxNQUFNLEVBQ04sVUFBVSxFQUNWLFlBQVksRUFLWixTQUFTLEVBRVQsTUFBTSxFQUVOLE1BQU0sR0FDUCxNQUFNLGVBQWUsQ0FBQztBQUN2QixPQUFPLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0sTUFBTSxDQUFDO0FBQy9ELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pFLE9BQU8sS0FBSyxLQUFLLE1BQU0sWUFBWSxDQUFDO0FBQ3BDLE9BQU8sS0FBSyxXQUFXLE1BQU0sK0JBQStCLENBQUM7QUFFN0QsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFELE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFXakQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDOUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGdCQUFnQixDQUFDOztBQUU3QyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUU7SUFDWixNQUFNLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7Q0FDbEQ7QUFFRCwrRUFBK0U7QUFDL0UsSUFBSSxPQUFPLE9BQU8sQ0FBQyxhQUFhLEtBQUssV0FBVyxJQUFJLE1BQU0sRUFBRTtJQUMxRCwrRUFBK0U7SUFDL0UsTUFBTSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEdB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Q0csZUFBZTtzQkFBdkIsS0FBSztnQkFDRyxjQUFjO3NCQUF0QixLQUFLIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDcmVhdGVkIGJ5IHZhZGltZGV6IG9uIDIxLzA2LzE2LlxuICovXG5pbXBvcnQge1xuICBDb21wb25lbnQsXG4gIElucHV0LFxuICBPdXRwdXQsXG4gIEVsZW1lbnRSZWYsXG4gIEV2ZW50RW1pdHRlcixcbiAgT25DaGFuZ2VzLFxuICBTaW1wbGVDaGFuZ2VzLFxuICBPbkluaXQsXG4gIE9uRGVzdHJveSxcbiAgVmlld0NoaWxkLFxuICBBZnRlclZpZXdDaGVja2VkLFxuICBOZ1pvbmUsXG4gIEFmdGVyVmlld0luaXQsXG4gIGluamVjdCxcbn0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5pbXBvcnQgeyBjb21iaW5lTGF0ZXN0LCBmcm9tLCBmcm9tRXZlbnQsIFN1YmplY3QgfSBmcm9tICdyeGpzJztcbmltcG9ydCB7IGRlYm91bmNlVGltZSwgZmlsdGVyLCB0YWtlVW50aWwgfSBmcm9tICdyeGpzL29wZXJhdG9ycyc7XG5pbXBvcnQgKiBhcyBQREZKUyBmcm9tICdwZGZqcy1kaXN0JztcbmltcG9ydCAqIGFzIFBERkpTVmlld2VyIGZyb20gJ3BkZmpzLWRpc3Qvd2ViL3BkZl92aWV3ZXIubWpzJztcblxuaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tICcuLi91dGlscy9ldmVudC1idXMtdXRpbHMnO1xuaW1wb3J0IHsgYXNzaWduLCBpc1NTUiB9IGZyb20gJy4uL3V0aWxzL2hlbHBlcnMnO1xuXG5pbXBvcnQgdHlwZSB7XG4gIFBERlNvdXJjZSxcbiAgUERGUGFnZVByb3h5LFxuICBQREZQcm9ncmVzc0RhdGEsXG4gIFBERkRvY3VtZW50UHJveHksXG4gIFBERkRvY3VtZW50TG9hZGluZ1Rhc2ssXG4gIFBERlZpZXdlck9wdGlvbnMsXG4gIFpvb21TY2FsZSxcbn0gZnJvbSAnLi90eXBpbmdzJztcbmltcG9ydCB7IEdsb2JhbFdvcmtlck9wdGlvbnMsIFZlcmJvc2l0eUxldmVsLCBnZXREb2N1bWVudCB9IGZyb20gJ3BkZmpzLWRpc3QnO1xuaW1wb3J0IHsgWm9vbVNlcnZpY2UgfSBmcm9tICcuL3pvb20uc2VydmljZSc7XG5cbmlmICghaXNTU1IoKSkge1xuICBhc3NpZ24oUERGSlMsICd2ZXJib3NpdHknLCBWZXJib3NpdHlMZXZlbC5JTkZPUyk7XG59XG5cbi8vIEB0cy1leHBlY3QtZXJyb3IgVGhpcyBkb2VzIG5vdCBleGlzdCBvdXRzaWRlIG9mIHBvbHlmaWxsIHdoaWNoIHRoaXMgaXMgZG9pbmdcbmlmICh0eXBlb2YgUHJvbWlzZS53aXRoUmVzb2x2ZXJzID09PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cpIHtcbiAgLy8gQHRzLWV4cGVjdC1lcnJvciBUaGlzIGRvZXMgbm90IGV4aXN0IG91dHNpZGUgb2YgcG9seWZpbGwgd2hpY2ggdGhpcyBpcyBkb2luZ1xuICB3aW5kb3cuUHJvbWlzZS53aXRoUmVzb2x2ZXJzID0gKCkgPT4ge1xuICAgIGxldCByZXNvbHZlO1xuICAgIGxldCByZWplY3Q7XG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXMsIHJlaikgPT4ge1xuICAgICAgcmVzb2x2ZSA9IHJlcztcbiAgICAgIHJlamVjdCA9IHJlajtcbiAgICB9KTtcbiAgICByZXR1cm4geyBwcm9taXNlLCByZXNvbHZlLCByZWplY3QgfTtcbiAgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gUmVuZGVyVGV4dE1vZGUge1xuICBESVNBQkxFRCxcbiAgRU5BQkxFRCxcbiAgRU5IQU5DRUQsXG59XG5cbkBDb21wb25lbnQoe1xuICBzZWxlY3RvcjogJ3BkZi12aWV3ZXInLFxuICB0ZW1wbGF0ZTogYFxuICAgIDxkaXYgI3BkZlZpZXdlckNvbnRhaW5lciBjbGFzcz1cIm5nMi1wZGYtdmlld2VyLWNvbnRhaW5lclwiPlxuICAgICAgPGRpdiBjbGFzcz1cInBkZlZpZXdlclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICBgLFxuICBzdHlsZVVybHM6IFsnLi9wZGYtdmlld2VyLmNvbXBvbmVudC5zY3NzJ10sXG59KVxuZXhwb3J0IGNsYXNzIFBkZlZpZXdlckNvbXBvbmVudFxuICBpbXBsZW1lbnRzIE9uQ2hhbmdlcywgT25Jbml0LCBPbkRlc3Ryb3ksIEFmdGVyVmlld0NoZWNrZWQsIEFmdGVyVmlld0luaXRcbntcbiAgc3RhdGljIENTU19VTklUUyA9IDk2LjAgLyA3Mi4wO1xuICBzdGF0aWMgQk9SREVSX1dJRFRIID0gOTtcblxuICBAVmlld0NoaWxkKCdwZGZWaWV3ZXJDb250YWluZXInKVxuICBwZGZWaWV3ZXJDb250YWluZXIhOiBFbGVtZW50UmVmPEhUTUxEaXZFbGVtZW50PjtcblxuICBldmVudEJ1cyE6IFBERkpTVmlld2VyLkV2ZW50QnVzO1xuICBwZGZMaW5rU2VydmljZSE6IFBERkpTVmlld2VyLlBERkxpbmtTZXJ2aWNlO1xuICBwZGZGaW5kQ29udHJvbGxlciE6IFBERkpTVmlld2VyLlBERkZpbmRDb250cm9sbGVyO1xuICBwZGZWaWV3ZXIhOiBQREZKU1ZpZXdlci5QREZWaWV3ZXIgfCBQREZKU1ZpZXdlci5QREZTaW5nbGVQYWdlVmlld2VyO1xuXG4gIHByaXZhdGUgaXNWaXNpYmxlID0gZmFsc2U7XG5cbiAgcHJpdmF0ZSBfY01hcHNVcmwgPVxuICAgIHR5cGVvZiBQREZKUyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAgID8gYGh0dHBzOi8vdW5wa2cuY29tL3BkZmpzLWRpc3RAJHsoUERGSlMgYXMgYW55KS52ZXJzaW9ufS9jbWFwcy9gXG4gICAgICA6IG51bGw7XG4gIHByaXZhdGUgX2ltYWdlUmVzb3VyY2VzUGF0aCA9XG4gICAgdHlwZW9mIFBERkpTICE9PSAndW5kZWZpbmVkJ1xuICAgICAgPyBgaHR0cHM6Ly91bnBrZy5jb20vcGRmanMtZGlzdEAkeyhQREZKUyBhcyBhbnkpLnZlcnNpb259L3dlYi9pbWFnZXMvYFxuICAgICAgOiB1bmRlZmluZWQ7XG4gIHByaXZhdGUgX3JlbmRlclRleHQgPSB0cnVlO1xuICBwcml2YXRlIF9yZW5kZXJUZXh0TW9kZTogUmVuZGVyVGV4dE1vZGUgPSBSZW5kZXJUZXh0TW9kZS5FTkFCTEVEO1xuICBwcml2YXRlIF9zdGlja1RvUGFnZSA9IGZhbHNlO1xuICBwcml2YXRlIF9vcmlnaW5hbFNpemUgPSB0cnVlO1xuICBwcml2YXRlIF9wZGY6IFBERkRvY3VtZW50UHJveHkgfCB1bmRlZmluZWQ7XG4gIHByaXZhdGUgX3BhZ2UgPSAxO1xuXG4gIHByaXZhdGUgX3pvb21TY2FsZTogWm9vbVNjYWxlID0gJ3BhZ2Utd2lkdGgnO1xuICBwcml2YXRlIF9yb3RhdGlvbiA9IDA7XG4gIHByaXZhdGUgX3Nob3dBbGwgPSB0cnVlO1xuICBwcml2YXRlIF9jYW5BdXRvUmVzaXplID0gdHJ1ZTtcbiAgcHJpdmF0ZSBfZml0VG9QYWdlID0gZmFsc2U7XG4gIHByaXZhdGUgX2V4dGVybmFsTGlua1RhcmdldCA9ICdibGFuayc7XG4gIHByaXZhdGUgX3Nob3dCb3JkZXJzID0gZmFsc2U7XG4gIHByaXZhdGUgbGFzdExvYWRlZCE6IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBQREZTb3VyY2UgfCBudWxsO1xuICBwcml2YXRlIF9sYXRlc3RTY3JvbGxlZFBhZ2UhOiBudW1iZXI7XG5cbiAgcHJpdmF0ZSBwYWdlU2Nyb2xsVGltZW91dDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgaXNJbml0aWFsaXplZCA9IGZhbHNlO1xuICBwcml2YXRlIGxvYWRpbmdUYXNrPzogUERGRG9jdW1lbnRMb2FkaW5nVGFzayB8IG51bGw7XG4gIHByaXZhdGUgZGVzdHJveSQgPSBuZXcgU3ViamVjdDx2b2lkPigpO1xuXG4gIEBPdXRwdXQoJ2FmdGVyLWxvYWQtY29tcGxldGUnKSBhZnRlckxvYWRDb21wbGV0ZSA9XG4gICAgbmV3IEV2ZW50RW1pdHRlcjxQREZEb2N1bWVudFByb3h5PigpO1xuICBAT3V0cHV0KCdwYWdlLXJlbmRlcmVkJykgcGFnZVJlbmRlcmVkID0gbmV3IEV2ZW50RW1pdHRlcjxDdXN0b21FdmVudD4oKTtcbiAgQE91dHB1dCgncGFnZXMtaW5pdGlhbGl6ZWQnKSBwYWdlSW5pdGlhbGl6ZWQgPVxuICAgIG5ldyBFdmVudEVtaXR0ZXI8Q3VzdG9tRXZlbnQ+KCk7XG4gIEBPdXRwdXQoJ3RleHQtbGF5ZXItcmVuZGVyZWQnKSB0ZXh0TGF5ZXJSZW5kZXJlZCA9XG4gICAgbmV3IEV2ZW50RW1pdHRlcjxDdXN0b21FdmVudD4oKTtcbiAgQE91dHB1dCgnZXJyb3InKSBvbkVycm9yID0gbmV3IEV2ZW50RW1pdHRlcjxhbnk+KCk7XG4gIEBPdXRwdXQoJ29uLXByb2dyZXNzJykgb25Qcm9ncmVzcyA9IG5ldyBFdmVudEVtaXR0ZXI8UERGUHJvZ3Jlc3NEYXRhPigpO1xuICBAT3V0cHV0KCkgcGFnZUNoYW5nZTogRXZlbnRFbWl0dGVyPG51bWJlcj4gPSBuZXcgRXZlbnRFbWl0dGVyPG51bWJlcj4odHJ1ZSk7XG4gIEBJbnB1dCgpIHNyYz86IHN0cmluZyB8IFVpbnQ4QXJyYXkgfCBQREZTb3VyY2U7XG5cbiAgQElucHV0KCdjLW1hcHMtdXJsJylcbiAgc2V0IGNNYXBzVXJsKGNNYXBzVXJsOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9jTWFwc1VybCA9IGNNYXBzVXJsO1xuICB9XG5cbiAgQElucHV0KCdwYWdlJylcbiAgc2V0IHBhZ2UoX3BhZ2U6IG51bWJlciB8IHN0cmluZyB8IGFueSkge1xuICAgIF9wYWdlID0gcGFyc2VJbnQoX3BhZ2UsIDEwKSB8fCAxO1xuICAgIGNvbnN0IG9yaWdpbmFsUGFnZSA9IF9wYWdlO1xuXG4gICAgaWYgKHRoaXMuX3BkZikge1xuICAgICAgX3BhZ2UgPSB0aGlzLmdldFZhbGlkUGFnZU51bWJlcihfcGFnZSk7XG4gICAgfVxuXG4gICAgdGhpcy5fcGFnZSA9IF9wYWdlO1xuICAgIGlmIChvcmlnaW5hbFBhZ2UgIT09IF9wYWdlKSB7XG4gICAgICB0aGlzLnBhZ2VDaGFuZ2UuZW1pdChfcGFnZSk7XG4gICAgfVxuICB9XG5cbiAgQElucHV0KCdyZW5kZXItdGV4dCcpXG4gIHNldCByZW5kZXJUZXh0KHJlbmRlclRleHQ6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9yZW5kZXJUZXh0ID0gcmVuZGVyVGV4dDtcbiAgfVxuXG4gIEBJbnB1dCgncmVuZGVyLXRleHQtbW9kZScpXG4gIHNldCByZW5kZXJUZXh0TW9kZShyZW5kZXJUZXh0TW9kZTogUmVuZGVyVGV4dE1vZGUpIHtcbiAgICB0aGlzLl9yZW5kZXJUZXh0TW9kZSA9IHJlbmRlclRleHRNb2RlO1xuICB9XG5cbiAgQElucHV0KCdvcmlnaW5hbC1zaXplJylcbiAgc2V0IG9yaWdpbmFsU2l6ZShvcmlnaW5hbFNpemU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9vcmlnaW5hbFNpemUgPSBvcmlnaW5hbFNpemU7XG4gIH1cblxuICBASW5wdXQoJ3Nob3ctYWxsJylcbiAgc2V0IHNob3dBbGwodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9zaG93QWxsID0gdmFsdWU7XG4gIH1cblxuICBASW5wdXQoJ3N0aWNrLXRvLXBhZ2UnKVxuICBzZXQgc3RpY2tUb1BhZ2UodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9zdGlja1RvUGFnZSA9IHZhbHVlO1xuICB9XG5cbiAgQElucHV0KCd6b29tJylcbiAgc2V0IHpvb20odmFsdWU6IG51bWJlcikge1xuICAgIGlmICh2YWx1ZSA8PSAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy56b29tU2VydmljZS56b29tID0gdmFsdWU7XG4gIH1cblxuICBnZXQgem9vbSgpIHtcbiAgICByZXR1cm4gdGhpcy56b29tU2VydmljZS56b29tO1xuICB9XG5cbiAgQElucHV0KCd6b29tLXNjYWxlJylcbiAgc2V0IHpvb21TY2FsZSh2YWx1ZTogWm9vbVNjYWxlKSB7XG4gICAgdGhpcy5fem9vbVNjYWxlID0gdmFsdWU7XG4gIH1cblxuICBnZXQgem9vbVNjYWxlKCkge1xuICAgIHJldHVybiB0aGlzLl96b29tU2NhbGU7XG4gIH1cblxuICBASW5wdXQoJ3JvdGF0aW9uJylcbiAgc2V0IHJvdGF0aW9uKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAoISh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIHZhbHVlICUgOTAgPT09IDApKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ0ludmFsaWQgcGFnZXMgcm90YXRpb24gYW5nbGUuJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5fcm90YXRpb24gPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnZXh0ZXJuYWwtbGluay10YXJnZXQnKVxuICBzZXQgZXh0ZXJuYWxMaW5rVGFyZ2V0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICB0aGlzLl9leHRlcm5hbExpbmtUYXJnZXQgPSB2YWx1ZTtcbiAgfVxuXG4gIEBJbnB1dCgnYXV0b3Jlc2l6ZScpXG4gIHNldCBhdXRvcmVzaXplKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fY2FuQXV0b1Jlc2l6ZSA9IEJvb2xlYW4odmFsdWUpO1xuICB9XG5cbiAgQElucHV0KCdmaXQtdG8tcGFnZScpXG4gIHNldCBmaXRUb1BhZ2UodmFsdWU6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9maXRUb1BhZ2UgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgnc2hvdy1ib3JkZXJzJylcbiAgc2V0IHNob3dCb3JkZXJzKHZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5fc2hvd0JvcmRlcnMgPSBCb29sZWFuKHZhbHVlKTtcbiAgfVxuXG4gIEBJbnB1dCgpIGlzV2hlZWxab29tID0gdHJ1ZTtcbiAgQElucHV0KCkgaXNXaGVlbEN0cmxab29tID0gdHJ1ZTtcbiAgQElucHV0KCkgaXNPcHRpbWl6ZVpvb20gPSB0cnVlO1xuXG4gIHN0YXRpYyBnZXRMaW5rVGFyZ2V0KHR5cGU6IHN0cmluZykge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgY2FzZSAnYmxhbmsnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5CTEFOSztcbiAgICAgIGNhc2UgJ25vbmUnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5OT05FO1xuICAgICAgY2FzZSAnc2VsZic6XG4gICAgICAgIHJldHVybiAoUERGSlNWaWV3ZXIgYXMgYW55KS5MaW5rVGFyZ2V0LlNFTEY7XG4gICAgICBjYXNlICdwYXJlbnQnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5QQVJFTlQ7XG4gICAgICBjYXNlICd0b3AnOlxuICAgICAgICByZXR1cm4gKFBERkpTVmlld2VyIGFzIGFueSkuTGlua1RhcmdldC5UT1A7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQgPSBpbmplY3QoRWxlbWVudFJlZjxIVE1MRWxlbWVudD4pO1xuICBwcml2YXRlIHJlYWRvbmx5IG5nWm9uZSA9IGluamVjdChOZ1pvbmUpO1xuICBwcml2YXRlIHJlYWRvbmx5IHpvb21TZXJ2aWNlID0gaW5qZWN0KFpvb21TZXJ2aWNlKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICBpZiAoaXNTU1IoKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBwZGZXb3JrZXJTcmM6IHN0cmluZztcblxuICAgIGNvbnN0IHBkZkpzVmVyc2lvbjogc3RyaW5nID0gKFBERkpTIGFzIGFueSkudmVyc2lvbjtcbiAgICBjb25zdCB2ZXJzaW9uU3BlY2lmaWNQZGZXb3JrZXJVcmw6IHN0cmluZyA9ICh3aW5kb3cgYXMgYW55KVtcbiAgICAgIGBwZGZXb3JrZXJTcmMke3BkZkpzVmVyc2lvbn1gXG4gICAgXTtcblxuICAgIGlmICh2ZXJzaW9uU3BlY2lmaWNQZGZXb3JrZXJVcmwpIHtcbiAgICAgIHBkZldvcmtlclNyYyA9IHZlcnNpb25TcGVjaWZpY1BkZldvcmtlclVybDtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgd2luZG93Lmhhc093blByb3BlcnR5KCdwZGZXb3JrZXJTcmMnKSAmJlxuICAgICAgdHlwZW9mICh3aW5kb3cgYXMgYW55KS5wZGZXb3JrZXJTcmMgPT09ICdzdHJpbmcnICYmXG4gICAgICAod2luZG93IGFzIGFueSkucGRmV29ya2VyU3JjXG4gICAgKSB7XG4gICAgICBwZGZXb3JrZXJTcmMgPSAod2luZG93IGFzIGFueSkucGRmV29ya2VyU3JjO1xuICAgIH0gZWxzZSB7XG4gICAgICBwZGZXb3JrZXJTcmMgPSBgaHR0cHM6Ly9jZG4uanNkZWxpdnIubmV0L25wbS9wZGZqcy1kaXN0QCR7cGRmSnNWZXJzaW9ufS9sZWdhY3kvYnVpbGQvcGRmLndvcmtlci5taW4ubWpzYDtcbiAgICB9XG5cbiAgICBhc3NpZ24oR2xvYmFsV29ya2VyT3B0aW9ucywgJ3dvcmtlclNyYycsIHBkZldvcmtlclNyYyk7XG4gIH1cblxuICBuZ0FmdGVyVmlld0NoZWNrZWQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaXNJbml0aWFsaXplZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IG9mZnNldCA9IHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50Lm9mZnNldFBhcmVudDtcblxuICAgIGlmICh0aGlzLmlzVmlzaWJsZSA9PT0gdHJ1ZSAmJiBvZmZzZXQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5pc1Zpc2libGUgPSBmYWxzZTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1Zpc2libGUgPT09IGZhbHNlICYmIG9mZnNldCAhPSBudWxsKSB7XG4gICAgICB0aGlzLmlzVmlzaWJsZSA9IHRydWU7XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLmluaXRpYWxpemUoKTtcbiAgICAgICAgdGhpcy5uZ09uQ2hhbmdlcyh7IHNyYzogdGhpcy5zcmMgfSBhcyBhbnkpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgbmdBZnRlclZpZXdJbml0KCk6IHZvaWQge1xuICAgIHRoaXMuem9vbVNlcnZpY2UuaW5pdFNldHRpbmdzKFxuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQsXG4gICAgICB0aGlzLmlzV2hlZWxab29tLFxuICAgICAgdGhpcy5pc1doZWVsQ3RybFpvb21cbiAgICApO1xuICB9XG5cbiAgbmdPbkluaXQoKSB7XG4gICAgdGhpcy5pbml0aWFsaXplKCk7XG4gICAgdGhpcy5zZXR1cFJlc2l6ZUxpc3RlbmVyKCk7XG4gIH1cblxuICBuZ09uRGVzdHJveSgpIHtcbiAgICB0aGlzLmNsZWFyKCk7XG4gICAgdGhpcy5kZXN0cm95JC5uZXh0KCk7XG4gICAgdGhpcy5sb2FkaW5nVGFzayA9IG51bGw7XG4gICAgdGhpcy56b29tU2VydmljZS5yZW1vdmVMaXN0ZW5lcnModGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQpO1xuICB9XG5cbiAgbmdPbkNoYW5nZXMoY2hhbmdlczogU2ltcGxlQ2hhbmdlcykge1xuICAgIGlmIChpc1NTUigpIHx8ICF0aGlzLmlzVmlzaWJsZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICgnc3JjJyBpbiBjaGFuZ2VzKSB7XG4gICAgICB0aGlzLmxvYWRQREYoKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuX3BkZikge1xuICAgICAgaWYgKCdyZW5kZXJUZXh0JyBpbiBjaGFuZ2VzIHx8ICdzaG93QWxsJyBpbiBjaGFuZ2VzKSB7XG4gICAgICAgIHRoaXMuc2V0dXBWaWV3ZXIoKTtcbiAgICAgICAgdGhpcy5yZXNldFBkZkRvY3VtZW50KCk7XG4gICAgICB9XG4gICAgICBpZiAoJ3BhZ2UnIGluIGNoYW5nZXMpIHtcbiAgICAgICAgY29uc3QgeyBwYWdlIH0gPSBjaGFuZ2VzO1xuICAgICAgICBpZiAocGFnZS5jdXJyZW50VmFsdWUgPT09IHRoaXMuX2xhdGVzdFNjcm9sbGVkUGFnZSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE5ldyBmb3JtIG9mIHBhZ2UgY2hhbmdpbmc6IFRoZSB2aWV3ZXIgd2lsbCBub3cganVtcCB0byB0aGUgc3BlY2lmaWVkIHBhZ2Ugd2hlbiBpdCBpcyBjaGFuZ2VkLlxuICAgICAgICAvLyBUaGlzIGJlaGF2aW9yIGlzIGludHJvZHVjZWQgYnkgdXNpbmcgdGhlIFBERlNpbmdsZVBhZ2VWaWV3ZXJcbiAgICAgICAgdGhpcy5wZGZWaWV3ZXIuc2Nyb2xsUGFnZUludG9WaWV3KHsgcGFnZU51bWJlcjogdGhpcy5fcGFnZSB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICB9XG4gIH1cblxuICB1cGRhdGVTaXplKCk6IHZvaWQge1xuICAgIGNvbWJpbmVMYXRlc3QoW1xuICAgICAgZnJvbSh0aGlzLl9wZGYhLmdldFBhZ2UodGhpcy5wZGZWaWV3ZXIuY3VycmVudFBhZ2VOdW1iZXIpKSxcbiAgICAgIHRoaXMuem9vbVNlcnZpY2UudHJpZ2dlclVwZGF0ZVNpemUsXG4gICAgXSlcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoe1xuICAgICAgICBuZXh0OiAoW3BhZ2VdOiBbUERGUGFnZVByb3h5LCB2b2lkXSkgPT4ge1xuICAgICAgICAgIGlmICh0aGlzLmlzT3B0aW1pemVab29tIHx8IHRoaXMuaXNXaGVlbFpvb20pIHtcbiAgICAgICAgICAgIHRoaXMuem9vbVNlcnZpY2Uuc2F2ZVNjcm9sbFBvc2l0aW9uKFxuICAgICAgICAgICAgICB0aGlzLnBkZlZpZXdlckNvbnRhaW5lcj8ubmF0aXZlRWxlbWVudFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCByb3RhdGlvbiA9IHRoaXMuX3JvdGF0aW9uICsgcGFnZS5yb3RhdGU7XG4gICAgICAgICAgY29uc3Qgdmlld3BvcnRXaWR0aCA9XG4gICAgICAgICAgICBwYWdlLmdldFZpZXdwb3J0KHtcbiAgICAgICAgICAgICAgc2NhbGU6IHRoaXMuem9vbVNlcnZpY2Uuem9vbSxcbiAgICAgICAgICAgICAgcm90YXRpb24sXG4gICAgICAgICAgICB9KS53aWR0aCAqIFBkZlZpZXdlckNvbXBvbmVudC5DU1NfVU5JVFM7XG4gICAgICAgICAgbGV0IHNjYWxlID0gdGhpcy56b29tU2VydmljZS56b29tO1xuICAgICAgICAgIGxldCBzdGlja1RvUGFnZSA9IHRydWU7XG5cbiAgICAgICAgICAvLyBTY2FsZSB0aGUgZG9jdW1lbnQgd2hlbiBpdCBzaG91bGRuJ3QgYmUgaW4gb3JpZ2luYWwgc2l6ZSBvciBkb2Vzbid0IGZpdCBpbnRvIHRoZSB2aWV3cG9ydFxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICF0aGlzLl9vcmlnaW5hbFNpemUgfHxcbiAgICAgICAgICAgICh0aGlzLl9maXRUb1BhZ2UgJiZcbiAgICAgICAgICAgICAgdmlld3BvcnRXaWR0aCA+IHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudFdpZHRoKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3Qgdmlld1BvcnQgPSBwYWdlLmdldFZpZXdwb3J0KHsgc2NhbGU6IDEsIHJvdGF0aW9uIH0pO1xuICAgICAgICAgICAgc2NhbGUgPSB0aGlzLmdldFNjYWxlKHZpZXdQb3J0LndpZHRoLCB2aWV3UG9ydC5oZWlnaHQpO1xuICAgICAgICAgICAgc3RpY2tUb1BhZ2UgPSAhdGhpcy5fc3RpY2tUb1BhZ2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5wZGZWaWV3ZXIuY3VycmVudFNjYWxlID0gc2NhbGU7XG5cbiAgICAgICAgICBpZiAoc3RpY2tUb1BhZ2UpXG4gICAgICAgICAgICB0aGlzLnBkZlZpZXdlci5zY3JvbGxQYWdlSW50b1ZpZXcoe1xuICAgICAgICAgICAgICBwYWdlTnVtYmVyOiBwYWdlLnBhZ2VOdW1iZXIsXG4gICAgICAgICAgICAgIGlnbm9yZURlc3RpbmF0aW9uWm9vbTogdHJ1ZSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKHRoaXMuaXNPcHRpbWl6ZVpvb20gfHwgdGhpcy5pc1doZWVsWm9vbSkge1xuICAgICAgICAgICAgdGhpcy56b29tU2VydmljZS5yZXN0b3JlU2Nyb2xsUG9zaXRpb24oXG4gICAgICAgICAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICB9XG5cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMubG9hZGluZ1Rhc2sgJiYgIXRoaXMubG9hZGluZ1Rhc2suZGVzdHJveWVkKSB7XG4gICAgICB0aGlzLmxvYWRpbmdUYXNrLmRlc3Ryb3koKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fcGRmKSB7XG4gICAgICB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UgPSAwO1xuICAgICAgdGhpcy5fcGRmLmRlc3Ryb3koKTtcbiAgICAgIHRoaXMuX3BkZiA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICB0aGlzLnBkZlZpZXdlciAmJiB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudChudWxsIGFzIGFueSk7XG4gICAgdGhpcy5wZGZMaW5rU2VydmljZSAmJiB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldERvY3VtZW50KG51bGwsIG51bGwpO1xuICAgIHRoaXMucGRmRmluZENvbnRyb2xsZXIgJiYgdGhpcy5wZGZGaW5kQ29udHJvbGxlci5zZXREb2N1bWVudChudWxsIGFzIGFueSk7XG4gIH1cblxuICBwcml2YXRlIGdldFBERkxpbmtTZXJ2aWNlQ29uZmlnKCkge1xuICAgIGNvbnN0IGxpbmtUYXJnZXQgPSBQZGZWaWV3ZXJDb21wb25lbnQuZ2V0TGlua1RhcmdldChcbiAgICAgIHRoaXMuX2V4dGVybmFsTGlua1RhcmdldFxuICAgICk7XG5cbiAgICBpZiAobGlua1RhcmdldCkge1xuICAgICAgcmV0dXJuIHsgZXh0ZXJuYWxMaW5rVGFyZ2V0OiBsaW5rVGFyZ2V0IH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgcHJpdmF0ZSBpbml0RXZlbnRCdXMoKSB7XG4gICAgdGhpcy5ldmVudEJ1cyA9IGNyZWF0ZUV2ZW50QnVzKFBERkpTVmlld2VyLCB0aGlzLmRlc3Ryb3kkKTtcblxuICAgIGZyb21FdmVudDxDdXN0b21FdmVudD4odGhpcy5ldmVudEJ1cywgJ3BhZ2VyZW5kZXJlZCcpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICB0aGlzLnBhZ2VSZW5kZXJlZC5lbWl0KGV2ZW50KTtcbiAgICAgIH0pO1xuXG4gICAgZnJvbUV2ZW50PEN1c3RvbUV2ZW50Pih0aGlzLmV2ZW50QnVzLCAncGFnZXNpbml0JylcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMucGFnZUluaXRpYWxpemVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQodGhpcy5ldmVudEJ1cywgJ3BhZ2VjaGFuZ2luZycpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKCh7IHBhZ2VOdW1iZXIgfTogYW55KSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnBhZ2VTY3JvbGxUaW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucGFnZVNjcm9sbFRpbWVvdXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wYWdlU2Nyb2xsVGltZW91dCA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICB0aGlzLl9sYXRlc3RTY3JvbGxlZFBhZ2UgPSBwYWdlTnVtYmVyO1xuICAgICAgICAgIHRoaXMucGFnZUNoYW5nZS5lbWl0KHBhZ2VOdW1iZXIpO1xuICAgICAgICB9LCAxMDApO1xuICAgICAgfSk7XG5cbiAgICBmcm9tRXZlbnQ8Q3VzdG9tRXZlbnQ+KHRoaXMuZXZlbnRCdXMsICd0ZXh0bGF5ZXJyZW5kZXJlZCcpXG4gICAgICAucGlwZSh0YWtlVW50aWwodGhpcy5kZXN0cm95JCkpXG4gICAgICAuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICB0aGlzLnRleHRMYXllclJlbmRlcmVkLmVtaXQoZXZlbnQpO1xuICAgICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGluaXRQREZTZXJ2aWNlcygpIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlID0gbmV3IFBERkpTVmlld2VyLlBERkxpbmtTZXJ2aWNlKHtcbiAgICAgIGV2ZW50QnVzOiB0aGlzLmV2ZW50QnVzLFxuICAgICAgLi4udGhpcy5nZXRQREZMaW5rU2VydmljZUNvbmZpZygpLFxuICAgIH0pO1xuICAgIHRoaXMucGRmRmluZENvbnRyb2xsZXIgPSBuZXcgUERGSlNWaWV3ZXIuUERGRmluZENvbnRyb2xsZXIoe1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICBsaW5rU2VydmljZTogdGhpcy5wZGZMaW5rU2VydmljZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0UERGT3B0aW9ucygpOiBQREZWaWV3ZXJPcHRpb25zIHtcbiAgICByZXR1cm4ge1xuICAgICAgZXZlbnRCdXM6IHRoaXMuZXZlbnRCdXMsXG4gICAgICBjb250YWluZXI6IHRoaXMuZWxlbWVudC5uYXRpdmVFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2RpdicpISxcbiAgICAgIHJlbW92ZVBhZ2VCb3JkZXJzOiAhdGhpcy5fc2hvd0JvcmRlcnMsXG4gICAgICBsaW5rU2VydmljZTogdGhpcy5wZGZMaW5rU2VydmljZSxcbiAgICAgIHRleHRMYXllck1vZGU6IHRoaXMuX3JlbmRlclRleHRcbiAgICAgICAgPyB0aGlzLl9yZW5kZXJUZXh0TW9kZVxuICAgICAgICA6IFJlbmRlclRleHRNb2RlLkRJU0FCTEVELFxuICAgICAgZmluZENvbnRyb2xsZXI6IHRoaXMucGRmRmluZENvbnRyb2xsZXIsXG4gICAgICBsMTBuOiBuZXcgUERGSlNWaWV3ZXIuR2VuZXJpY0wxMG4oJ2VuJyksXG4gICAgICBpbWFnZVJlc291cmNlc1BhdGg6IHRoaXMuX2ltYWdlUmVzb3VyY2VzUGF0aCxcbiAgICAgIGFubm90YXRpb25FZGl0b3JNb2RlOiBQREZKUy5Bbm5vdGF0aW9uRWRpdG9yVHlwZS5ESVNBQkxFLFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlIHNldHVwVmlld2VyKCkge1xuICAgIGlmICh0aGlzLnBkZlZpZXdlcikge1xuICAgICAgdGhpcy5wZGZWaWV3ZXIuc2V0RG9jdW1lbnQobnVsbCBhcyBhbnkpO1xuICAgIH1cblxuICAgIGFzc2lnbihQREZKUywgJ2Rpc2FibGVUZXh0TGF5ZXInLCAhdGhpcy5fcmVuZGVyVGV4dCk7XG5cbiAgICB0aGlzLmluaXRQREZTZXJ2aWNlcygpO1xuXG4gICAgaWYgKHRoaXMuX3Nob3dBbGwpIHtcbiAgICAgIHRoaXMucGRmVmlld2VyID0gbmV3IFBERkpTVmlld2VyLlBERlZpZXdlcih0aGlzLmdldFBERk9wdGlvbnMoKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGRmVmlld2VyID0gbmV3IFBERkpTVmlld2VyLlBERlNpbmdsZVBhZ2VWaWV3ZXIoXG4gICAgICAgIHRoaXMuZ2V0UERGT3B0aW9ucygpXG4gICAgICApO1xuICAgIH1cbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldFZpZXdlcih0aGlzLnBkZlZpZXdlcik7XG5cbiAgICB0aGlzLnBkZlZpZXdlci5fY3VycmVudFBhZ2VOdW1iZXIgPSB0aGlzLl9wYWdlO1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRWYWxpZFBhZ2VOdW1iZXIocGFnZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAocGFnZSA8IDEpIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cblxuICAgIGlmIChwYWdlID4gdGhpcy5fcGRmIS5udW1QYWdlcykge1xuICAgICAgcmV0dXJuIHRoaXMuX3BkZiEubnVtUGFnZXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhZ2U7XG4gIH1cblxuICBwcml2YXRlIGdldERvY3VtZW50UGFyYW1zKCkge1xuICAgIGNvbnN0IHNyY1R5cGUgPSB0eXBlb2YgdGhpcy5zcmM7XG5cbiAgICBpZiAoIXRoaXMuX2NNYXBzVXJsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zcmM7XG4gICAgfVxuXG4gICAgY29uc3QgcGFyYW1zOiBhbnkgPSB7XG4gICAgICBjTWFwVXJsOiB0aGlzLl9jTWFwc1VybCxcbiAgICAgIGNNYXBQYWNrZWQ6IHRydWUsXG4gICAgICBlbmFibGVYZmE6IHRydWUsXG4gICAgfTtcbiAgICBwYXJhbXMuaXNFdmFsU3VwcG9ydGVkID0gZmFsc2U7IC8vIGh0dHA6Ly9jdmUub3JnL0NWRVJlY29yZD9pZD1DVkUtMjAyNC00MzY3XG5cbiAgICBpZiAoc3JjVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHBhcmFtcy51cmwgPSB0aGlzLnNyYztcbiAgICB9IGVsc2UgaWYgKHNyY1R5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoKHRoaXMuc3JjIGFzIGFueSkuYnl0ZUxlbmd0aCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHBhcmFtcy5kYXRhID0gdGhpcy5zcmM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBPYmplY3QuYXNzaWduKHBhcmFtcywgdGhpcy5zcmMpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBwYXJhbXM7XG4gIH1cblxuICBwcml2YXRlIGxvYWRQREYoKSB7XG4gICAgaWYgKCF0aGlzLnNyYykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmxhc3RMb2FkZWQgPT09IHRoaXMuc3JjKSB7XG4gICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuY2xlYXIoKTtcblxuICAgIHRoaXMuc2V0dXBWaWV3ZXIoKTtcblxuICAgIHRoaXMubG9hZGluZ1Rhc2sgPSBnZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50UGFyYW1zKCkpO1xuXG4gICAgdGhpcy5sb2FkaW5nVGFzayEub25Qcm9ncmVzcyA9IChwcm9ncmVzc0RhdGE6IFBERlByb2dyZXNzRGF0YSkgPT4ge1xuICAgICAgdGhpcy5vblByb2dyZXNzLmVtaXQocHJvZ3Jlc3NEYXRhKTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc3JjID0gdGhpcy5zcmM7XG5cbiAgICBmcm9tKHRoaXMubG9hZGluZ1Rhc2shLnByb21pc2UgYXMgUHJvbWlzZTxQREZEb2N1bWVudFByb3h5PilcbiAgICAgIC5waXBlKHRha2VVbnRpbCh0aGlzLmRlc3Ryb3kkKSlcbiAgICAgIC5zdWJzY3JpYmUoe1xuICAgICAgICBuZXh0OiAocGRmKSA9PiB7XG4gICAgICAgICAgdGhpcy5fcGRmID0gcGRmO1xuICAgICAgICAgIHRoaXMubGFzdExvYWRlZCA9IHNyYztcblxuICAgICAgICAgIHRoaXMuYWZ0ZXJMb2FkQ29tcGxldGUuZW1pdChwZGYpO1xuICAgICAgICAgIHRoaXMucmVzZXRQZGZEb2N1bWVudCgpO1xuXG4gICAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyb3I6IChlcnJvcikgPT4ge1xuICAgICAgICAgIHRoaXMubGFzdExvYWRlZCA9IG51bGw7XG4gICAgICAgICAgdGhpcy5vbkVycm9yLmVtaXQoZXJyb3IpO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZSgpIHtcbiAgICB0aGlzLnBhZ2UgPSB0aGlzLl9wYWdlO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyKCkge1xuICAgIHRoaXMuX3BhZ2UgPSB0aGlzLmdldFZhbGlkUGFnZU51bWJlcih0aGlzLl9wYWdlKTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuX3JvdGF0aW9uICE9PSAwIHx8XG4gICAgICB0aGlzLnBkZlZpZXdlci5wYWdlc1JvdGF0aW9uICE9PSB0aGlzLl9yb3RhdGlvblxuICAgICkge1xuICAgICAgLy8gd2FpdCB1bnRpbCBhdCBsZWFzdCB0aGUgZmlyc3QgcGFnZSBpcyBhdmFpbGFibGUuXG4gICAgICB0aGlzLnBkZlZpZXdlci5maXJzdFBhZ2VQcm9taXNlPy50aGVuKFxuICAgICAgICAoKSA9PiAodGhpcy5wZGZWaWV3ZXIucGFnZXNSb3RhdGlvbiA9IHRoaXMuX3JvdGF0aW9uKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fc3RpY2tUb1BhZ2UpIHtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0aGlzLnBkZlZpZXdlci5jdXJyZW50UGFnZU51bWJlciA9IHRoaXMuX3BhZ2U7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGRmVmlld2VyLl9wYWdlcz8ubGVuZ3RoKSB7XG4gICAgICAvLyB0aGUgZmlyc3QgdGltZSB3ZSB3YWl0IHVudGlsIHBhZ2VzIGluaXRcbiAgICAgIGNvbnN0IHN1YiA9IHRoaXMucGFnZUluaXRpYWxpemVkLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIHRoaXMudXBkYXRlU2l6ZSgpO1xuICAgICAgICBzdWIudW5zdWJzY3JpYmUoKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGdldFNjYWxlKHZpZXdwb3J0V2lkdGg6IG51bWJlciwgdmlld3BvcnRIZWlnaHQ6IG51bWJlcikge1xuICAgIGNvbnN0IGJvcmRlclNpemUgPSB0aGlzLl9zaG93Qm9yZGVyc1xuICAgICAgPyAyICogUGRmVmlld2VyQ29tcG9uZW50LkJPUkRFUl9XSURUSFxuICAgICAgOiAwO1xuICAgIGNvbnN0IHBkZkNvbnRhaW5lcldpZHRoID1cbiAgICAgIHRoaXMucGRmVmlld2VyQ29udGFpbmVyPy5uYXRpdmVFbGVtZW50LmNsaWVudFdpZHRoIC0gYm9yZGVyU2l6ZTtcbiAgICBjb25zdCBwZGZDb250YWluZXJIZWlnaHQgPVxuICAgICAgdGhpcy5wZGZWaWV3ZXJDb250YWluZXI/Lm5hdGl2ZUVsZW1lbnQuY2xpZW50SGVpZ2h0IC0gYm9yZGVyU2l6ZTtcblxuICAgIGlmIChcbiAgICAgIHBkZkNvbnRhaW5lckhlaWdodCA9PT0gMCB8fFxuICAgICAgdmlld3BvcnRIZWlnaHQgPT09IDAgfHxcbiAgICAgIHBkZkNvbnRhaW5lcldpZHRoID09PSAwIHx8XG4gICAgICB2aWV3cG9ydFdpZHRoID09PSAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG5cbiAgICBsZXQgcmF0aW8gPSAxO1xuICAgIHN3aXRjaCAodGhpcy5fem9vbVNjYWxlKSB7XG4gICAgICBjYXNlICdwYWdlLWZpdCc6XG4gICAgICAgIHJhdGlvID0gTWF0aC5taW4oXG4gICAgICAgICAgcGRmQ29udGFpbmVySGVpZ2h0IC8gdmlld3BvcnRIZWlnaHQsXG4gICAgICAgICAgcGRmQ29udGFpbmVyV2lkdGggLyB2aWV3cG9ydFdpZHRoXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncGFnZS1oZWlnaHQnOlxuICAgICAgICByYXRpbyA9IHBkZkNvbnRhaW5lckhlaWdodCAvIHZpZXdwb3J0SGVpZ2h0O1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZ2Utd2lkdGgnOlxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmF0aW8gPSBwZGZDb250YWluZXJXaWR0aCAvIHZpZXdwb3J0V2lkdGg7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiAodGhpcy56b29tU2VydmljZS56b29tICogcmF0aW8pIC8gUGRmVmlld2VyQ29tcG9uZW50LkNTU19VTklUUztcbiAgfVxuXG4gIHByaXZhdGUgcmVzZXRQZGZEb2N1bWVudCgpIHtcbiAgICB0aGlzLnBkZkxpbmtTZXJ2aWNlLnNldERvY3VtZW50KHRoaXMuX3BkZiwgbnVsbCk7XG4gICAgdGhpcy5wZGZGaW5kQ29udHJvbGxlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgICB0aGlzLnBkZlZpZXdlci5zZXREb2N1bWVudCh0aGlzLl9wZGYhKTtcbiAgfVxuXG4gIHByaXZhdGUgaW5pdGlhbGl6ZSgpOiB2b2lkIHtcbiAgICBpZiAoaXNTU1IoKSB8fCAhdGhpcy5pc1Zpc2libGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgIHRoaXMuaW5pdEV2ZW50QnVzKCk7XG4gICAgdGhpcy5zZXR1cFZpZXdlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cFJlc2l6ZUxpc3RlbmVyKCk6IHZvaWQge1xuICAgIGlmIChpc1NTUigpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5uZ1pvbmUucnVuT3V0c2lkZUFuZ3VsYXIoKCkgPT4ge1xuICAgICAgZnJvbUV2ZW50KHdpbmRvdywgJ3Jlc2l6ZScpXG4gICAgICAgIC5waXBlKFxuICAgICAgICAgIGRlYm91bmNlVGltZSgxMDApLFxuICAgICAgICAgIGZpbHRlcigoKSA9PiB0aGlzLl9jYW5BdXRvUmVzaXplICYmICEhdGhpcy5fcGRmKSxcbiAgICAgICAgICB0YWtlVW50aWwodGhpcy5kZXN0cm95JClcbiAgICAgICAgKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVNpemUoKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==