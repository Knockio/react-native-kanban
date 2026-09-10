import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  Text,
  Modal,
  ActivityIndicator,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import KanbanCard from './KanbanCard';
import { KanbanColumnProps, DragData } from './types';
import { useKanbanTheme } from './theme';
import { responsiveSize, hexToRgba, getTextColor } from './utils';

// Swipeable card component - Trello style
const SwipeableKanbanCard: React.FC<{
  card: any;
  index: number;
  cardHeight: number;
  columnIndex: number;
  totalColumns: number;
  columnId: string;
  columnWidth: number; // Column width for calculating multi-column movement
  enableDrag: boolean;
  enableEditCard: boolean;
  enableDeleteCard: boolean;
  showPriority: boolean;
  showAssignee: boolean;
  showDueDate: boolean;
  showTags: boolean;
  onCardMove: (dragData: DragData) => void;
  handleCardPress: (card: any) => void;
  handleCardNotesPress?: (card: any) => void;
  isCardNotesDisabled?: (card: any) => boolean;
  renderCardActions?: (card: any) => React.ReactNode;
  handleCardEdit: (card: any) => void;
  handleCardDelete: (cardId: string) => void;
  stages: any[]; // All columns/stages for navigation
  parentScrollViewRef?: React.RefObject<ScrollView | FlatList<any> | null>; // Board scroll ref (ScrollView or FlatList when columns virtualized)
  boardScrollX?: SharedValue<number>; // Board scroll position shared value
  /** When set, column uses a single shared Modal instead of one per card (better perf) */
  onShowFloatingCard?: (card: any) => void;
  onHideFloatingCard?: () => void;
  /** Shared Y position for floating card (column-owned so shared Modal can follow finger) */
  sharedFloatingCardY?: SharedValue<number>;
}> = ({
  card,
  index,
  cardHeight,
  columnIndex,
  totalColumns,
  columnId,
  columnWidth,
  enableDrag,
  enableEditCard,
  enableDeleteCard,
  showPriority,
  showAssignee,
  showDueDate,
  showTags,
  onCardMove,
  handleCardPress,
  handleCardNotesPress,
  isCardNotesDisabled,
  renderCardActions,
  handleCardEdit,
  handleCardDelete,
  stages,
  parentScrollViewRef,
  boardScrollX,
  onShowFloatingCard,
  onHideFloatingCard,
  sharedFloatingCardY: sharedFloatingCardYFromParent,
}) => {
    const translateX = useSharedValue(0);
    const startX = useSharedValue(0);
    const isScrolling = useSharedValue(false);
    const isHeld = useSharedValue(false); // Track if card is being held/dragged
    const floatingCardY = useSharedValue(0); // Y position for floating card (local fallback when no shared)
    const floatingCardYRef = sharedFloatingCardYFromParent ?? floatingCardY; // Use shared so column Modal follows finger

    // Screen width for edge/center zones: left/right corners = scroll board, center = drop on column under finger
    const screenWidthPx = Dimensions.get('window').width;
    const EDGE_ZONE_RATIO = 0.18; // 18% of screen on each side triggers scroll
    const [showFloatingCard, setShowFloatingCard] = useState(false);
    const useSharedModal = Boolean(onShowFloatingCard && onHideFloatingCard);

    const showFloatingCardPreview = useCallback(() => {
      if (onShowFloatingCard) onShowFloatingCard(card);
      else setShowFloatingCard(true);
    }, [onShowFloatingCard, card]);
    const hideFloatingCardPreview = useCallback(() => {
      if (onHideFloatingCard) onHideFloatingCard();
      else setShowFloatingCard(false);
    }, [onHideFloatingCard]);

    // Use shared values for variables accessed from both worklets and JS thread
    // This avoids the "object passed to worklet" serialization issue with refs
    const lastScrolledColumnSV = useSharedValue(columnIndex);
    const swipeStartColumnSV = useSharedValue(columnIndex);
    const swipeDirectionSV = useSharedValue(0); // 1 for right, -1 for left, 0 for none

    // Keep interval ref (only accessed from JS thread)
    const autoScrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMovingCard = useRef<boolean>(false); // Guard to prevent multiple card moves
    const theme = useKanbanTheme();
    const styles = useMemo(() => createColumnStyles(theme), [theme]);
    const green = theme.swipeForward;
    const red = theme.swipeBack;

    // (show/hide are defined above with shared-modal branching)

    // Function to reset move guard (called from worklet via runOnJS)
    const resetMoveGuard = () => {
      isMovingCard.current = false;
    };

    // Function to handle swipe end with guard check (called from worklet via runOnJS)
    const handleSwipeEndWithGuard = (translationX: number, wasAutoScrolling: boolean) => {
      if (!isMovingCard.current) {
        handleSwipeEnd(translationX, wasAutoScrolling);
      } else {

      }
    };

    // Get current scroll position and calculate visible column
    const getVisibleColumnIndex = (): number => {
      if (!parentScrollViewRef?.current) {
        return columnIndex; // Fallback to current column
      }

      try {
        // Get scroll position from the scroll view
        // Since we can't directly read scroll position in worklet, we'll use a different approach
        // We'll track scroll position via the boardScrollX shared value passed from parent
        // For now, calculate based on swipe distance
        return columnIndex;
      } catch (error) {
        return columnIndex;
      }
    };

    // Scroll the board to a specific column (one at a time, smooth snap)
    const scrollToColumn = (targetColumnIndex: number) => {
      if (!parentScrollViewRef?.current || !boardScrollX) {
        return;
      }

      // Clamp target column to valid range
      const clampedIndex = Math.max(0, Math.min(targetColumnIndex, totalColumns - 1));
      const currentLastColumn = lastScrolledColumnSV.value;

      // Don't scroll if already at this column (but allow if it's different)
      if (clampedIndex === currentLastColumn) {
        return;
      }

      try {
        // Calculate the scroll position for this column
        const targetScrollX = clampedIndex * columnWidth;

        // Update last scrolled column FIRST (before any async operations)
        const previousColumn = lastScrolledColumnSV.value;
        lastScrolledColumnSV.value = clampedIndex;


        // Update shared value immediately
        boardScrollX.value = targetScrollX;

        // Scroll smoothly to the target column (FlatList uses scrollToOffset, ScrollView uses scrollTo)
        const ref = parentScrollViewRef.current as any;
        if (ref?.scrollToOffset) {
          ref.scrollToOffset({ offset: targetScrollX, animated: true });
        } else if (ref?.scrollTo) {
          ref.scrollTo({ x: targetScrollX, animated: true });
        }

      } catch (error) {

      }
    };

    // Auto-scroll to next/previous column
    const autoScrollToNextColumn = () => {
      if (!swipeDirectionSV.value) {
        stopAutoScroll();
        return;
      }

      // Use state value which is more reliable in intervals (or fallback to ref)
      const currentColumn = lastScrolledColumnSV.value;
      const nextColumn = currentColumn + swipeDirectionSV.value;
      const clampedNext = Math.max(0, Math.min(nextColumn, totalColumns - 1));

      // Stop if we've reached the boundary (can't move further)
      if (clampedNext === currentColumn) {
        stopAutoScroll();
        return;
      }

      // Scroll to the next column
      scrollToColumn(clampedNext);
    };

    // Start auto-scrolling columns
    const startAutoScroll = (direction: number) => {

      // Clear any existing interval
      stopAutoScroll();

      swipeDirectionSV.value = direction;

      // changing direction continues from the current column instead of
      // jumping back to the original swipeStartColumn
      const currentBaseColumn = lastScrolledColumnSV.value;

      // Scroll to first adjacent column immediately (from the current base)
      const firstColumn = currentBaseColumn + direction;
      const clampedFirst = Math.max(0, Math.min(firstColumn, totalColumns - 1));

      // Only scroll if it's a valid move
      if (clampedFirst !== currentBaseColumn) {
        scrollToColumn(clampedFirst);
      } else {
        // If we can't move in this direction, don't start auto-scroll
        return;
      }

      // Then continue auto-scrolling every 0.8 seconds
      autoScrollInterval.current = setInterval(() => {
        // Always read fresh values from shared values
        const currentCol = lastScrolledColumnSV.value;
        const dir = swipeDirectionSV.value;

        if (!dir) {
          stopAutoScroll();
          return;
        }

        const nextCol = currentCol + dir;
        const clampedNext = Math.max(0, Math.min(nextCol, totalColumns - 1));



        if (clampedNext === currentCol) {
          stopAutoScroll();
          return;
        }

        scrollToColumn(clampedNext);
      }, 800); // 0.8 second delay (500ms + 300ms)
    };

    // Stop auto-scrolling
    const stopAutoScroll = () => {
      if (autoScrollInterval.current) {

        clearInterval(autoScrollInterval.current);
        autoScrollInterval.current = null;
      }
      swipeDirectionSV.value = 0;
    };

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        stopAutoScroll();
      };
    }, []);

    // Get the currently visible/centered column index based on scroll position
    const getCurrentVisibleColumn = (): number => {
      if (!boardScrollX) {
        return columnIndex; // Fallback
      }

      // Calculate which column is centered based on scroll position
      const currentScroll = boardScrollX.value;
      const visibleColumnIndex = Math.round(currentScroll / columnWidth);
      return Math.max(0, Math.min(visibleColumnIndex, stages.length - 1));
    };

    /** Get target column index from finger's absolute X (screen coord). Used when dropping in center zone. */
    const getTargetColumnFromAbsoluteX = (absoluteX: number): number => {
      if (!boardScrollX || !stages?.length) return columnIndex;
      // Content X = position in scrollable content under the finger (viewport left ≈ 0 when full width)
      const contentX = absoluteX + boardScrollX.value;
      const target = Math.floor(contentX / columnWidth);
      return Math.max(0, Math.min(target, stages.length - 1));
    };

    // Move card to stage function
    const moveCardToStage = (targetStageId: string, targetStageIndex: number) => {
      if (!targetStageId) return;

      const dragData: DragData = {
        cardId: card.id,
        sourceColumnId: columnId,
        sourceIndex: index,
        targetColumnId: targetStageId,
        targetIndex: 0, // Always add to top of target column
      };

      onCardMove(dragData);
    };

    /** Drop card on the column under finger (center zone). Called from worklet via runOnJS. */
    const handleDropInCenter = (absoluteX: number) => {
      if (isMovingCard.current || !stages?.length) return;
      const targetColumnIndex = getTargetColumnFromAbsoluteX(absoluteX);
      if (targetColumnIndex === columnIndex) return;
      const targetStage = stages[targetColumnIndex];
      if (!targetStage?.id) return;
      isMovingCard.current = true;
      moveCardToStage(targetStage.id, targetColumnIndex);
      setTimeout(() => { isMovingCard.current = false; }, 1000);
    };

    // Handle swipe end - move card to currently visible column
    const handleSwipeEnd = (translationX: number, wasAutoScrolling: boolean = false) => {
      // Guard: Prevent multiple card moves
      if (isMovingCard.current) {

        return;
      }

      const SWIPE_THRESHOLD = 50; // Minimum swipe to trigger movement



      if (Math.abs(translationX) < SWIPE_THRESHOLD && !wasAutoScrolling) {

        return; // Didn't swipe far enough
      }

      // Validate stages array
      if (!stages || stages.length === 0) {

        return;
      }

      // Get target column: use tracked column if auto-scrolling was active, otherwise calculate from scroll
      let targetColumnIndex: number;
      if (wasAutoScrolling) {
        // Use the last scrolled column (more reliable when auto-scrolling)
        targetColumnIndex = lastScrolledColumnSV.value;

      } else {
        // Calculate from scroll position (for manual swipes)
        targetColumnIndex = getCurrentVisibleColumn();

      }



      // Don't move if target is the same as current
      if (targetColumnIndex === columnIndex) {

        return;
      }

      // Validate target index
      if (targetColumnIndex >= 0 && targetColumnIndex < stages.length) {
        const targetStage = stages[targetColumnIndex];
        if (targetStage && targetStage.id) {
          // Set guard to prevent duplicate moves
          isMovingCard.current = true;



          moveCardToStage(targetStage.id, targetColumnIndex);

          // Reset guard after a short delay to allow move to complete
          setTimeout(() => {
            isMovingCard.current = false;
          }, 1000); // 1 second should be enough for the move to complete
        } else {

        }
      } else {

      }
    };

    // Gesture handler - Trello style horizontal swipe with board scrolling
    // Requires 500ms hold before swipe becomes active
    const panGesture = Gesture.Pan()
      .activateAfterLongPress(500) // Must hold for 0.5 seconds before drag activates
      .onStart((event) => {

        startX.value = translateX.value;
        isScrolling.value = false;
        isHeld.value = true; // Card is now being held
        // Set initial Y position for floating card (shared ref so column Modal follows finger)
        floatingCardYRef.value = event.absoluteY - 100; // Offset to center card above finger
        runOnJS(showFloatingCardPreview)();
        // Reset move guard when starting new swipe
        runOnJS(resetMoveGuard)();
        // Reset tracking when starting new swipe (use shared values for worklet access)
        swipeStartColumnSV.value = columnIndex;
        lastScrolledColumnSV.value = columnIndex;
        // Stop any existing auto-scroll
        runOnJS(stopAutoScroll)();
      })
      .onUpdate((event) => {
        // Update floating card Y position to follow finger (shared ref so column Modal follows)
        floatingCardYRef.value = event.absoluteY - 100; // Offset to center card above finger
        const SWIPE_THRESHOLD = 50; // Card cap when in edge zones (scroll mode)
        const w = screenWidthPx;
        const leftEdge = w * EDGE_ZONE_RATIO;
        const rightEdge = w * (1 - EDGE_ZONE_RATIO);
        const absoluteX = event.absoluteX;

        // Left corner: scroll board left (previous column)
        if (absoluteX < leftEdge) {
          translateX.value = startX.value - SWIPE_THRESHOLD;
          if (!isScrolling.value) {
            isScrolling.value = true;
            runOnJS(startAutoScroll)(-1);
          }
          return;
        }
        // Right corner: scroll board right (next column)
        if (absoluteX > rightEdge) {
          translateX.value = startX.value + SWIPE_THRESHOLD;
          if (!isScrolling.value) {
            isScrolling.value = true;
            runOnJS(startAutoScroll)(1);
          }
          return;
        }
        // Center of screen: stop scroll, card follows finger (drop on column under finger on release)
        if (isScrolling.value) {
          isScrolling.value = false;
          runOnJS(stopAutoScroll)();
        }
        translateX.value = startX.value + event.translationX;
      })
      .onEnd((event) => {
        const SWIPE_THRESHOLD = 50;
        const wasAutoScrolling = isScrolling.value;

        isScrolling.value = false;
        isHeld.value = false; // Card is no longer being held
        runOnJS(hideFloatingCardPreview)();

        // Stop auto-scrolling
        runOnJS(stopAutoScroll)();

        if (wasAutoScrolling) {
          // User held in left/right corner: move card to the column we scrolled to
          const effectiveTranslation = event.translationX > 0 ? SWIPE_THRESHOLD : -SWIPE_THRESHOLD;
          runOnJS(handleSwipeEndWithGuard)(effectiveTranslation, true);
        } else {
          // User was in center: drop on the column under finger (if different from source)
          runOnJS(handleDropInCenter)(event.absoluteX);
        }

        // Spring back to original position
        translateX.value = withSpring(0, {
          damping: 15,
          stiffness: 200,
        });
      })
      .activeOffsetX([-10, 10]) // Only activate on horizontal movement (both directions)
      .failOffsetY([-10, 10]); // Fail if vertical movement is too much (prioritize horizontal)

    // Animated style for card movement and hover effect
    const animatedStyle = useAnimatedStyle(() => {
      const scale = withSpring(isHeld.value ? 1.04 : 1, {
        damping: 12,
        stiffness: 180,
      });

      return {
        transform: [
          { translateX: translateX.value },
          { scale },
          { rotate: isHeld.value ? '-1deg' : '0deg' }, // Slight tilt when held
        ],
        // Elevation/shadow effect when held
        shadowColor: isHeld.value ? theme.dragHighlight : theme.black, // Blue shadow when held
        shadowOffset: {
          width: 0,
          height: isHeld.value ? 10 : 2,
        },
        shadowOpacity: withSpring(isHeld.value ? 0.35 : 0.1, {
          damping: 12,
          stiffness: 180,
        }),
        shadowRadius: withSpring(isHeld.value ? 16 : 4, {
          damping: 12,
          stiffness: 180,
        }),
        elevation: isHeld.value ? 15 : 2,
        zIndex: isHeld.value ? 999 : 1,
        // Border effect when held
        borderWidth: isHeld.value ? 2 : 0,
        borderColor: theme.dragHighlight,
      };
    });

    // Green opacity overlay (swipe right)
    const greenOpacity = useAnimatedStyle(() => {
      return {
        opacity: translateX.value > 0 ? Math.min(translateX.value / 400, 1) : 0,
        borderRadius: 10,
      };
    });

     // Red opacity overlay (swipe left)
    const redOpacity = useAnimatedStyle(() => {
      return {
        opacity: translateX.value < 0 ? Math.min(-translateX.value / 400, 1) : 0,
        borderRadius: 10,
      };
    });

    // Get screen dimensions for floating card positioning
    const screenHeight = Dimensions.get('window').height;
    const screenHeightSV = useSharedValue(screenHeight);

    // Floating card preview style (follows finger position)
    const floatingCardStyle = useAnimatedStyle(() => {
      // Clamp Y position to keep card visible on screen (with some padding)
      const minY = 50;
      const maxY = screenHeightSV.value - 200;
      const clampedY = Math.max(minY, Math.min(floatingCardY.value, maxY));

      return {
        position: 'absolute',
        top: clampedY,
        transform: [
          {
            scale: withSpring(1, {
              damping: 15,
              stiffness: 200,
            }),
          },
        ],
      };
    });

  // Get screen dimensions for floating card positioning
  const screenWidth = Dimensions.get('window').width;
  // Moving card width: mobile = full width minus padding; iPad/tab = capped so it doesn't dominate
  const TABLET_BREAKPOINT = 600;
  const MAX_FLOATING_CARD_WIDTH = 400;
  const floatingCardWidth =
    screenWidth >= TABLET_BREAKPOINT
      ? Math.min(screenWidth - 32, MAX_FLOATING_CARD_WIDTH)
      : screenWidth - 32;

   
    return (
      <View style={{ alignItems: 'stretch', marginBottom: 8, width: '100%' }}>
        {enableDrag ? (
          <>
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.cardContainer,
                animatedStyle,
              ]}
            >
              {/* Card content - rendered first so overlays appear on top */}
              <View style={{ zIndex: 1 }}>
                <KanbanCard
                  card={card}
                  onPress={() => handleCardPress(card)}
                  onNotesPress={handleCardNotesPress ? () => handleCardNotesPress(card) : undefined}
                  notesDisabled={isCardNotesDisabled?.(card) === true}
                  cardActions={renderCardActions?.(card)}
                  onEdit={enableEditCard ? () => handleCardEdit(card) : undefined}
                  onDelete={enableDeleteCard ? () => handleCardDelete(card.id) : undefined}
                  isDragging={false}
                  cardHeight={cardHeight}
                  showPriority={showPriority}
                  showAssignee={showAssignee}
                  showDueDate={showDueDate}
                  showTags={showTags}
                />
              </View>
              {/* Green overlay for swipe right */}
              <Animated.View
                style={[
                  styles.gradientOverlay,
                  greenOpacity,
                  { backgroundColor: green },
                ]}
                pointerEvents="none"
              />
              {/* Red overlay for swipe left */}
              <Animated.View
                style={[
                  styles.gradientOverlay,
                  redOpacity,
                  { backgroundColor: red },
                ]}
                pointerEvents="none"
              />
            </Animated.View>
          </GestureDetector>

          {/* Per-card Modal only when column does not use shared Modal (better perf: one Modal per column) */}
          {!useSharedModal && (
          <Modal
            visible={showFloatingCard}
            transparent={true}
            animationType="slide"
            statusBarTranslucent={true}
            hardwareAccelerated={true}
          >
            <View style={styles.floatingCardModalContainer} pointerEvents="box-none">
              <Animated.View
                style={[
                  styles.floatingCardPreview,
                  floatingCardStyle,
                  { width: floatingCardWidth },
                ]}
                pointerEvents="none"
              >
                <View style={styles.floatingCardContent}>
                  <View style={styles.floatingCardIcon}>
                    <MaterialIcons name="drag-indicator" size={24} color={theme.dragHighlight} />
                  </View>
                  <View style={styles.floatingCardInfo}>
                    <Text style={styles.floatingCardLabel}>Moving card</Text>
                    <Text style={styles.floatingCardTitle} numberOfLines={1}>
                      {card.title || card.description || `Card #${card.id}`}
                    </Text>
                  </View>
                  <View style={styles.floatingCardDirection}>
                    <MaterialIcons 
                      name="swap-horiz" 
                      size={28} 
                      color={theme.dragHighlight} 
                    />
                  </View>
                </View>
                <Text style={styles.floatingCardHint}>
                  Hold near left/right edge to scroll • Center to drop on column
                </Text>
              </Animated.View>
            </View>
          </Modal>
          )}
          </>
        ) : (
          <KanbanCard
            card={card}
            onPress={() => handleCardPress(card)}
            onNotesPress={handleCardNotesPress ? () => handleCardNotesPress(card) : undefined}
            notesDisabled={isCardNotesDisabled?.(card) === true}
            cardActions={renderCardActions?.(card)}
            cardHeight={cardHeight}
            showPriority={showPriority}
          />
        )}
      </View>
    );
  };

