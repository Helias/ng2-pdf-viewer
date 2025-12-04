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
    static ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PanService });
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "16.1.0", ngImport: i0, type: PanService, decorators: [{
            type: Injectable
        }] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuLnNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBwL3BkZi12aWV3ZXIvc2VydmljZXMvcGFuLnNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGVBQWUsQ0FBQzs7QUFHM0MsTUFBTSxPQUFPLFVBQVU7SUFDckIsU0FBUyxHQUFHLEtBQUssQ0FBQztJQUVWLFNBQVMsR0FBRyxLQUFLLENBQUM7SUFDbEIsV0FBVyxHQUFHLENBQUMsQ0FBQztJQUNoQixXQUFXLEdBQUcsQ0FBQyxDQUFDO0lBQ2hCLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFDZixTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBRXRCLFFBQVEsQ0FBQyxLQUFpQixFQUFFLFNBQXNCO1FBQ2hELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ25CLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBRXRCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQztRQUNqQyxJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDakMsSUFBSSxDQUFDLFVBQVUsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQztRQUVyQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUM7UUFFcEMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3pCLENBQUM7SUFFRCxNQUFNLENBQUMsU0FBc0I7UUFDM0IsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUU7WUFDbkIsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdkIsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ2xDLENBQUM7SUFFRCxHQUFHLENBQUMsS0FBaUIsRUFBRSxTQUFzQjtRQUMzQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNuQixPQUFPO1NBQ1I7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUNuQixPQUFPO1NBQ1I7UUFFRCxNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDNUMsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQzVDLFNBQVMsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDNUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUM1QyxDQUFDO3VHQWhEVSxVQUFVOzJHQUFWLFVBQVU7OzJGQUFWLFVBQVU7a0JBRHRCLFVBQVUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJbmplY3RhYmxlIH0gZnJvbSAnQGFuZ3VsYXIvY29yZSc7XG5cbkBJbmplY3RhYmxlKClcbmV4cG9ydCBjbGFzcyBQYW5TZXJ2aWNlIHtcbiAgZW5hYmxlUGFuID0gZmFsc2U7XG5cbiAgcHJpdmF0ZSBpc1Bhbm5pbmcgPSBmYWxzZTtcbiAgcHJpdmF0ZSBtb3VzZVN0YXJ0WCA9IDA7XG4gIHByaXZhdGUgbW91c2VTdGFydFkgPSAwO1xuICBwcml2YXRlIHNjcm9sbExlZnQgPSAwO1xuICBwcml2YXRlIHNjcm9sbFRvcCA9IDA7XG5cbiAgc3RhcnRQYW4oZXZlbnQ6IE1vdXNlRXZlbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZW5hYmxlUGFuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5pc1Bhbm5pbmcgPSB0cnVlO1xuXG4gICAgdGhpcy5tb3VzZVN0YXJ0WCA9IGV2ZW50LmNsaWVudFg7XG4gICAgdGhpcy5tb3VzZVN0YXJ0WSA9IGV2ZW50LmNsaWVudFk7XG4gICAgdGhpcy5zY3JvbGxMZWZ0ID0gY29udGFpbmVyLnNjcm9sbExlZnQ7XG4gICAgdGhpcy5zY3JvbGxUb3AgPSBjb250YWluZXIuc2Nyb2xsVG9wO1xuXG4gICAgY29udGFpbmVyLnN0eWxlLmN1cnNvciA9ICdncmFiYmluZyc7XG5cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICB9XG5cbiAgZW5kUGFuKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuZW5hYmxlUGFuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5pc1Bhbm5pbmcgPSBmYWxzZTtcbiAgICBjb250YWluZXIuc3R5bGUuY3Vyc29yID0gJ2dyYWInO1xuICB9XG5cbiAgcGFuKGV2ZW50OiBNb3VzZUV2ZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLmVuYWJsZVBhbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5pc1Bhbm5pbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBkeCA9IGV2ZW50LmNsaWVudFggLSB0aGlzLm1vdXNlU3RhcnRYO1xuICAgIGNvbnN0IGR5ID0gZXZlbnQuY2xpZW50WSAtIHRoaXMubW91c2VTdGFydFk7XG4gICAgY29udGFpbmVyLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQgLSBkeDtcbiAgICBjb250YWluZXIuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3AgLSBkeTtcbiAgfVxufVxuIl19