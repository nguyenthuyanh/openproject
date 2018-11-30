import {Component,
  OnInit,
  ComponentFactoryResolver,
  ComponentRef,
  OnDestroy,
  Input} from "@angular/core";
import {GridResource} from "app/modules/hal/resources/grid-resource";
import {GridWidgetResource} from "app/modules/hal/resources/grid-widget-resource";
import {HookService} from "app/modules/plugins/hook-service";
import {debugLog} from "app/helpers/debug_output";
import {DomSanitizer} from "@angular/platform-browser";
import {CdkDragDrop, CdkDragEnter} from "@angular/cdk/drag-drop";
import {ResizeDelta} from "../common/resizer/resizer.component";
import {GridWidgetsService} from "core-app/modules/grids/widgets/widgets.service";
import {AddGridWidgetService} from "core-app/modules/grids/widgets/add/add.service";
import {AbstractWidgetComponent} from "core-app/modules/grids/widgets/abstract-widget.component";
import {GridArea} from "core-app/modules/grids/areas/grid-area";
import {GridWidgetArea} from "core-app/modules/grids/areas/grid-widget-area";

export interface WidgetRegistration {
  identifier:string;
  component:{ new (...args:any[]):AbstractWidgetComponent };
}

@Component({
  templateUrl: './grid.component.html',
  selector: 'grid'
})
export class GridComponent implements OnDestroy, OnInit {
  public uiWidgets:ComponentRef<any>[] = [];
  public widgetResources:GridWidgetResource[] = [];
  public numColumns:number = 0;
  public numRows:number = 0;
  public gridAreas:GridArea[];
  public gridWidgetAreas:GridWidgetArea[];
  public gridAreaDropIds:string[];
  public draggedArea:GridWidgetArea|null;
  public GRID_AREA_HEIGHT = 400;

  public resizeArea:GridArea|null;
  private mousedOverArea:GridArea|null;

  @Input() grid:GridResource;

  constructor(readonly resolver:ComponentFactoryResolver,
              readonly Hook:HookService,
              private sanitization:DomSanitizer,
              private widgetsService:GridWidgetsService,
              private addService:AddGridWidgetService) {}

  ngOnDestroy() {
    this.uiWidgets.forEach((widget) => widget.destroy());
  }

  ngOnInit() {
    this.numRows = this.grid.rowCount;
    this.numColumns = this.grid.columnCount;

    this.widgetResources = this.grid.widgets;

    this.buildAreas();
  }

  public widgetComponent(widget:GridWidgetResource|null) {
    if (!widget) {
      return null;
    }

    let registration = this.widgetsService.registered.find((reg) => reg.identifier === widget.identifier);

    if (!registration) {
      debugLog(`No widget registered with identifier ${widget.identifier}`);

      return null;
    } else {
      return registration.component;
    }
  }

  public get gridColumnStyle() {
    return this.sanitization.bypassSecurityTrustStyle(`repeat(${this.numColumns}, 1fr)`);
  }

  public get gridRowStyle() {
    return this.sanitization.bypassSecurityTrustStyle(`repeat(${this.numRows}, ${this.GRID_AREA_HEIGHT}px)`);
  }

  // array containing Numbers from 1 to this.numRows
  public get rowNumbers() {
    return Array.from(Array(this.numRows + 1).keys()).slice(1);
  }

  public get currentlyDragging() {
    return !!this.draggedArea;
  }

  public dragStart(area:GridWidgetArea) {
    this.draggedArea = area;
  }

  public dragStop() {
    this.draggedArea = null;
  }

