import React, { useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { KanbanCardProps } from "./types";
import { useKanbanTheme } from "./theme";
import {
  formatCardDate,
  getCampaignPillColors,
  getSourcePillColors,
  hexToRgba,
  responsiveSize,
  trimText,
} from "./utils";

const KanbanCard: React.FC<KanbanCardProps> = ({
  card,
  onPress,
  onNotesPress,
  notesDisabled = false,
  cardActions,
  isDragging = false,
  showAssignee = true,
}) => {
  const theme = useKanbanTheme();
  const styles = useMemo(() => createKanbanCardStyles(theme), [theme]);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (!isDragging) {
      scale.value = withSpring(0.96, {
        damping: 20,
        stiffness: 400,
        mass: 0.5,
      });
    }
  };

  const handlePressOut = () => {
    if (!isDragging) {
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 400,
        mass: 0.5,
      });
    }
  };

  const handleLongPress = () => {
    if (!isDragging) {
      scale.value = withSpring(1.06, {
        damping: 18,
        stiffness: 450,
        mass: 0.6,
      });
    }
  };

  const getAssigneeInitials = (assigneeName: string) => {
    if (assigneeName && assigneeName !== "Unassigned") {
      const names = assigneeName.split(" ");
      if (names.length >= 2) {
        return `${names[0][0]}${names[1][0]}`.toUpperCase();
      }
      return assigneeName.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  const normalizedDaysInStatus = Number(card.daysInStatus);
  const hasDaysInStatus =
    Number.isFinite(normalizedDaysInStatus) && normalizedDaysInStatus >= 0;

  const sourcePillColors = useMemo(
    () => (card.source ? getSourcePillColors(card.source, theme) : null),
    [card.source, theme]
  );
  const campaignPillColors = useMemo(
    () => (card.campaignName ? getCampaignPillColors(theme) : null),
    [card.campaignName, theme]
  );

  const getAssignees = () => {
    if (!card.assignee || card.assignee === "Unassigned") {
      return [];
    }
    if (typeof card.assignee === "string") {
      return [card.assignee];
    }
    if (Array.isArray(card.assignee)) {
      return card.assignee;
    }
    return [];
  };

  const renderAssigneeAvatars = () => {
    const assignees = getAssignees();
    if (assignees.length === 0) return null;

    const maxVisible = 3;
    const visibleAssignees = assignees.slice(0, maxVisible);
    const remainingCount = assignees.length - maxVisible;

    return (
      <View style={styles.assigneeContainer}>
        {visibleAssignees.map((assignee, index) => (
          <View
            key={index}
            style={[
              styles.assigneeAvatar,
              {
                marginLeft: index > 0 ? -8 : 0,
                zIndex: maxVisible - index,
              },
            ]}
          >
            <Text style={styles.assigneeInitials}>
              {getAssigneeInitials(assignee)}
            </Text>
          </View>
        ))}
        {remainingCount > 0 && (
          <View
            style={[styles.assigneeAvatar, styles.overflowAvatar, { marginLeft: -8 }]}
          >
            <Text style={styles.overflowText}>+{remainingCount}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderContactInfo = () => {
    if (!card.contact || card.contact.length === 0) return null;

    return (
      <View style={styles.contactContainer}>
        {card.contact.map((contact, index) => {
          if (contact.email) {
            return (
              <Text key={`email-${index}`} style={styles.mainText} numberOfLines={1}>
                {contact.email}
              </Text>
            );
          }
          if (contact.phoneNumber) {
            return (
              <Text key={`phone-${index}`} style={styles.mainText} numberOfLines={1}>
                {contact.phoneNumber}
              </Text>
            );
          }
          return null;
        })}
      </View>
    );
  };

  const formattedDate = formatCardDate(card.updatedAt || card.createdAt);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        activeOpacity={0.8}
      >
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            {card?.title ? (
              <View style={styles.titleRow}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {trimText(card.title, 20)}
                </Text>
                {hasDaysInStatus && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{normalizedDaysInStatus}D</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.dashIndicator} />
            )}
          </View>
          {!!cardActions && (
            <View style={styles.headerActions}>{cardActions}</View>
          )}
        </View>

        {card.description ? (
          <Text style={styles.mainText} numberOfLines={3}>
            {card.description}
          </Text>
        ) : (
          renderContactInfo()
        )}

        {(!!card.source || !!card.campaignName) && (
          <View style={styles.metaRow}>
            {!!card.source && sourcePillColors && (
              <View
                style={[
                  styles.metaPill,
                  { backgroundColor: sourcePillColors.backgroundColor },
                ]}
              >
                <Text
                  style={[styles.metaPillText, { color: sourcePillColors.color }]}
                  numberOfLines={1}
                >
                  {`Source: ${card.source}`}
                </Text>
              </View>
            )}
            {!!card.campaignName && campaignPillColors && (
              <View
                style={[
                  styles.metaPill,
                  { backgroundColor: campaignPillColors.backgroundColor },
                ]}
              >
                <Text
                  style={[styles.metaPillText, { color: campaignPillColors.color }]}
                  numberOfLines={1}
                >
                  {`Campaign: ${card.campaignName}`}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.bottomRow}>
          <Text style={styles.dateText} numberOfLines={1}>
            {formattedDate ? `Updated ${formattedDate}` : ""}
          </Text>
          <View style={styles.bottomRowRight}>
            {onNotesPress && (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onNotesPress();
                }}
                style={[
                  styles.notesButton,
                  notesDisabled && styles.notesButtonDisabled,
                ]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name="sticky-note-2"
                  size={responsiveSize(16)}
                  color={notesDisabled ? theme.placeholder : theme.primary}
                />
              </TouchableOpacity>
            )}
            {showAssignee && renderAssigneeAvatars()}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const createKanbanCardStyles = (theme: ReturnType<typeof useKanbanTheme>) =>
  StyleSheet.create({
    container: {
      marginBottom: responsiveSize(10),
      width: "100%",
      alignItems: "stretch",
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: responsiveSize(16),
      padding: responsiveSize(16),
      shadowColor: theme.black,
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
      minHeight: 100,
      width: "100%",
      maxWidth: "100%",
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: responsiveSize(8),
      marginBottom: responsiveSize(6),
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveSize(8),
    },
    titleText: {
      fontSize: responsiveSize(14),
      color: theme.text,
      fontWeight: "600",
      flexShrink: 1,
    },
    countBadge: {
      backgroundColor: theme.daysBadgeBg,
      paddingHorizontal: responsiveSize(8),
      paddingVertical: responsiveSize(2),
      borderRadius: responsiveSize(12),
      minWidth: responsiveSize(24),
      alignItems: "center",
      justifyContent: "center",
    },
    countText: {
      fontSize: responsiveSize(11),
      color: theme.daysBadgeText,
      fontWeight: "600",
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveSize(8),
      flexShrink: 0,
    },
    dashIndicator: {
      width: 20,
      height: 2,
      backgroundColor: theme.muted,
      borderRadius: 1,
    },
    mainText: {
      fontSize: responsiveSize(12),
      color: theme.text,
      fontWeight: "400",
      textAlign: "left",
      marginBottom: responsiveSize(8),
      lineHeight: responsiveSize(18),
    },
    metaRow: {
      flexWrap: "wrap",
      gap: responsiveSize(6),
      marginBottom: responsiveSize(10),
    },
    metaPill: {
      paddingHorizontal: responsiveSize(10),
      paddingVertical: responsiveSize(4),
      borderRadius: responsiveSize(14),
      maxWidth: "100%",
    },
    metaPillText: {
      fontSize: responsiveSize(10),
      fontWeight: "500",
    },
    bottomRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: responsiveSize(8),
    },
    bottomRowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveSize(8),
      flexShrink: 0,
    },
    notesButton: {
      width: responsiveSize(30),
      height: responsiveSize(30),
      borderRadius: responsiveSize(15),
      backgroundColor: hexToRgba(theme.primary, 0.2),
      justifyContent: "center",
      alignItems: "center",
    },
    notesButtonDisabled: {
      backgroundColor: theme.notesDisabledBg,
    },
    dateText: {
      color: theme.placeholder,
      fontSize: responsiveSize(12),
      flex: 1,
    },
    assigneeContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    assigneeAvatar: {
      width: responsiveSize(24),
      height: responsiveSize(24),
      borderRadius: responsiveSize(12),
      backgroundColor: theme.primary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: responsiveSize(2),
      borderColor: theme.white,
    },
    assigneeInitials: {
      fontSize: responsiveSize(10),
      fontWeight: "bold",
      color: theme.white,
    },
    overflowAvatar: {
      backgroundColor: theme.assigneeOverflow,
    },
    overflowText: {
      fontSize: 10,
      fontWeight: "bold",
      color: theme.white,
    },
    contactContainer: {
      marginBottom: responsiveSize(8),
    },
  });

export default KanbanCard;
