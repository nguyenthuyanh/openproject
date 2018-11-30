import {Component, ElementRef, Inject, ChangeDetectorRef} from "@angular/core";
import {OpModalComponent} from "app/components/op-modals/op-modal.component";
import {WidgetRegistration} from "app/modules/grids/grid.component";
import {OpModalLocalsToken} from "app/components/op-modals/op-modal.service";
import {OpModalLocalsMap} from "app/components/op-modals/op-modal.types";
import {GridWidgetsService} from "app/modules/grids/widgets/widgets.service";

@Component({
  templateUrl: './add.modal.html'
})
export class AddGridWidgetModal extends OpModalComponent {

  // TODO: I18n
  text = { title: 'Choose widget',
           close_popup: 'Close',
           select: 'Select' };
  public chosenWidget:WidgetRegistration;

  constructor(readonly elementRef:ElementRef,
              @Inject(OpModalLocalsToken) readonly locals:OpModalLocalsMap,
              readonly cdRef:ChangeDetectorRef,
              readonly widgetsService:GridWidgetsService) {

    super(locals, cdRef, elementRef);
  }

  public get selectable() {
    return this.widgetsService.registered;
  }

  public select($event:any, widget:WidgetRegistration) {
    this.chosenWidget = widget;
    this.closeMe($event);
  }

  public trackWidgetBy(widget:WidgetRegistration) {
    return widget.identifier;
  }
}