  public drop(event:CdkDragDrop<GridArea>) {
    // this.draggedArea is already reset to null at this point
    if (event.previousContainer !== event.container) {
      let dropArea = event.container.data;
      let draggedArea = event.previousContainer.data as GridWidgetArea;

      draggedArea.startRow = dropArea.startRow;
      draggedArea.endRow = dropArea.startRow + draggedArea.widget.height;
      draggedArea.startColumn = dropArea.startColumn;
      draggedArea.endColumn = dropArea.startColumn + draggedArea.widget.width;

      this.gridWidgetAreas.forEach((area) => {
        area.widget.startRow = area.startRow;
        area.widget.endRow = area.endRow;
        area.widget.startColumn = area.startColumn;
        area.widget.endColumn = area.endColumn;
      });

      this.draggedArea = null;
      this.buildAreas();
    }
  }

  public dragEntered(event:CdkDragEnter<GridArea>) {
    if (this.draggedArea) {
      let dropArea = event.container.data;
      this.resetAreasOnDragging();
      this.updateAreasOnDragging(dropArea);
    }
  }

  private updateAreasOnDragging(dropArea:GridArea) {
    let widgetArea = this.draggedArea!;

    // we cannot use the widget's original area as moving it while dragging confuses cdkDrag
    let widget = widgetArea.widget;
    let placeholderArea = new GridWidgetArea(widget);

    placeholderArea.startRow = dropArea.startRow;
    placeholderArea.endRow = placeholderArea.startRow + widget.height;
    placeholderArea.startColumn = dropArea.startColumn;
    placeholderArea.endColumn = placeholderArea.startColumn + widget.width;

    this.moveAreasDown(placeholderArea, widgetArea);
  }

  private resetAreasOnDragging() {
    this.gridWidgetAreas.forEach((area) => {
      area.startRow = area.widget.startRow;
      area.endRow = area.widget.endRow;
      area.startColumn = area.widget.startColumn;
      area.endColumn = area.widget.endColumn;
    });
  }

  public resize(area:GridWidgetArea, deltas:ResizeDelta) {
    if (!this.resizeArea ||
        !this.mousedOverArea ||
        this.mousedOverArea === this.resizeArea) {
      return;
    }

    let widget = area.widget;

    widget.endRow = this.resizeArea.endRow;
    widget.endColumn = this.resizeArea.endColumn;

    this.buildAreas();

    return this.resizeArea = null;
  }

  public resizeStart(area:GridArea) {
    this.resizeArea = new GridArea(area.startRow,
                                   area.endRow,
                                   area.startColumn,
                                   area.endColumn);
  }

  public resizeMove(deltas:ResizeDelta) {
    if (!this.resizeArea ||
        !this.mousedOverArea ||
        this.mousedOverArea === this.resizeArea) {
      return;
    }

    this.resizeArea.endRow = this.mousedOverArea.endRow;
    this.resizeArea.endColumn = this.mousedOverArea.endColumn;
  }

  public isResizeTarget(area:GridArea) {
    if (!this.resizeArea) {
      return false;
    } else if (this.gridAreaDropIds.indexOf(this.gridAreaId(area)) >= 0) {
      return true;
    } else {
      return area.startRow >= this.resizeArea.startRow &&
             area.endRow <= this.resizeArea.endRow &&
             area.startColumn >= this.resizeArea.startColumn &&
             area.endColumn <= this.resizeArea.endColumn;
    }
  }

  public isAddable(area:GridArea) {
    return !this.currentlyDragging &&
             !this.currentlyResizing &&
             this.mousedOverArea === area &&
             this.gridAreaDropIds.includes(this.gridAreaId(area));
  }

  public get currentlyResizing() {
    return this.resizeArea;
  }

  public setMousedOverArea(area:GridArea) {
    this.mousedOverArea = area;
  }

  public gridAreaId(area:GridArea) {
    return `grid--area-${area.startRow}-${area.startColumn}`;
  }

  public addWidget(area:GridArea) {
    this
      .addService
      .select(area)
      .then((widgetResource) => {
        // TODO: We should use the proper resource here
        // but they are not casted as such when we get the
        // initial resources from the backend
        this.widgetResources.push(widgetResource);

        this.buildAreas();
      });
  }