const KanbanColumn: React.FC<KanbanColumnProps & {
  allStages?: Array<{ id: string; title: string }>; // All columns for swipe navigation
  boardScrollX?: SharedValue<number>; // Board scroll position shared value
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  groupMaxCards?: number;
  onLoadMore?: (columnId: string) => void;
  isLoadingMore?: boolean;
  hasMoreData?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  emptyText?: string;
}> = ({
  column,
  columnIndex,
  totalColumns,
  columnWidth,
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
  cardHeight = 94,
  showPriority = true,
  showAssignee = true,
  showDueDate = true,
  showTags = true,
  parentScrollViewRef,
  isExpanded,
  onToggleExpand,
  parentGroupTitle,
  parentGroupId,
  onCollapseGroup,
  isFirstInGroup = false,
  isLastInGroup = false,
  groupMaxCards,
  allStages = [], // All columns/stages for swipe navigation
  boardScrollX, // Board scroll position
  onLoadMore,
  isLoadingMore = false,
  hasMoreData = false,
  isLoading = false,
  isRefreshing = false,
  emptyText = "No items",
}) => {
    const theme = useKanbanTheme();
    const styles = useMemo(() => createColumnStyles(theme), [theme]);
    const scrollViewRef = useRef<ScrollView>(null);
    const currentScrollY = useRef<number>(0);
    const [floatingCard, setFloatingCard] = useState<{ card: any } | null>(null);
    const sharedFloatingCardY = useSharedValue(0);

    const screenHeight = Dimensions.get('window').height;
    const floatingCardPositionStyle = useAnimatedStyle(() => {
      const minY = 50;
      const maxY = screenHeight - 200;
      const clampedY = Math.max(minY, Math.min(sharedFloatingCardY.value, maxY));
      return {
        position: 'absolute' as const,
        top: clampedY,
        left: 0,
        right: 0,
        alignItems: 'center' as const,
      };
    });

    const handleCardPress = useCallback(
      (card: any) => {
        if (onCardPress) onCardPress(card);
      },
      [onCardPress]
    );

    const handleCardNotesPress = useCallback(
      (card: any) => {
        if (onCardNotesPress) onCardNotesPress(card);
      },
      [onCardNotesPress]
    );

  const handleEndReached = useCallback(() => {
    if (onLoadMore && hasMoreData && !isLoadingMore && column.cards.length > 0) {
      onLoadMore(column.id);
    }
  }, [onLoadMore, hasMoreData, isLoadingMore, column.cards.length, column.id]);

  const handleShowFloatingCard = useCallback((card: any) => setFloatingCard({ card }), []);
  const handleHideFloatingCard = useCallback(() => setFloatingCard(null), []);

  const handleCardEdit = useCallback(
    (card: any) => {
      if (onCardEdit) onCardEdit(card);
    },
    [onCardEdit]
  );

  const handleCardDelete = useCallback(
    (cardId: string) => {
      if (enableDeleteCard && onCardDelete) {
        Alert.alert(
          'Delete Card',
          'Are you sure you want to delete this card?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onCardDelete(cardId) },
          ]
        );
      }
    },
    [enableDeleteCard, onCardDelete]
  );

  // Fixed item height for getItemLayout (card + marginBottom 8) — avoids layout thrash during scroll
  const ITEM_HEIGHT = cardHeight + 8;
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [ITEM_HEIGHT]
  );

  const renderCardRow = useCallback(
    ({ item: card, index }: { item: any; index: number }) => (
      <SwipeableKanbanCard
        card={card}
        index={index}
        cardHeight={cardHeight}
        columnIndex={columnIndex}
        totalColumns={totalColumns}
        columnId={column.id}
        columnWidth={columnWidth}
        enableDrag={enableDrag}
        enableEditCard={enableEditCard}
        enableDeleteCard={enableDeleteCard}
        showPriority={showPriority}
        showAssignee={showAssignee}
        showDueDate={showDueDate}
        showTags={showTags}
        onCardMove={onCardMove}
        handleCardPress={handleCardPress}
        handleCardNotesPress={handleCardNotesPress}
        isCardNotesDisabled={isCardNotesDisabled}
        renderCardActions={renderCardActions}
        handleCardEdit={handleCardEdit}
        handleCardDelete={handleCardDelete}
        stages={allStages}
        parentScrollViewRef={parentScrollViewRef}
        boardScrollX={boardScrollX}
        onShowFloatingCard={handleShowFloatingCard}
        onHideFloatingCard={handleHideFloatingCard}
        sharedFloatingCardY={sharedFloatingCardY}
      />
    ),
    [
      cardHeight,
      columnIndex,
      totalColumns,
      column.id,
      columnWidth,
      enableDrag,
      enableEditCard,
      enableDeleteCard,
      showPriority,
      showAssignee,
      showDueDate,
      showTags,
      onCardMove,
      handleCardPress,
      handleCardNotesPress,
      isCardNotesDisabled,
      renderCardActions,
      handleCardEdit,
      handleCardDelete,
      allStages,
      parentScrollViewRef,
      boardScrollX,
      handleShowFloatingCard,
      handleHideFloatingCard,
      sharedFloatingCardY,
    ]
  );

    // const handleAddLeadPress = () => {
    //   // Get statusId from column originalData or column id
    //   const statusId = column.originalData?.workspaceLeadStatusId ||
    //     (column.id ? parseInt(column.id, 10) : null);

    //   if (statusId) {
    //     // Clear Redux state before navigation to ensure clean form
    //     dispatch(clearAllContacts());
    //     dispatch(clearAllAssignees());
    //     dispatch(clearAllTags());
    //     dispatch(clearAddress());
    //     dispatch(setName(""));

    //     // Try to get boardId from navigation state (if we're in BoardDetailScreen)
    //     const state = navigation.getState();
    //     const boardDetailRoute = state.routes.find(
    //       (route: any) => route.name === "BoardDetailScreen"
    //     );
    //     const boardId = boardDetailRoute?.params?.boardId;

    //     // Navigate to LeadCreate screen with statusId and boardId
    //     navigation.navigate("LeadStack", {
    //       screen: "LeadCreate",
    //       params: {
    //         statusId: statusId,
    //         previousScreen: "BoardDetailScreen",
    //         boardId: boardId,
    //       },
    //     });
    //   }
    // };

    return (
      <View style={[
        styles.container,
        {
          backgroundColor: column.color ? hexToRgba(column.color, 0.2) : theme.background,
          // marginRight: columnIndex === totalColumns - 1 ? responsiveSize(50) : 0,
          // marginLeft: columnIndex === totalColumns - 1 ? responsiveSize(30) : 0,
          width: columnWidth - 10,
        },
      ]}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flex: 1 }}>
            <View style={styles.titleContainer} >
              <View style={[
                styles.titleBadge,
                {
                  backgroundColor: column.color,
                },
              ]}>
                <Text style={[styles.title, { color: getTextColor(column.color!) }]}>{column.title}</Text>
              </View>
             <View style={[
                styles.countBadge,
                {
                  backgroundColor: column.color ? `${column.color}` : theme.lightPrimary,
                },
              ]}>
                <Text style={[styles.countText, { color: getTextColor(column.color!) || theme.daysBadgeText }]}>
                 {column?.maxCards ?? 0}
                </Text>
              </View>  
              
            </View>
            {/* Collapse/Expand button for group columns */}
            {column.isGroup && onToggleExpand && (
              <TouchableOpacity onPress={onToggleExpand} style={styles.expandButton}>
                <MaterialIcons
                  name={isExpanded ? "navigate-before" : "navigate-next"}
                  size={responsiveSize(20)}
                  color={column.color || theme.muted}
                />
              </TouchableOpacity>
            )}
            {/* Column actions: map columnActions when provided; else renderAddButton; else default add button */}
            {enableAddCard && !column.isGroup && (
              columnActions && columnActions.length > 0 ? (
                <View style={styles.columnActionsRow}>
                  {columnActions.map((action) => (
                    <View key={action.id}>
                      {action.render({ columnId: column.id, column })}
                    </View>
                  ))}
                </View>
              ) : null
            )}
          </View>
        </View>

      <View style={styles.cardsContainer}>
        {(isLoading || isRefreshing) && (
          <View style={styles.columnLoaderOverlay} pointerEvents="none">
            <ActivityIndicator
              size="small"
              color={column.color || theme.muted}
              style={styles.columnLoader}
            />
          </View>
        )}
        <FlatList
          data={column.cards}
          keyExtractor={(item, index) =>
            `${column.id}-${item.id || `item-${index}`}-${index}`
          }
          renderItem={renderCardRow}
          getItemLayout={getItemLayout}
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          windowSize={7}
          initialNumToRender={6}
          style={styles.cardsList}
          contentContainerStyle={[
            styles.cardsContent,
            column.cards.length === 0 && !isLoading && !isRefreshing && styles.cardsContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isLoading}
          onScroll={(event) => {
            currentScrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={50}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            !isLoading && !isRefreshing ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="inbox" size={48} color={theme.emptyIcon} />
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.loadMoreFooter}>
                <ActivityIndicator size="small" color={column.color || theme.muted} />
              </View>
            ) : hasMoreData && onLoadMore && !parentGroupId ? (
              <View style={styles.loadMoreFooter}>
                <TouchableOpacity
                  onPress={() => onLoadMore(column.id)}
                  style={[
                    styles.loadMoreButton,
                    { backgroundColor: column.color ? hexToRgba(column.color, 0.25) : theme.primary + '20' },
                  ]}
                >
                  <MaterialIcons
                    name="add-circle-outline"
                    size={responsiveSize(18)}
                    color={column.color || theme.primary}
                  />
                  <Text
                    style={[styles.loadMoreButtonText, { color: column.color || theme.primary }]}
                   
                  >
                    Load more
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />

        {/* Fixed Load more button for group columns so it's always visible (group child columns) */}
        {parentGroupId && hasMoreData && onLoadMore && !isLoadingMore && (
          <View style={styles.loadMoreFooterFixed}>
            <TouchableOpacity
              onPress={() => onLoadMore(column.id)}
              style={[
                styles.loadMoreButton,
                { backgroundColor: column.color ? hexToRgba(column.color, 0.25) : theme.primary + '20' },
              ]}
            >
              <MaterialIcons
                name="add-circle-outline"
                size={responsiveSize(18)}
                color={column.color || theme.primary}
              />
              <Text
                style={[styles.loadMoreButtonText, { color: column.color || theme.primary }]}
               
              >
                Load more
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Single shared Modal for floating card (one per column instead of per card) */}
      {floatingCard && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          statusBarTranslucent
          hardwareAccelerated
        >
          <View style={styles.floatingCardModalContainer} pointerEvents="box-none">
            <Animated.View style={floatingCardPositionStyle} pointerEvents="none">
              <View style={[styles.floatingCardPreview, { width: Dimensions.get('window').width >= 600 ? Math.min(Dimensions.get('window').width - 32, 400) : Dimensions.get('window').width - 32 }]}>
                <View style={styles.floatingCardContent}>
                  <View style={styles.floatingCardIcon}>
                    <MaterialIcons name="drag-indicator" size={24} color={theme.dragHighlight} />
                  </View>
                  <View style={styles.floatingCardInfo}>
                    <Text style={styles.floatingCardLabel}>Moving card</Text>
                    <Text style={styles.floatingCardTitle} numberOfLines={1}>
                      {floatingCard.card?.title || floatingCard.card?.description || `Card #${floatingCard.card?.id}`}
                    </Text>
                  </View>
                  <View style={styles.floatingCardDirection}>
                    <MaterialIcons name="swap-horiz"
                      size={28}
                      color={theme.dragHighlight}
                    />
                  </View>
                </View>
                <Text style={styles.floatingCardHint}>
                  Hold near left/right edge to scroll • Center to drop on column
                </Text>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const createColumnStyles = (theme: ReturnType<typeof useKanbanTheme>) => StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: responsiveSize(2),
    marginTop: responsiveSize(10),
    borderRadius: responsiveSize(8),
    padding: responsiveSize(8),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: responsiveSize(6),
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: responsiveSize(13),
    fontWeight: '500',
    color: theme.heading,
    // marginRight: responsiveSize(8),
  },
  titleBadge: {
    paddingHorizontal: responsiveSize(8),
    paddingVertical: responsiveSize(4),
    borderRadius: responsiveSize(12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: responsiveSize(8),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  countBadge: {
    backgroundColor: theme.lightPrimary,
    paddingHorizontal: responsiveSize(8),
    paddingVertical: responsiveSize(2),
    borderRadius: responsiveSize(12),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  countText: {
    fontSize: responsiveSize(12),
    color: theme.daysBadgeText,
    fontWeight: '500',
  },
  expandButton: {
    padding: responsiveSize(8),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: responsiveSize(8),
  },
  columnActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSize(8),
    marginLeft: responsiveSize(8),
  },
  addButton: {
    padding: responsiveSize(8),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: responsiveSize(8),
    borderRadius: responsiveSize(12),
    width: responsiveSize(30),
    height: responsiveSize(30),
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: theme.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  cardsContainer: {
    flex: 1,
    minHeight: responsiveSize(120),
    position: 'relative',
  },
  cardsList: {
    flex: 1,
  },
  columnLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: hexToRgba(theme.background, 0.6),
    zIndex: 10,
  },
  columnLoader: {
    marginVertical: responsiveSize(16),
  },
  cardsContent: {
    padding: responsiveSize(4),
    paddingBottom: responsiveSize(12),
    alignItems: 'stretch',
  },
  cardsContentEmpty: {
    flexGrow: 1,
  },
  loadMoreFooter: {
    paddingVertical: responsiveSize(12),
    paddingHorizontal: responsiveSize(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSize(6),
    paddingVertical: responsiveSize(8),
    paddingHorizontal: responsiveSize(14),
    borderRadius: responsiveSize(8),
    width: '100%',
  },
  loadMoreButtonText: {
    fontSize: responsiveSize(13),
    fontWeight: '600',
  },
  loadMoreFooterFixed: {
    paddingVertical: responsiveSize(8),
    paddingHorizontal: responsiveSize(8),
    borderTopWidth: 1,
    borderTopColor: hexToRgba(theme.black, 0.06),
    backgroundColor: hexToRgba(theme.background, 0.95),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: responsiveSize(40),
  },
  emptyText: {
    fontSize: responsiveSize(14),
    color: theme.muted,
  },
  cardContainer: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 10,
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    borderRadius: 10,
  },
  // Floating card modal container - fills screen but allows touch pass-through
  floatingCardModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  // Floating card preview styles
  floatingCardPreview: {
    backgroundColor: theme.background,
    borderRadius: responsiveSize(12),
    padding: responsiveSize(12),
    marginHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: theme.dragHighlight,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
    borderWidth: 2,
    borderColor: theme.dragHighlight,
  },
  floatingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingCardIcon: {
    width: responsiveSize(40),
    height: responsiveSize(40),
    borderRadius: responsiveSize(20),
    backgroundColor: theme.lightPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: responsiveSize(12),
  },
  floatingCardInfo: {
    flex: 1,
  },
  floatingCardLabel: {
    fontSize: responsiveSize(11),
    color: theme.dragHighlight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: responsiveSize(2),
  },
  floatingCardTitle: {
    fontSize: responsiveSize(15),
    fontWeight: '600',
    color: theme.text,
  },
  floatingCardDirection: {
    width: responsiveSize(40),
    height: responsiveSize(40),
    borderRadius: responsiveSize(20),
    backgroundColor: theme.lightPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingCardHint: {
    fontSize: responsiveSize(12),
    color: theme.muted,
    textAlign: 'center',
    marginTop: responsiveSize(8),
  },
});

const KanbanColumnMemo = React.memo(KanbanColumn);
KanbanColumnMemo.displayName = 'KanbanColumn';
export default KanbanColumnMemo;