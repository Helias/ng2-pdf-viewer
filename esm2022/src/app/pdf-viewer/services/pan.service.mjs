import { Injectable } from '@angular/core';
import * as i0 from "@angular/core";
export class PanService {
    enablePan = false;
    isPanning = false;
    mouseStartX = 0;
    mouseStartY = 0;
    scrollLeft = 0;
    scrollTop = 0;
    startPan(event, container) {
        if (!this.enablePan) {
            return;
        }
        this.isPanning = true;
        this.mouseStartX = event.clientX;
        this.mouseStartY = event.clientY;
        this.scrollLeft = container.scrollLeft;
        this.scrollTop = container.scrollTop;
        container.style.cursor = 'grabbing';
        event.preventDefault();
    }
    endPan(container) {
        if (!this.enablePan) {
            return;
        }
        this.isPanning = false;
        container.style.cursor = 'grab';
    }
    pan(event, container) {
        if (!this.enablePan) {
            return;
        }
        if (!this.isPanning) {
            return;
        }
        const dx = event.clientX - this.mouseStartX;
        const dy = event.clientY - this.mouseStartY;
        container.scrollLeft = this.scrollLeft - dx;
        container.scrollTop = this.scrollTop - dy;
    }
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PanService, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PanService, providedIn: 'root' });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PanService, decorators: [{
            type: Injectable,
            args: [{
                    providedIn: 'root',
                }]
        }] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuLnNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvc2VydmljZXMvcGFuLnNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGVBQWUsQ0FBQzs7QUFLM0MsTUFBTSxPQUFPLFVBQVU7SUFDckIsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUVWLFNBQVMsR0FBRyxLQUFLLENBQUM7SUFDbEIsV0FBVyxHQUFHLENBQUMsQ0FBQztJQUNoQixXQUFXLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDZixTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBRXRCLFFBQVEsQ0FBQyxLQUFpQixFQUFFLFNBQXNCO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ25CLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztRQUVyQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUM7UUFFcEMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxNQUFNLENBQUMsU0FBc0I7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDbkIsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxHQUFHLENBQUMsS0FBaUIsRUFBRSxTQUFzQjtRQUMzQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNuQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNuQixPQUFPO1NBQ1I7UUFFRCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDNUMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQzVDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDNUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUM1QyxDQUFDO3VHQWhEVSxVQUFVOzJHQUFWLFVBQVUsY0FGVCxNQUFNOzsyRkFFUCxVQUFVO2tCQUh0QixVQUFVO21CQUFDO29CQUNWLFVBQVUsRUFBRSxNQUFNO2lCQUNuQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEluamVjdGFibGUgfSBmcm9tICdAYW5ndWxhci9jb3JlJztcblxuQEluamVjdGFibGUoe1xuICBwcm92aWRlZEluOiAncm9vdCcsXG59KVxuZXhwb3J0IGNsYXNzIFBhblNlcnZpY2Uge1xuICBlbmFibGVQYW4gPSBmYWxzZTtcblxuICBwcml2YXRlIGlzUGFubmluZyA9IGZhbHNlO1xuICBwcml2YXRlIG1vdXNlU3RhcnRYID0gMDtcbiAgcHJpdmF0ZSBtb3VzZVN0YXJ0WSA9IDA7XG4gIHByaXZhdGUgc2Nyb2xsTGVmdCA9IDA7XG4gIHByaXZhdGUgc2Nyb2xsVG9wID0gMDtcblxuICBzdGFydFBhbihldmVudDogTW91c2VFdmVudCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5lbmFibGVQYW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzUGFubmluZyA9IHRydWU7XG5cbiAgICB0aGlzLm1vdXNlU3RhcnRYID0gZXZlbnQuY2xpZW50WDtcbiAgICB0aGlzLm1vdXNlU3RhcnRZID0gZXZlbnQuY2xpZW50WTtcbiAgICB0aGlzLnNjcm9sbExlZnQgPSBjb250YWluZXIuc2Nyb2xsTGVmdDtcbiAgICB0aGlzLnNjcm9sbFRvcCA9IGNvbnRhaW5lci5zY3JvbGxUb3A7XG5cbiAgICBjb250YWluZXIuc3R5bGUuY3Vyc29yID0gJ2dyYWJiaW5nJztcblxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gIH1cblxuICBlbmRQYW4oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5lbmFibGVQYW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLmlzUGFubmluZyA9IGZhbHNlO1xuICAgIGNvbnRhaW5lci5zdHlsZS5jdXJzb3IgPSAnZ3JhYic7XG4gIH1cblxuICBwYW4oZXZlbnQ6IE1vdXNlRXZlbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZW5hYmxlUGFuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLmlzUGFubmluZykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGR4ID0gZXZlbnQuY2xpZW50WCAtIHRoaXMubW91c2VTdGFydFg7XG4gICAgY29uc3QgZHkgPSBldmVudC5jbGllbnRZIC0gdGhpcy5tb3VzZVN0YXJ0WTtcbiAgICBjb250YWluZXIuc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdCAtIGR4O1xuICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcCAtIGR5O1xuICB9XG59XG4iXX0=