  public removeWidget(area:GridWidgetArea) {
    let removedWidget = area.widget;

    this.widgetResources = this.widgetResources.filter((widget) => {
      return widget.identifier !== removedWidget.identifier ||
        widget.startColumn !== removedWidget.startColumn ||
        widget.endColumn !== removedWidget.endColumn ||
        widget.startRow !== removedWidget.startRow ||
        widget.endRow !== removedWidget.endRow;
    });

    this.buildAreas();
  }

  public addColumn(column:number) {
    this.numColumns++;

    this.widgetResources.filter((widget) => {
      return widget.startColumn > column;
    }).forEach((widget) => {
      widget.startColumn++;
      widget.endColumn++;
    });

    this.buildAreas();
  }

  public addRow(row:number) {
    this.numRows++;

    this.widgetResources.filter((widget) => {
      return widget.startRow > row;
    }).forEach((widget) => {
      widget.startRow++;
      widget.endRow++;
    });

    this.buildAreas();
  }

  public removeColumn(column:number) {
    this.numColumns--;

    // remove widgets that only span the removed column
    this.widgetResources = this.widgetResources.filter((widget) => {
      return !(widget.startColumn === column && widget.endColumn === column + 1);
    });

    //shrink widgets that span more than the removed column
    this.widgetResources.forEach((widget) => {
      if (widget.startColumn <= column && widget.endColumn >= column + 1) {
        //shrink widgets that span more than the removed column
        widget.endColumn--;
      }
    });

    // move all widgets that are after the removed column
    // so that they appear to keep their place.
    this.widgetResources.filter((widget) => {
      return widget.startColumn > column;
    }).forEach((widget) => {
      widget.startColumn--;
      widget.endColumn--;
    });

    this.buildAreas();
  }

  public removeRow(row:number) {
    this.numRows--;

    // remove widgets that only span the removed row
    this.widgetResources = this.widgetResources.filter((widget) => {
      return !(widget.startRow === row && widget.endRow === row + 1);
    });

    //shrink widgets that span more than the removed row
    this.widgetResources.forEach((widget) => {
      if (widget.startRow <= row && widget.endRow >= row + 1) {
        //shrink widgets that span more than the removed row
        widget.endRow--;
      }
    });

    // move all widgets that are after the removed row
    // so that they appear to keep their place.
    this.widgetResources.filter((widget) => {
      return widget.startRow > row;
    }).forEach((widget) => {
      widget.startRow--;
      widget.endRow--;
    });

    this.buildAreas();
  }

  private buildAreas() {
    this.gridAreas = this.buildGridAreas();
    this.gridAreaDropIds = this.buildGridAreaDropIds();
    this.gridWidgetAreas = this.buildGridWidgetAreas();
  }

  private addAreas(additionalAreas:GridArea[]) {
    this.gridAreas.push(...additionalAreas);

    this.gridAreaDropIds = this.buildGridAreaDropIds();
  }

  private buildGridAreas() {
    let cells:GridArea[] = [];

    for (let row = 1; row <= this.numRows; row++) {
      cells.push(...this.buildGridAreasRow(row));
    }

    return cells;
  }

  private buildGridAreasColumn(column:number) {
    let cells:GridArea[] = [];

    for (let row = 1; row <= this.numRows; row++) {
      let cell = new GridArea(row,
        row + 1,
        column,
        column + 1);

      cells.push(cell);
    }

    return cells;
  }

  private buildGridAreasRow(row:number) {
    let cells:GridArea[] = [];

    for (let column = 1; column <= this.numColumns; column++) {
      let cell = new GridArea(row,
        row + 1,
        column,
        column + 1);

      cells.push(cell);
    }

    return cells;
  }

  private buildGridWidgetAreas() {
    return this.widgetResources.map((widget) => {
      return new GridWidgetArea(widget);
    });
  }

  private widgetOfArea(row:number, column:number) {
    return this.widgetResources.find((resource) => resource.startRow === row && resource.startColumn === column);
  }

