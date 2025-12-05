/**
 * Created by vadimdez on 21/06/16.
 */
import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as PDFJS from 'pdfjs-dist';
import * as PDFJSViewer from 'pdfjs-dist/web/pdf_viewer.mjs';
import { combineLatest, from, fromEvent, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';

import { createEventBus } from '../utils/event-bus-utils';
import { assign, isSSR } from '../utils/helpers';

import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist';
import { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api';
import { PanService } from './services/pan.service';
import { ZoomService } from './services/zoom.service';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  PDFProgressData,
  PDFSource,
  PDFViewerOptions,
  ZoomScale,
} from './typings';

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

export const enum RenderTextMode {
  DISABLED,
  ENABLED,
  ENHANCED,
}

@Component({
  selector: 'pdf-viewer',
  template: `
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
  `,
  styleUrls: ['./pdf-viewer.component.scss'],
  providers: [ZoomService, PanService],
})
export class PdfViewerComponent
  implements OnChanges, OnInit, OnDestroy, AfterViewChecked, AfterViewInit
{
  static CSS_UNITS = 96.0 / 72.0;
  static BORDER_WIDTH = 9;

  @ViewChild('pdfViewerContainer')
  pdfViewerContainer!: ElementRef<HTMLDivElement>;

  eventBus!: PDFJSViewer.EventBus;
  pdfLinkService!: PDFJSViewer.PDFLinkService;
  pdfFindController!: PDFJSViewer.PDFFindController;
  pdfViewer!: PDFJSViewer.PDFViewer | PDFJSViewer.PDFSinglePageViewer;

  private isVisible = false;

  private _cMapsUrl =
    typeof PDFJS !== 'undefined'
      ? `https://unpkg.com/pdfjs-dist@${(PDFJS as any).version}/cmaps/`
      : null;
  private _imageResourcesPath =
    typeof PDFJS !== 'undefined'
      ? `https://unpkg.com/pdfjs-dist@${(PDFJS as any).version}/web/images/`
      : undefined;
  private _renderText = true;
  private _renderTextMode: RenderTextMode = RenderTextMode.ENABLED;
  private _stickToPage = false;
  private _originalSize = true;
  private _pdf: PDFDocumentProxy | undefined;
  private _page = 1;

  private _zoomScale: ZoomScale = 'page-width';
  private _rotation = 0;
  private _showAll = true;
  private _canAutoResize = true;
  private _fitToPage = false;
  private _externalLinkTarget = 'blank';
  private _showBorders = false;
  private lastLoaded!: string | Uint8Array | PDFSource | null;
  private _latestScrolledPage!: number;

  private pageScrollTimeout: number | null = null;
  private stickToPageTimeout: number | null = null;
  private isInitialized = false;
  private loadingTask?: PDFDocumentLoadingTask | null;
  private destroy$ = new Subject<void>();
  private updateSizeSub$: Subscription | null = null;
  private isUpdatingSize = false;
  private currentPageProxy: PDFPageProxy | null = null; // ✅ Add this to track page

  private renderTimeout: ReturnType<typeof setTimeout> | null = null;

  @Output('after-load-complete') afterLoadComplete =
    new EventEmitter<PDFDocumentProxy>();
  @Output('page-rendered') pageRendered = new EventEmitter<CustomEvent>();
  @Output('pages-initialized') pageInitialized =
    new EventEmitter<CustomEvent>();
  @Output('text-layer-rendered') textLayerRendered =
    new EventEmitter<CustomEvent>();
  @Output('error') onError = new EventEmitter<any>();
  @Output('on-progress') onProgress = new EventEmitter<PDFProgressData>();
  @Output() pageChange: EventEmitter<number> = new EventEmitter<number>(true);
  @Input() src?: string | Uint8Array | PDFSource;

  @Input('c-maps-url')
  set cMapsUrl(cMapsUrl: string) {
    this._cMapsUrl = cMapsUrl;
  }

  @Input('page')
  set page(_page: number | string | any) {
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

  @Input('render-text')
  set renderText(renderText: boolean) {
    this._renderText = renderText;
  }

  @Input('render-text-mode')
  set renderTextMode(renderTextMode: RenderTextMode) {
    this._renderTextMode = renderTextMode;
  }

  @Input('original-size')
  set originalSize(originalSize: boolean) {
    this._originalSize = originalSize;
  }

  @Input('show-all')
  set showAll(value: boolean) {
    this._showAll = value;
  }

  @Input('stick-to-page')
  set stickToPage(value: boolean) {
    this._stickToPage = value;
  }

  @Input()
  set zoom(value: number) {
    if (value <= 0) {
      return;
    }

    this.zoomService.zoom = value;
    this.zoomService.limitZoom();
  }
  get zoom(): number {
    return this.zoomService.zoom;
  }
  @Output() zoomChange = new EventEmitter<number>();

  @Input('zoom-scale')
  set zoomScale(value: ZoomScale) {
    this._zoomScale = value;
  }
  get zoomScale(): ZoomScale {
    return this._zoomScale;
  }

  @Input('rotation')
  set rotation(value: number) {
    if (!(typeof value === 'number' && value % 90 === 0)) {
      console.warn('Invalid pages rotation angle.');
      return;
    }

    this._rotation = value;
  }

  @Input('external-link-target')
  set externalLinkTarget(value: string) {
    this._externalLinkTarget = value;
  }

  @Input('autoresize')
  set autoresize(value: boolean) {
    this._canAutoResize = Boolean(value);
  }

  @Input('fit-to-page')
  set fitToPage(value: boolean) {
    this._fitToPage = Boolean(value);
  }

  @Input('show-borders')
  set showBorders(value: boolean) {
    this._showBorders = Boolean(value);
  }

  @Input() isWheelZoom = true;
  @Input() isWheelCtrlZoom = true;
  @Input() isOptimizeZoom = true;
  @Input('minZoom') set minZoom(value: number) {
    this.zoomService.minZoom = value;
    this.zoomService.limitZoom();
  }
  @Input('maxZoom') set maxZoom(value: number) {
    this.zoomService.maxZoom = value;
    this.zoomService.limitZoom();
  }
  @Input('enablePan') set enablePan(enablePan: boolean) {
    this.panService.enablePan = enablePan;

    const cursor = enablePan ? 'grab' : 'default';
    if (this.pdfViewerContainer?.nativeElement) {
      this.pdfViewerContainer.nativeElement.style.cursor = cursor;
    }
  }
  @Input() disableStream = false;
  @Input() disableRange = false;

  static getLinkTarget(type: string) {
    switch (type) {
      case 'blank':
        return (PDFJSViewer as any).LinkTarget.BLANK;
      case 'none':
        return (PDFJSViewer as any).LinkTarget.NONE;
      case 'self':
        return (PDFJSViewer as any).LinkTarget.SELF;
      case 'parent':
        return (PDFJSViewer as any).LinkTarget.PARENT;
      case 'top':
        return (PDFJSViewer as any).LinkTarget.TOP;
    }

    return null;
  }

  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly ngZone = inject(NgZone);
  private readonly zoomService = inject(ZoomService);
  protected readonly panService = inject(PanService);

  constructor() {
    if (isSSR()) {
      return;
    }

    let pdfWorkerSrc: string;

    const pdfJsVersion: string = (PDFJS as any).version;
    const versionSpecificPdfWorkerUrl: string = (window as any)[
      `pdfWorkerSrc${pdfJsVersion}`
    ];

    if (versionSpecificPdfWorkerUrl) {
      pdfWorkerSrc = versionSpecificPdfWorkerUrl;
    } else if (
      window.hasOwnProperty('pdfWorkerSrc') &&
      typeof (window as any).pdfWorkerSrc === 'string' &&
      (window as any).pdfWorkerSrc
    ) {
      pdfWorkerSrc = (window as any).pdfWorkerSrc;
    } else {
      pdfWorkerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfJsVersion}/legacy/build/pdf.worker.min.mjs`;
    }

    assign(GlobalWorkerOptions, 'workerSrc', pdfWorkerSrc);
  }

  ngAfterViewChecked(): void {
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
        this.ngOnChanges({ src: this.src } as any);
      });
    }
  }

  ngAfterViewInit(): void {
    this.zoomService.initSettings(
      this.pdfViewerContainer?.nativeElement,
      this.isWheelZoom,
      this.isWheelCtrlZoom
    );
  }

  ngOnInit(): void {
    this.initialize();
    this.setupResizeListener();
  }

  ngOnDestroy(): void {
    if (this.updateSizeSub$) {
      this.updateSizeSub$.unsubscribe();
    }

    this.destroy$.next();
    this.destroy$.complete();

    this.clear();
    this.zoomService.removeListeners(this.pdfViewerContainer?.nativeElement);
    this.loadingTask = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (isSSR() || !this.isVisible) {
      return;
    }

    if ('src' in changes) {
      console.log('### SRC');
      this.loadPDF();
    } else if (this._pdf) {
      console.log('### PDF');
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

      console.log('### UPDATE');
      this.update();
    }
  }

  updateSize(): void {
    if (this.isUpdatingSize) {
      return;
    }

    if (this.updateSizeSub$) {
      this.updateSizeSub$.unsubscribe();
    }

    this.isUpdatingSize = true;

    this.updateSizeSub$ = combineLatest([
      from(this._pdf!.getPage(this.pdfViewer.currentPageNumber)),
      this.zoomService.triggerUpdateSize$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([page]: [PDFPageProxy, void]) => {
          this.currentPageProxy = page; // Store for eventual cleanup on destroy

          // 1. Calculate the Target Scale
          let scale = this.zoomService.zoom;

          // Logic for auto-fitting (kept from your original code)
          // const rotation = this._rotation + page.rotate;
          // const viewportWidth = page.getViewport({ scale: this.zoomService.zoom, rotation }).width * PdfViewerComponent.CSS_UNITS;
          //
          // if (!this._originalSize || (this._fitToPage && viewportWidth > this.pdfViewerContainer?.nativeElement.clientWidth)) {
          //   const viewPort = page.getViewport({ scale: 1, rotation });
          //   scale = this.getScale(viewPort.width, viewPort.height);
          // }

          // 2. PERFORMANCE FIX: The "Visual Zoom" Trick
          // Instead of rendering immediately, we scale the container with CSS first.
          // This costs 0 memory and 0 CPU.

          const currentScale = this.pdfViewer.currentScale;
          const viewerContainer =
            this.pdfViewerContainer.nativeElement.querySelector(
              '.pdfViewer'
            ) as HTMLElement;

          if (viewerContainer) {
            // Calculate how much we need to stretch the CURRENT image to match the NEW scale
            const cssScale = scale / currentScale;
            viewerContainer.style.transform = `scale(${cssScale})`;
            viewerContainer.style.transformOrigin = 'top left';
          }

          // 3. DEBOUNCE: Clear any pending render tasks
          if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
          }

          // 4. Wait for the user to STOP zooming (e.g., 200ms) before doing the heavy work
          this.renderTimeout = setTimeout(() => {
            // if (viewerContainer) {
            //   // Remove the CSS stretch (so the canvas is sharp again)
            //   viewerContainer.style.transform = '';
            // }

            // Perform the expensive PDF Render
            this.pdfViewer.currentScale = scale;

            // Emit change
            this.zoomChange.emit(this.zoomService.zoom);
          }, 100);

          this.isUpdatingSize = false;
        },
        error: () => {
          this.isUpdatingSize = false;
        },
        complete: () => {
          this.isUpdatingSize = false;
        },
      });
  }

  clear(): void {
    if (this.pageScrollTimeout) {
      clearTimeout(this.pageScrollTimeout);
      this.pageScrollTimeout = null;
    }

    if (this.stickToPageTimeout) {
      clearTimeout(this.stickToPageTimeout);
      this.stickToPageTimeout = null;
    }

    if (this.loadingTask && !this.loadingTask.destroyed) {
      this.loadingTask.destroy();
    }

    // Clean up current page proxy
    if (this.currentPageProxy) {
      this.currentPageProxy.cleanup();
      this.currentPageProxy = null;
    }

    // Clean up PDFViewer which handles internal cleanup
    if (this.pdfViewer) {
      // Calling cleanup() on the viewer should handle page cleanup
      if (typeof (this.pdfViewer as any).cleanup === 'function') {
        (this.pdfViewer as any).cleanup();
      }
      this.pdfViewer.setDocument(null as any);
    }

    // Destroy PDF document - this should cascade cleanup
    if (this._pdf) {
      this._latestScrolledPage = 0;

      // Call destroy with force cleanup option if available
      this._pdf.destroy();
      this.pdfViewerContainer.nativeElement.outerHTML = '';
      this._pdf = undefined;
    }

    this.pdfLinkService && this.pdfLinkService.setDocument(null, null);
    this.pdfFindController && this.pdfFindController.setDocument(null as any);
  }

  private getPDFLinkServiceConfig(): {} {
    const linkTarget = PdfViewerComponent.getLinkTarget(
      this._externalLinkTarget
    );

    if (linkTarget) {
      return { externalLinkTarget: linkTarget };
    }

    return {};
  }

  private initEventBus(): void {
    this.eventBus = createEventBus(PDFJSViewer, this.destroy$);

    fromEvent<CustomEvent>(this.eventBus, 'pagerendered')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        this.pageRendered.emit(event);
      });

    fromEvent<CustomEvent>(this.eventBus, 'pagesinit')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        this.pageInitialized.emit(event);
      });

    fromEvent(this.eventBus, 'pagechanging')
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ pageNumber }: any) => {
        if (this.pageScrollTimeout) {
          clearTimeout(this.pageScrollTimeout);
        }

        this.pageScrollTimeout = window.setTimeout(() => {
          this._latestScrolledPage = pageNumber;
          this.pageChange.emit(pageNumber);
        }, 100);
      });

    fromEvent<CustomEvent>(this.eventBus, 'textlayerrendered')
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        this.textLayerRendered.emit(event);
      });
  }

  private initPDFServices(): void {
    this.pdfLinkService = new PDFJSViewer.PDFLinkService({
      eventBus: this.eventBus,
      ...this.getPDFLinkServiceConfig(),
    });
    this.pdfFindController = new PDFJSViewer.PDFFindController({
      eventBus: this.eventBus,
      linkService: this.pdfLinkService,
    });
  }

  private getPDFOptions(): PDFViewerOptions {
    return {
      eventBus: this.eventBus,
      container: this.element.nativeElement.querySelector('div')!,
      removePageBorders: !this._showBorders,
      linkService: this.pdfLinkService,
      textLayerMode: this._renderText
        ? this._renderTextMode
        : RenderTextMode.DISABLED,
      findController: this.pdfFindController,
      l10n: new PDFJSViewer.GenericL10n('en'),
      imageResourcesPath: this._imageResourcesPath,
      annotationEditorMode: PDFJS.AnnotationEditorType.DISABLE,
    };
  }

  private setupViewer(): void {
    if (this.pdfViewer) {
      this.pdfViewer.setDocument(null as any);
    }

    assign(PDFJS, 'disableTextLayer', !this._renderText);

    this.initPDFServices();

    if (this._showAll) {
      this.pdfViewer = new PDFJSViewer.PDFViewer(this.getPDFOptions());
    } else {
      this.pdfViewer = new PDFJSViewer.PDFSinglePageViewer(
        this.getPDFOptions()
      );
    }
    this.pdfLinkService.setViewer(this.pdfViewer);

    this.pdfViewer._currentPageNumber = this._page;
  }

  private getValidPageNumber(page: number): number {
    if (page < 1) {
      return 1;
    }

    if (page > this._pdf!.numPages) {
      return this._pdf!.numPages;
    }

    return page;
  }

  private getDocumentParams():
    | string
    | Uint8Array
    | DocumentInitParameters
    | undefined {
    const srcType = typeof this.src;

    if (!this._cMapsUrl) {
      return this.src;
    }

    const params: any = {
      cMapUrl: this._cMapsUrl,
      cMapPacked: true,
      enableXfa: true,
    };
    params.isEvalSupported = false; // http://cve.org/CVERecord?id=CVE-2024-4367

    if (srcType === 'string') {
      params.url = this.src;
    } else if (srcType === 'object') {
      if ((this.src as any).byteLength !== undefined) {
        params.data = this.src;
      } else {
        Object.assign(params, this.src);
      }
    }

    params.disableStream = this.disableStream;
    params.disableRange = this.disableRange;

    return params;
  }

  private loadPDF(): void {
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

    this.loadingTask!.onProgress = (progressData: PDFProgressData) => {
      this.onProgress.emit(progressData);
    };

    const src = this.src;

    from(this.loadingTask!.promise as Promise<PDFDocumentProxy>)
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

  private update(): void {
    this.page = this._page;

    this.render();
  }

  private render(): void {
    this._page = this.getValidPageNumber(this._page);

    // if (
    //   this._rotation !== 0 ||
    //   this.pdfViewer.pagesRotation !== this._rotation
    // ) {
    //   // wait until at least the first page is available.
    //   // ✅ Add takeUntil to prevent execution after destroy
    //   this.pdfViewer.firstPagePromise?.then(() => {
    //     if (!this.destroy$.closed) {
    //       // ✅ Check if not destroyed
    //       this.pdfViewer.pagesRotation = this._rotation;
    //     }
    //   });
    // }

    // if (this._stickToPage) {
    //   if (this.stickToPageTimeout) {
    //     clearTimeout(this.stickToPageTimeout);
    //   }

    //   this.stickToPageTimeout = window.setTimeout(() => {
    //     if (!this.destroy$.closed) {
    //       this.pdfViewer.currentPageNumber = this._page;
    //     }
    //     this.stickToPageTimeout = null;
    //   });
    // }

    if (!this.pdfViewer._pages?.length) {
      console.log('### UPDATE SIZE INIT');
      // the first time we wait until pages init
      const sub = this.pageInitialized
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          this.updateSize();
          sub.unsubscribe();
        });
    } else {
      console.log('### UPDATE SIZE RENDER');
      this.updateSize();
    }
  }

  private getScale(viewportWidth: number, viewportHeight: number): number {
    const borderSize = this._showBorders
      ? 2 * PdfViewerComponent.BORDER_WIDTH
      : 0;
    const pdfContainerWidth =
      this.pdfViewerContainer?.nativeElement.clientWidth - borderSize;
    const pdfContainerHeight =
      this.pdfViewerContainer?.nativeElement.clientHeight - borderSize;

    if (
      pdfContainerHeight === 0 ||
      viewportHeight === 0 ||
      pdfContainerWidth === 0 ||
      viewportWidth === 0
    ) {
      return 1;
    }

    let ratio = 1;
    switch (this._zoomScale) {
      case 'page-fit':
        ratio = Math.min(
          pdfContainerHeight / viewportHeight,
          pdfContainerWidth / viewportWidth
        );
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

  private resetPdfDocument(): void {
    this.pdfLinkService.setDocument(this._pdf, null);
    this.pdfFindController.setDocument(this._pdf!);
    this.pdfViewer.setDocument(this._pdf!);
  }

  private initialize(): void {
    if (isSSR() || !this.isVisible) {
      return;
    }

    this.isInitialized = true;
    this.initEventBus();
    this.setupViewer();
  }

  private setupResizeListener(): void {
    if (isSSR()) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      fromEvent(window, 'resize')
        .pipe(
          debounceTime(100),
          filter(() => this._canAutoResize && !!this._pdf),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          this.updateSize();
        });
    });
  }
}
