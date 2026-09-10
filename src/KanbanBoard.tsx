import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  StyleSheet,
  Dimensions,
  FlatList,
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import KanbanColumn from "./KanbanColumn";
import {
  KanbanBoardProps,
  DragData,
  KanbanCard,
  KanbanColumn as KanbanColumnType,
} from "./types";
import { KanbanThemeProvider, useKanbanTheme } from "./theme";
import { hexToRgba, responsiveSize, scheduleIdle, throttle } from "./utils";

const { width } = Dimensions.get("window");

// Wide screen (iPad / tablet): show multiple columns; mobile: single column (unchanged)
const TABLET_BREAKPOINT = 600;
const MAX_COLUMN_WIDTH = 380;

const KanbanBoardInner: React.FC<KanbanBoardProps> = ({
  board: initialBoard,
  onCardMove,
  onCardPress,
  onCardNotesPress,
  isCardNotesDisabled,
  renderCardActions,
  onCardAdd,
  renderAddButton,
  columnActions,
  onCardEdit,
  onCardDelete,
  enableDrag = true,
  enableAddCard = true,
  enableEditCard = true,
  enableDeleteCard = true,
  cardHeight = 120,
  columnWidth = width * 0.8 - 10, // Reduced by 10px
  showPriority = true,
  showAssignee = true,
  showDueDate = true,
  showTags = true,
  onChildStatusSelect,
  onLoadMore,
  getColumnLoadMoreState,
  emptyText = "No items",
}) => {
  const theme = useKanbanTheme();
  const styles = useMemo(() => createBoardStyles(theme), [theme]);
  const [board, setBoard] = useState(initialBoard);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [contentReady, setContentReady] = useState(false);
  const boardScrollX = useSharedValue(0);

  useEffect(() => {
    const task = scheduleIdle(() => setContentReady(true), { timeout: 100 });
    return () => task.cancel();
  }, []);

  const columnListRef = useRef<FlatList>(null);
  // When collapsing a group, scroll so the collapsed group column is in view (avoids ending on a "random" column)
  const scrollToGroupIdAfterCollapseRef = useRef<string | null>(null);

  const previousBoardIdRef = useRef<string>(initialBoard.id);
  const previousColumnIdsRef = useRef<string[]>(
    initialBoard.columns.map(col => col.id).sort()
  );
  const [currentVisibleGroup, setCurrentVisibleGroup] = useState<{
    groupId: string;
    title: string;
    cardCount: number;
  } | null>(null);

  // Column width: mobile = 90% (1 column); tablet/iPad = capped so 2–3 columns fit
  const getColumnWidth = () => {
    const screenWidth = Dimensions.get("window").width;
    if (screenWidth >= TABLET_BREAKPOINT) {
      return Math.min(screenWidth * 0.9, MAX_COLUMN_WIDTH);
    }
    return screenWidth * 0.9;
  };

  // Memoized flattened columns – single source per render to avoid new refs and re-renders
  const flattenedColumns = useMemo(
    () =>
      (() => {
        const flattened: Array<
          KanbanColumnType & {
            parentGroupId?: string;
            parentGroupTitle?: string;
            isLastInGroup?: boolean;
            isFirstInGroup?: boolean;
            groupMaxCards?: number;
          }
        > = [];
        board.columns.forEach((column) => {
          if (column.isGroup && expandedGroups.has(column.id)) {
            if (column.children && column.children.length > 0) {
              column.children.forEach((child, index) => {
                flattened.push({
                  ...child,
                  groupMaxCards: column.cards.length,
                  parentGroupId: column.id,
                  parentGroupTitle: column.title,
                  isFirstInGroup: index === 0,
                  isLastInGroup: index === column.children!.length - 1,
                });
              });
            }
          } else {
            flattened.push(column);
          }
        });
        return flattened;
      })(),
    [board.columns, expandedGroups]
  );

  const flattenedColumnsRef = useRef(flattenedColumns);
  flattenedColumnsRef.current = flattenedColumns;
  const boardRef = useRef(board);
  boardRef.current = board;

  // Helper function to update visible group based on scroll position (uses ref for latest flattened columns)
  const updateVisibleGroup = useCallback((currentScrollOffset: number) => {
    const columnWidthVal = getColumnWidth();
    const visibleColumnIndex = Math.round(currentScrollOffset / columnWidthVal);
    const cols = flattenedColumnsRef.current;

    if (visibleColumnIndex >= 0 && visibleColumnIndex < cols.length) {
      const visibleColumn = cols[visibleColumnIndex];
      
      // Check if this column belongs to a group
      if (visibleColumn.parentGroupId && visibleColumn.parentGroupTitle) {
        // Find the group column to get the total card count (use ref for throttled callback)
        const groupColumn = boardRef.current.columns.find(
          (col) => col.id === visibleColumn.parentGroupId
        );
        
        if (groupColumn) {
          setCurrentVisibleGroup({
            groupId: visibleColumn.parentGroupId,
            title: visibleColumn.parentGroupTitle,
            cardCount: groupColumn.cards.length,
          });
        } else {
          setCurrentVisibleGroup({
            groupId: visibleColumn.parentGroupId,
            title: visibleColumn.parentGroupTitle,
            cardCount: visibleColumn.groupMaxCards || 0,
          });
        }
      } else {
        // Not in a group, clear sticky header
        setCurrentVisibleGroup(null);
      }
    }
  }, []);

  // Initialize visible group on mount and when board/expanded groups change
  useEffect(() => {
    // Small delay to ensure board state is updated
    const timer = setTimeout(() => {
      if (boardScrollX) {
         updateVisibleGroup(boardScrollX.value);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [board, expandedGroups]);

  // When a group is collapsed, scroll so the collapsed group column is in view (prevents ending on a random column)
  useEffect(() => {
    const groupId = scrollToGroupIdAfterCollapseRef.current;
    if (!groupId) return;
    scrollToGroupIdAfterCollapseRef.current = null;
    const idx = flattenedColumns.findIndex((col) => col.id === groupId);
    if (idx < 0) return;
    const width = Math.max(getColumnWidth(), 1);
    columnListRef.current?.scrollToOffset({ offset: idx * width, animated: true });
  }, [flattenedColumns]);

  // Update board state when initialBoard prop changes
  // Only reset expanded groups if board structure actually changed (different board or columns)
  useEffect(() => {
    const currentBoardId = initialBoard.id;
    const currentColumnIds = initialBoard.columns.map(col => col.id).sort();
    
    // Check if board structure actually changed
    const boardIdChanged = previousBoardIdRef.current !== currentBoardId;
    const columnStructureChanged = 
      previousColumnIdsRef.current.length !== currentColumnIds.length ||
      previousColumnIdsRef.current.some((id, index) => id !== currentColumnIds[index]);
    
    // Only reset expanded groups if board structure changed, not just card moves
    if (boardIdChanged || columnStructureChanged) {
      setExpandedGroups(new Set());
      previousBoardIdRef.current = currentBoardId;
      previousColumnIdsRef.current = currentColumnIds;
    }
    
    // Always update board state to reflect latest card positions
    setBoard(initialBoard);
  }, [initialBoard]);

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
        scrollToGroupIdAfterCollapseRef.current = groupId;
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const animatedBoardStyle = useAnimatedStyle(() => {
    return {};
  });

  const throttledUpdateVisibleGroup = useMemo(
    () => throttle((offset: number) => updateVisibleGroup(offset), 150),
    [updateVisibleGroup]
  );

  // Stable list of stages for swipe navigation — same reference unless columns change
  const allStages = useMemo(
    () => flattenedColumns.map((col) => ({ id: col.id, title: col.title })),
    [flattenedColumns]
  );

  const handleCardMove = useCallback((dragData: DragData) => {
    // Helper to cleanup (no-op for swipe pattern)
    const cleanup = () => {
      // No cleanup needed for swipe pattern
    };

    // Validate drag data
    if (!dragData.sourceColumnId || !dragData.cardId) {

      cleanup();
      return;
    }

    // Handle target column mapping
    let targetColumnId = dragData.targetColumnId;
    const cols = flattenedColumns;

    if (targetColumnId && targetColumnId.startsWith("target-")) {
      const targetIndex = parseInt(targetColumnId.replace("target-", ""), 10);
      if (!isNaN(targetIndex) && targetIndex >= 0 && targetIndex < cols.length) {
        const resolvedColumn = cols[targetIndex];
        if (resolvedColumn && resolvedColumn.id) {
          targetColumnId = resolvedColumn.id;
        } else {

          cleanup();
          return;
        }
      } else {

        cleanup();
        return;
      }
    }

    // Validate targetColumnId exists
    if (!targetColumnId) {

      cleanup();
      return;
    }

    // Find the source and target columns in flattened list
    const sourceColumnIndex = cols.findIndex(
      (col) => col.id === dragData.sourceColumnId
    );
    const targetColumnIndex = cols.findIndex(
      (col) => col.id === targetColumnId
    );

    if (sourceColumnIndex === -1) {

      cleanup();
      return;
    }

    if (targetColumnIndex === -1) {

      cleanup();
      return;
    }

    const newBoard = { ...board };
    const sourceFlattenedColumn = cols[sourceColumnIndex];
    const targetFlattenedColumn = cols[targetColumnIndex];

    // Check if target is a collapsed group column
    // Find the actual target column in board.columns
    let targetGroupColumn: KanbanColumnType | undefined;
    for (let i = 0; i < board.columns.length; i++) {
      const col = board.columns[i];
      if (
        col.id === targetFlattenedColumn.id &&
        col.isGroup &&
        col.children &&
        col.children.length > 0
      ) {
        // Check if this group is collapsed (not expanded)
        if (!expandedGroups.has(col.id)) {
          targetGroupColumn = col;
          // If onChildStatusSelect callback exists, use it to show bottom sheet
          if (onChildStatusSelect) {
            onChildStatusSelect(dragData, col.id);
            cleanup();
            return; 
          } else {
            // If callback not provided, don't allow drop on collapsed group

            cleanup();
            return;
          }
        }
        break;
      }
    }

    // Find the actual column in board.columns (could be in a group's children)
    let sourceColumn: KanbanColumnType | undefined;
    let targetColumn: KanbanColumnType | undefined;
    let sourceColumnIndexInBoard = -1;
    let targetColumnIndexInBoard = -1;
    let isSourceInGroup = false;
    let isTargetInGroup = false;
    let sourceGroupIndex = -1;
    let targetGroupIndex = -1;
    let sourceChildIndex = -1;
    let targetChildIndex = -1;

    // Find source column
    for (let i = 0; i < board.columns.length; i++) {
      const col = board.columns[i];
      if (col.id === sourceFlattenedColumn.id) {
        sourceColumn = col;
        sourceColumnIndexInBoard = i;
        break;
      } else if (col.isGroup && col.children) {
        const childIndex = col.children.findIndex(
          (c) => c.id === sourceFlattenedColumn.id
        );
        if (childIndex !== -1) {
          sourceColumn = col.children[childIndex];
          sourceGroupIndex = i;
          sourceChildIndex = childIndex;
          isSourceInGroup = true;
          break;
        }
      }
    }

    // Find target column (skip if it's a collapsed group - already handled above)
    if (!targetGroupColumn) {
      for (let i = 0; i < board.columns.length; i++) {
        const col = board.columns[i];
        if (col.id === targetFlattenedColumn.id) {
          targetColumn = col;
          targetColumnIndexInBoard = i;
          break;
        } else if (col.isGroup && col.children) {
          const childIndex = col.children.findIndex(
            (c) => c.id === targetFlattenedColumn.id
          );
          if (childIndex !== -1) {
            targetColumn = col.children[childIndex];
            targetGroupIndex = i;
            targetChildIndex = childIndex;
            isTargetInGroup = true;
            break;
          }
        }
      }
    }

    if (!sourceColumn || (!targetColumn && !targetGroupColumn)) {
      cleanup();
      return;
    }

    // If target is a collapsed group, we should have already returned above
    // This code path is for regular moves
    if (!targetColumn) {
      cleanup();
      return;
    }

    const sourceColumnCopy = { ...sourceColumn };
    const targetColumnCopy = { ...targetColumn };

    // Validate source index is within bounds
    if (
      dragData.sourceIndex < 0 ||
      dragData.sourceIndex >= sourceColumnCopy.cards.length
    ) {

      cleanup();
      return;
    }

    // Remove card from source column
    const [movedCard] = sourceColumnCopy.cards.splice(dragData.sourceIndex, 1);

    // Validate that card was actually removed
    if (!movedCard) {
      cleanup();
      return;
    }

    // Update daysInStatus and updatedAt locally for immediate feedback
    // If the card was moved to a different column, reset daysInStatus
    if (dragData.sourceColumnId !== targetColumnId) {
      movedCard.daysInStatus = 0;
      movedCard.updatedAt = new Date().toISOString();
    }

    // Validate target index is within bounds
    const targetIndex =
      dragData.targetIndex !== undefined
        ? Math.max(0, Math.min(dragData.targetIndex, targetColumnCopy.cards.length))
        : targetColumnCopy.cards.length;
    
    // Add card to target column
    targetColumnCopy.cards.splice(targetIndex, 0, movedCard);

    // Update columns in board structure
    if (isSourceInGroup && sourceGroupIndex !== -1 && sourceChildIndex !== -1) {
      // Source is a child column within a group
      const group = { ...newBoard.columns[sourceGroupIndex] };
      if (group.children) {
        group.children = [...group.children];
        group.children[sourceChildIndex] = sourceColumnCopy;
        
        // Recalculate group's aggregated cards from all children (this removes the moved card)
        const allGroupLeads: KanbanCard[] = [];
        const seenCardIds = new Set<string>();
        group.children.forEach((child) => {
          child.cards.forEach((card) => {
            if (card.id && !seenCardIds.has(card.id)) {
              seenCardIds.add(card.id);
              allGroupLeads.push(card);
            }
          });
        });
        
    
        
        group.cards = allGroupLeads;
        newBoard.columns[sourceGroupIndex] = group;
      }
    } else if (sourceColumnIndexInBoard !== -1) {
      // Source is a regular column or a collapsed group column
      const sourceCol = newBoard.columns[sourceColumnIndexInBoard];
      if (sourceCol.isGroup && !expandedGroups.has(sourceCol.id)) {
        // Source is a collapsed group - card is directly in group.cards
        // The card has already been removed from sourceColumnCopy.cards
  
      }
      newBoard.columns[sourceColumnIndexInBoard] = sourceColumnCopy;
    }

    if (isTargetInGroup && targetGroupIndex !== -1 && targetChildIndex !== -1) {
      const group = { ...newBoard.columns[targetGroupIndex] };
      if (group.children) {
        group.children = [...group.children];
        group.children[targetChildIndex] = targetColumnCopy;
        // Also update group's aggregated cards (avoid duplicates)
        const allGroupLeads: KanbanCard[] = [];
        const seenCardIds = new Set<string>();
        group.children.forEach((child) => {
          child.cards.forEach((card) => {
            if (card.id && !seenCardIds.has(card.id)) {
              seenCardIds.add(card.id);
              allGroupLeads.push(card);
            }
          });
        });
        group.cards = allGroupLeads;
        newBoard.columns[targetGroupIndex] = group;
      }
    } else if (
      targetColumnIndexInBoard !== -1 &&
      sourceColumnIndexInBoard !== targetColumnIndexInBoard
    ) {
      newBoard.columns[targetColumnIndexInBoard] = targetColumnCopy;
    }

    setBoard(newBoard);

    // Call the parent callback with the move details
    if (onCardMove) {
      onCardMove({
        cardId: movedCard.id,
        sourceColumnId: dragData.sourceColumnId,
        targetColumnId: targetColumnId,
        sourceIndex: dragData.sourceIndex,
        targetIndex: targetIndex,
      });
    }

    // Clear floating card after move
    cleanup();
  }, [
    board,
    expandedGroups,
    flattenedColumns,
    onCardMove,
    onChildStatusSelect,
    setBoard,
  ]);

  const handleCardPress = useCallback(
    (card: KanbanCard) => {
      if (onCardPress) onCardPress(card);
    },
    [onCardPress]
  );

  const handleCardAdd = useCallback(
    (columnId: string) => {
      if (onCardAdd) onCardAdd(columnId);
    },
    [onCardAdd]
  );

  const handleCardEdit = useCallback(
    (card: KanbanCard) => {
      if (onCardEdit) onCardEdit(card);
    },
    [onCardEdit]
  );

  const handleCardDelete = useCallback(
    (cardId: string) => {
      if (onCardDelete) onCardDelete(cardId);
    },
    [onCardDelete]
  );

  const getTotalCards = () => {
    return flattenedColumns.reduce(
      (total, column) => total + column.cards.length,
      0
    );
  };

  // Guard: avoid 0 width (e.g. Dimensions not ready) which can cause blank list
  const colWidth = Math.max(getColumnWidth(), 1);

  const getColumnItemLayout = useCallback(
    (_: any, index: number) => ({
      length: colWidth,
      offset: colWidth * index,
      index,
    }),
    [colWidth]
  );

  const keyExtractor = useCallback(
    (item: KanbanColumnType & { parentGroupId?: string }, index: number) =>
      item.parentGroupId ? `${item.parentGroupId}-${item.id}-${index}` : `${item.id}-${index}`,
    []
  );

  const renderColumn = useCallback(
    ({ item: column, index: columnIndex }: { item: KanbanColumnType & { parentGroupId?: string; parentGroupTitle?: string; isFirstInGroup?: boolean; isLastInGroup?: boolean; groupMaxCards?: number }; index: number }) => {
      if (!column?.id) return null;
      const showStickyHeader =
        column.isFirstInGroup && column.parentGroupId;
      const showCollapseButton =
        column.isLastInGroup && column.parentGroupId;

      return (
        <View
          style={[
            styles.columnContainer,
            { width: colWidth, flex: 0 },
            column.parentGroupId && styles.groupParent,
            showStickyHeader && styles.groupParentHeader,
            showCollapseButton && styles.groupParentCollapseBtn,
          ]}
        >
          {column.parentGroupId && (
            <View style={styles.groupHeader}>
              {showStickyHeader && (
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: theme.heading, fontWeight: "600" }}>
                    {column.parentGroupTitle}
                  </Text>
                  <View style={styles.countBadge}>
                    <Text style={[styles.countText]}>
                      {column.groupMaxCards ?? 0}
                    </Text>
                  </View>
                </View>
              )}
              {showCollapseButton && (
                <View style={{ display: "flex", justifyContent: "flex-end", flexDirection: "row" }}>
                  <TouchableOpacity
                    onPress={() => handleToggleGroup(column.parentGroupId!)}
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Text style={{ color: theme.heading }}>Collapse</Text>
                    <MaterialIcons name="navigate-before" size={responsiveSize(18)} color={theme.heading} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <KanbanColumn
            column={column}
            columnIndex={columnIndex}
            totalColumns={flattenedColumns.length}
            columnWidth={colWidth}
            onCardMove={handleCardMove}
            onCardPress={onCardPress}
            onCardNotesPress={onCardNotesPress}
            isCardNotesDisabled={isCardNotesDisabled}
            renderCardActions={renderCardActions}
            onCardAdd={onCardAdd}
            renderAddButton={renderAddButton}
            columnActions={columnActions}
            onCardEdit={handleCardEdit}
            onCardDelete={handleCardDelete}
            enableDrag={enableDrag}
            enableAddCard={enableAddCard}
            enableEditCard={enableEditCard}
            enableDeleteCard={enableDeleteCard}
            cardHeight={cardHeight}
            showPriority={showPriority}
            parentScrollViewRef={columnListRef}
            showAssignee={showAssignee}
            showDueDate={showDueDate}
            showTags={showTags}
            isExpanded={column.isGroup ? expandedGroups.has(column.id) : undefined}
            onToggleExpand={column.isGroup ? () => handleToggleGroup(column.id) : undefined}
            parentGroupTitle={(column as any).parentGroupTitle}
            parentGroupId={(column as any).parentGroupId}
            onCollapseGroup={(column as any).parentGroupId ? (groupId: string) => handleToggleGroup(groupId) : undefined}
            isFirstInGroup={(column as any).isFirstInGroup}
            isLastInGroup={(column as any).isLastInGroup}
            groupMaxCards={(column as any).groupMaxCards}
            allStages={allStages}
            boardScrollX={boardScrollX}
            onLoadMore={onLoadMore}
            isLoadingMore={getColumnLoadMoreState?.(column.id)?.isLoadingMore ?? false}
            hasMoreData={getColumnLoadMoreState?.(column.id)?.hasMoreData ?? false}
            isLoading={getColumnLoadMoreState?.(column.id)?.isLoading ?? false}
            isRefreshing={getColumnLoadMoreState?.(column.id)?.isRefreshing ?? false}
            emptyText={emptyText}
          />
        </View>
      );
    },
    [
      colWidth,
      flattenedColumns.length,
      expandedGroups,
      handleToggleGroup,
      handleCardMove,
      onCardPress,
      onCardNotesPress,
      isCardNotesDisabled,
      renderCardActions,
      onCardAdd,
      renderAddButton,
      columnActions,
      handleCardEdit,
      handleCardDelete,
      enableDrag,
      enableAddCard,
      enableEditCard,
      enableDeleteCard,
      cardHeight,
      showPriority,
      showAssignee,
      showDueDate,
      showTags,
      allStages,
      boardScrollX,
      onLoadMore,
      getColumnLoadMoreState,
      emptyText,
    ]
  );

  if (!contentReady) {
    return <View style={{ flex: 1 }} />;
  }

  return (
    <Animated.View style={[styles.container, animatedBoardStyle]}>
      {/* Board Content - virtualized columns (~10-12 mounted) */}
      <FlatList
        ref={columnListRef}
        data={flattenedColumns}
        renderItem={renderColumn}
        keyExtractor={keyExtractor}
        getItemLayout={getColumnItemLayout}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardContent}
        style={styles.boardScrollView}
        scrollEnabled={true}
        bounces={false}
        decelerationRate="fast"
        snapToInterval={colWidth}
        snapToAlignment="start"
        onScroll={(event) => {
          boardScrollX.value = event.nativeEvent.contentOffset.x;
          throttledUpdateVisibleGroup(event.nativeEvent.contentOffset.x);
        }}
        scrollEventThrottle={32}
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={11}
        removeClippedSubviews={false}
        ListEmptyComponent={
          flattenedColumns.length === 0 ? (
            <View style={[styles.columnContainer, { width: colWidth, flex: 1, justifyContent: "center" }]}>
              <Text>No columns</Text>
            </View>
          ) : null
        }
      />
    </Animated.View>
  );
};

const createBoardStyles = (theme: ReturnType<typeof useKanbanTheme>) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    backgroundColor: theme.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.heading,
  },
  statsContainer: {
    flexDirection: "row",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
  },
  statText: {
    fontSize: 12,
    color: theme.muted,
    marginLeft: 4,
  },
  boardScrollView: {
    flex: 1,
  },
  boardContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  groupHeader: {
    width: "100%",
    paddingTop: responsiveSize(16),
    paddingHorizontal: responsiveSize(20),
    height: responsiveSize(45),
  },
  collapseButtonContainer: {
    width: "100%",
    paddingTop: responsiveSize(8),
    paddingHorizontal: responsiveSize(20),
    paddingBottom: responsiveSize(8),
    alignItems: "flex-end",
  },
  columnContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 0,
    zIndex: 1000,
    borderColor: theme.placeholder,
  },
  groupParent: {
    borderTopWidth: 3,
    borderStyle: "dashed",
    marginTop: responsiveSize(8),
    backgroundColor: hexToRgba(theme.placeholder, 0.1),
  },
  groupParentHeader: {
    borderLeftWidth: 3,
    borderStyle: "dashed",
    borderTopLeftRadius: responsiveSize(8),
  },
  groupParentCollapseBtn: {
    borderRightWidth: 3,
    borderStyle: "dashed",
    borderTopRightRadius: responsiveSize(8),
  },
  dragOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: hexToRgba(theme.black, 0.1),
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  dragCard: {
    backgroundColor: theme.card,
    padding: 16,
    borderRadius: 8,
    shadowColor: theme.black,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    maxWidth: 200,
  },
  dragCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.heading,
    marginBottom: 4,
  },
  dragCardDescription: {
    fontSize: 12,
    color: theme.muted,
  },
  floatingCardOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    elevation: 2000,
    pointerEvents: "none",
  },
  floatingCard: {
    backgroundColor: theme.card,
    padding: 14,
    borderRadius: 12,
    shadowColor: theme.black,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
    maxWidth: 260,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  floatingCardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: theme.heading,
    marginBottom: 4,
  },
  floatingCardDescription: {
    fontSize: 12,
    color: theme.muted,
    marginBottom: 4,
  },
  floatingCardAssignee: {
    fontSize: 11,
    color: theme.muted,
  },
  countBadge: {
    backgroundColor: hexToRgba(theme.placeholder, 0.1),
    paddingHorizontal: responsiveSize(8),
    paddingVertical: responsiveSize(2),
    borderRadius: responsiveSize(12),
  },
  countText: {
    fontSize: responsiveSize(12),
    color: theme.heading,
    fontWeight: "500",
  },
  stickyGroupHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2000,
    elevation: 2000,
    backgroundColor: theme.card,
    borderBottomWidth: responsiveSize(2),
    borderBottomColor: theme.border,
    paddingHorizontal: responsiveSize(20),
    paddingVertical: responsiveSize(12),
    shadowColor: theme.black,
    shadowOffset: {
      width: 0,
      height: responsiveSize(2),
    },
    shadowOpacity: 0.1,
    shadowRadius: responsiveSize(4),
  },
  stickyGroupContent: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  stickyGroupTitle: {
    fontWeight: "600",
  },
  stickyCollapseButton: {
    marginLeft: responsiveSize(8),
  },
});

const KanbanBoard: React.FC<KanbanBoardProps> = (props) => {
  if (props.theme) {
    return (
      <KanbanThemeProvider theme={props.theme}>
        <KanbanBoardInner {...props} />
      </KanbanThemeProvider>
    );
  }
  return <KanbanBoardInner {...props} />;
};

export default KanbanBoard;