  public identifyGridArea(index:number, cell:GridArea) {
    return `gridArea ${cell.guid}`;
  }

  private gridAreaDropIdsWithoutSelf(area:GridArea) {
    let selfId = this.gridAreaId(area);

    return this.gridAreaDropIds.filter((areaId) => {
      return selfId !== areaId;
    });
  }

  private buildGridAreaDropIds() {
    let ids:string[] = [];

    this.gridAreas.forEach((area) => {
      ids.push(this.gridAreaId(area as GridArea));
    });

    return ids;
  }

  private doAreasOverlap(area:GridArea, otherArea:GridArea) {
    return area.doesContain(otherArea) ||
             otherArea.doesContain(area);
  }

  private moveAreasDown(movedArea:GridWidgetArea|null, ignoreArea:GridWidgetArea|null = null) {
    let movedAreas:GridWidgetArea[] = [];
    let remainingAreas:GridWidgetArea[] = this.gridWidgetAreas.slice(0);

    if (ignoreArea) {
      remainingAreas = remainingAreas.filter((area) => {
        return area.guid !== ignoreArea.guid;
      });
    }

    remainingAreas.sort((a, b) => {
      return b.startRow - a.startRow;
    });

    while (movedArea !== null) {
      movedAreas.push(movedArea!);

      remainingAreas = remainingAreas.filter((area) => {
        return area.guid !== movedArea!.guid;
      });

      movedArea = this.moveOneAreaDown(movedAreas, remainingAreas);
    }
  }

  private moveOneAreaDown(anchorAreas:GridWidgetArea[], movableAreas:GridWidgetArea[]) {
    let moveSpecification = this.firstAreaToMove(anchorAreas, movableAreas);

    if (moveSpecification) {
      let toMoveArea = moveSpecification[0] as GridWidgetArea;
      let anchorArea = moveSpecification[1] as GridWidgetArea;

      let areaHeight = toMoveArea.widget.height;

      toMoveArea.startRow = anchorArea.endRow;
      toMoveArea.endRow = toMoveArea.startRow + areaHeight;

      if (this.numRows < toMoveArea.endRow - 1) {
        this.numRows = toMoveArea.endRow - 1;
      }

      return toMoveArea;
    } else {
      return null;
    }
  }

  // Return first area that needs to move as it overlaps another area.
  // There are two groups of areas here. The first (anchorAreas) is considered stable
  // and as such not fit for being moved. This happens e.g. when the user explicitly
  // moved a widget or if the area has already been moved in a previous run of this method.
  // The second group (movableAreas) consists of all areas that are movable.
  // Once an area out of the second group has been identified that overlaps an area of the first
  // group, the appropriate reference area for later moving is selected out of the group of all
  // unmovable areas. The reference area is the bottommost area within the unmovable areas which's
  // column values (start/end) include the to move area's start column value and which's end row is larger
  // than the area overlapping the area to move. Unmovable areas which's column values do not include the
  // start column are to the left or right of the area to move and can thus be ignored.
  private firstAreaToMove(anchorAreas:GridArea[], movableAreas:GridArea[]) {
    let overlappingArea:GridArea|null = null;
    let toMoveArea:GridArea|null = null;

    movableAreas.forEach((movableArea) => {
      anchorAreas.forEach((anchorArea) => {
        if (this.doAreasOverlap(anchorArea, movableArea)) {
          overlappingArea = anchorArea;
          toMoveArea = movableArea;
          return;
        }
      });

      if (toMoveArea) {
        return;
      }
    });

    if (toMoveArea !== null) {
      let referenceArea = overlappingArea!;

      anchorAreas.forEach((anchorArea) => {
        if (anchorArea.endRow > referenceArea.endRow &&
            toMoveArea!.startColumn >= anchorArea.startColumn && toMoveArea!.startColumn < anchorArea.endColumn) {
          referenceArea = anchorArea;
        }
      });

      return [toMoveArea, referenceArea];
    } else {
      return null;
    }
  }
}