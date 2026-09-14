import { SpotCard } from "@/components/SpotCard";
import { IconButton } from "@/components/ui/IconButton";
import { resolveTagIcon, TagGlyph } from "@/components/ui/IconLabel";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { Colors, Palette } from "@/constants/Colors";
import { Elevation, Radius, Spacing } from "@/constants/Theme";
import { FontFamily, Typography } from "@/constants/Typography";
import { useCity } from "@/hooks/useCity";
import { useCityTags } from "@/hooks/useCityTags";
import { useSpot } from "@/hooks/useSpot";
import { useSpots } from "@/hooks/useSpots";
import { useUiPrefsStore } from "@/lib/store";
import { Tag } from "@/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLLAPSED_TAG_COUNT = 6;

type CityRouteParams = {
  cityid: string;
  cityName?: string;
};

export default function CityScreen() {
  const router = useRouter();
  const { cityid, cityName } = useLocalSearchParams<CityRouteParams>();
  const { deleteCity } = useCity(cityid);
  const { deleteSpot } = useSpot(cityid);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const tabBarPadding = useBottomTabOverflow();

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [filterBarTop, setFilterBarTop] = useState(0);

  const showFilters = useUiPrefsStore((state) => state.filtersOpen);
  const setShowFilters = useUiPrefsStore((state) => state.setFiltersOpen);
  const markCityOpened = useUiPrefsStore((state) => state.markCityOpened);

  useEffect(() => {
    markCityOpened(cityid);
  }, [cityid, markCityOpened]);

  const {
    spots,
    isLoading,
    isRefetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSpots({ cityId: cityid, selectedTagIds });

  const { tags } = useCityTags(cityid);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  const toggleFilters = () => {
    if (showFilters) setFiltersExpanded(false);
    setShowFilters(!showFilters);
  };

  const orderedTags = [
    ...tags.filter((tag) => selectedTagIds.includes(tag.id)),
    ...tags.filter((tag) => !selectedTagIds.includes(tag.id)),
  ];
  const hasMoreTags = orderedTags.length > COLLAPSED_TAG_COUNT;
  const collapsedTags = orderedTags.slice(0, COLLAPSED_TAG_COUNT);

  const renderTagPill = (tag: Tag) => {
    const active = selectedTagIds.includes(tag.id);
    return (
      <TouchableOpacity
        key={tag.id}
        style={[
          styles.tagPill,
          { backgroundColor: active ? theme.ochre : theme.ochreSubtle },
        ]}
        onPress={() => toggleTag(tag.id)}
        activeOpacity={0.7}
      >
        <TagGlyph
          resolved={resolveTagIcon(tag)}
          size={14}
          color={active ? Palette.paper100 : theme.ochre}
          strokeWidth={2}
        />
        <Text
          style={[
            styles.tagPillText,
            { color: active ? Palette.paper100 : theme.ochre },
          ]}
        >
          {tag.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const handleDeleteCity = () => {
    Alert.alert("Delete city", "This will remove the city and all its spots.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteCity(parseInt(cityid));
          router.push("/cities");
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[Typography.body, { color: theme.textSecondary }]}>
          Could not load spots.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.accent }]}
          onPress={() => refetch()}
          activeOpacity={0.8}
        >
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const goToCreateSpot = () =>
    router.push({
      pathname: "/cities/create-spot",
      params: { cityId: cityid, cityName, lockCity: "1" },
    });

  // Onboarding empty state: no spots yet AND no filters applied. Keeps the
  // back button + title for navigation, but strips the top-right "+ Add spot"
  // and the action row so the center CTA is the obvious primary action.
  const isOnboarding = spots.length === 0 && selectedTagIds.length === 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[styles.backText, { color: theme.accent }]}>
            ‹ Cities
          </Text>
        </TouchableOpacity>
        {!isOnboarding ? (
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: theme.accent }]}
            onPress={goToCreateSpot}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonText}>+ Add spot</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* City title + actions */}
      <View style={styles.titleRow}>
        <Text
          style={[Typography.title, styles.cityTitle, { color: theme.text }]}
          numberOfLines={1}
        >
          {cityName ?? "City"}
        </Text>
        <View style={styles.actions}>
          {/* Map view for a city is not implemented yet
          <IconButton
            icon="map"
            onPress={() => console.log("map pressed")}
            accessibilityLabel="View on map"
          />
          */}
          {!isOnboarding ? (
            <IconButton
              icon="filter"
              onPress={toggleFilters}
              accessibilityLabel="Filter spots"
              background={showFilters ? theme.accent : undefined}
              color={showFilters ? Palette.paper100 : undefined}
            />
          ) : null}
          <IconButton
            icon="edit"
            onPress={() =>
              router.push({
                pathname: "/cities/edit",
                params: { cityid, ...(cityName ? { cityName } : {}) },
              })
            }
            accessibilityLabel="Edit city"
          />
          <IconButton
            icon="delete"
            onPress={handleDeleteCity}
            accessibilityLabel="Delete city"
            color={theme.error}
          />
        </View>
      </View>

      {/* Collapsed filter bar */}
      {showFilters && tags.length > 0 ? (
        <View
          style={styles.filterBar}
          onLayout={(e) => setFilterBarTop(e.nativeEvent.layout.y)}
        >
          <View style={styles.pillWrap}>
            {collapsedTags.map(renderTagPill)}
          </View>
          {hasMoreTags ? (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setFiltersExpanded(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Show more filters"
            >
              <ChevronDown
                size={18}
                color={theme.textSecondary}
                strokeWidth={2}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.listWrap}>
        {isOnboarding ? (
          <View
            style={[styles.emptyContainer, { paddingBottom: tabBarPadding }]}
          >
            <View
              style={[
                styles.emptyIconWrapper,
                { backgroundColor: theme.accentSubtle },
              ]}
            >
              <MapPin size={36} color={theme.text} />
            </View>
            <Text
              style={[
                Typography.title,
                styles.emptyTitle,
                { color: theme.text },
              ]}
            >
              Add your first spot
            </Text>
            <Text
              style={[
                Typography.body,
                styles.emptyBody,
                { color: theme.textSecondary },
              ]}
            >
              Save cafés, restaurants and hidden gems you find in{" "}
              {cityName ?? "this city"}.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.accent }]}
              onPress={goToCreateSpot}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyButtonText}>Add a spot</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={spots}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: 24 + tabBarPadding },
            ]}
            showsVerticalScrollIndicator={false}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <View style={styles.spotsHeader}>
                <View style={styles.spotsCountRow}>
                  <Text
                    style={[styles.spotsCount, { color: theme.textSecondary }]}
                  >
                    {spots.length} {spots.length === 1 ? "spot" : "spots"}
                  </Text>
                  {isRefetching ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : null}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[Typography.body, { color: theme.textSecondary }]}>
                  No spots match these filters.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <SpotCard
                spot={item}
                onPress={() =>
                  router.push({
                    pathname: "/cities/[cityid]/[spotid]",
                    params: { cityid, spotid: item.id.toString() },
                  })
                }
                onDelete={() => deleteSpot(item.id)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : null
            }
          />
        )}
      </View>

      {/* Expanded filter overlay */}
      {showFilters && filtersExpanded ? (
        <>
          <Pressable
            style={[styles.backdrop, { top: filterBarTop }, Elevation.float]}
            onPress={() => setFiltersExpanded(false)}
          />
          <View
            style={[
              styles.overlay,
              { top: filterBarTop, backgroundColor: theme.surface },
              Elevation.float,
            ]}
          >
            <View style={styles.pillWrap}>
              {orderedTags.map(renderTagPill)}
            </View>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setFiltersExpanded(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Show fewer filters"
            >
              <ChevronUp
                size={18}
                color={theme.textSecondary}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.space3,
  },
  retryButton: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.space4,
    paddingVertical: Spacing.space2,
  },
  retryButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Palette.paper100,
  },
  footerLoader: {
    paddingVertical: Spacing.space4,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backText: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.space3,
    paddingHorizontal: Spacing.space4,
    paddingTop: Spacing.space4,
    paddingBottom: Spacing.space3,
  },
  cityTitle: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.space2,
  },
  filterBar: {
    paddingHorizontal: Spacing.space4,
    paddingBottom: Spacing.space4,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.space2,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  tagPillText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
  expandButton: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.space2,
    paddingBottom: Spacing.space1,
  },
  listWrap: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "rgba(20, 32, 26, 0.35)",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 11,
    paddingHorizontal: Spacing.space4,
    paddingTop: Spacing.space2,
    paddingBottom: Spacing.space2,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  spotsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  spotsCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.space2,
  },
  spotsCount: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  addButton: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  addButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    color: Palette.paper100,
  },
  list: {
    paddingBottom: 24,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingTop: 32,
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyBody: {
    textAlign: "center",
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: 8,
    paddingHorizontal: 26,
    paddingVertical: 15,
    borderRadius: 14,
  },
  emptyButtonText: {
    color: Palette.paper100,
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
  },
});
