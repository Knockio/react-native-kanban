import type { FlatList, ScrollView } from "react-native";
import type React from "react";
import type { KanbanTheme } from "./theme";

export interface KanbanCardContact {
  email?: string;
  phoneNumber?: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  daysInStatus?: number;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  assignee?: string | string[];
  dueDate?: string;
  updatedAt?: string;
  createdAt?: string;
  tags?: string[];
  color?: string;
  primaryContact?: string;
  primaryContactId?: string;
  primaryContactName?: string;
  isPrimaryContactBlocked?: boolean;
  campaignName?: string;
  source?: string;
  contact?: KanbanCardContact[];
  originalData?: unknown;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  color?: string;
  maxCards?: number;
  isGroup?: boolean;
  isExpanded?: boolean;
  children?: KanbanColumn[];
  originalData?: unknown;
}

export interface KanbanBoard {
  id: string;
  title: string;
  columns: KanbanColumn[];
  timeFormat?: string;
}

export interface DragData {
  cardId: string;
  sourceColumnId: string;
  targetColumnId?: string;
  sourceIndex: number;
  targetIndex?: number;
}

export interface ColumnAction {
  id: string;
  render: (params: {
    columnId: string;
    column: KanbanColumn;
  }) => React.ReactNode;
}

export interface ColumnLoadMoreState {
  isLoadingMore: boolean;
  hasMoreData: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
}

export interface KanbanBoardProps {
  board: KanbanBoard;
  onCardMove: (dragData: DragData) => void;
  onCardPress?: (card: KanbanCard) => void;
  onCardNotesPress?: (card: KanbanCard) => void;
  isCardNotesDisabled?: (card: KanbanCard) => boolean;
  renderCardActions?: (card: KanbanCard) => React.ReactNode;
  onCardAdd?: (columnId: string) => void;
  renderAddButton?: (params: {
    columnId: string;
    column: KanbanColumn;
  }) => React.ReactNode;
  columnActions?: ColumnAction[];
  onCardEdit?: (card: KanbanCard) => void;
  onCardDelete?: (cardId: string) => void;
  enableDrag?: boolean;
  enableAddCard?: boolean;
  enableEditCard?: boolean;
  enableDeleteCard?: boolean;
  cardHeight?: number;
  columnWidth?: number;
  showPriority?: boolean;
  showAssignee?: boolean;
  showDueDate?: boolean;
  showTags?: boolean;
  onLoadMore?: (columnId: string) => void;
  getColumnLoadMoreState?: (columnId: string) => ColumnLoadMoreState;
  onChildStatusSelect?: (dragData: DragData, groupColumnId: string) => void;
  emptyText?: string;
  theme?: Partial<KanbanTheme>;
}

export interface KanbanColumnProps {
  column: KanbanColumn;
  columnIndex: number;
  totalColumns: number;
  columnWidth: number;
  onCardMove: (dragData: DragData) => void;
  onCardPress?: (card: KanbanCard) => void;
  onCardNotesPress?: (card: KanbanCard) => void;
  isCardNotesDisabled?: (card: KanbanCard) => boolean;
  renderCardActions?: (card: KanbanCard) => React.ReactNode;
  onCardAdd?: (columnId: string) => void;
  renderAddButton?: (params: {
    columnId: string;
    column: KanbanColumn;
  }) => React.ReactNode;
  columnActions?: ColumnAction[];
  onCardEdit?: (card: KanbanCard) => void;
  onCardDelete?: (cardId: string) => void;
  onDragPositionChange?: (position: {
    x: number;
    y: number;
    card: any;
  }) => void;
  enableDrag?: boolean;
  enableAddCard?: boolean;
  enableEditCard?: boolean;
  enableDeleteCard?: boolean;
  cardHeight?: number;
  showPriority?: boolean;
  showAssignee?: boolean;
  showDueDate?: boolean;
  showTags?: boolean;
  parentScrollViewRef?: React.RefObject<ScrollView | FlatList<any> | null>;
  currentScrollX?: React.MutableRefObject<number>;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  parentGroupTitle?: string;
  parentGroupId?: string;
  onCollapseGroup?: (groupId: string) => void;
  emptyText?: string;
}

export interface KanbanCardProps {
  card: KanbanCard;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onNotesPress?: () => void;
  notesDisabled?: boolean;
  cardActions?: React.ReactNode;
  isDragging?: boolean;
  cardHeight?: number;
  showPriority?: boolean;
  showAssignee?: boolean;
  showDueDate?: boolean;
  showTags?: boolean;
}
