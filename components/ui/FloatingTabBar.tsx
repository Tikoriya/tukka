import {
  BottomTabBarHeightCallbackContext,
  BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Compass, LucideIcon, MapPin, Plus, User } from "lucide-react-native";
import { useContext } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/Colors";
import { Elevation, Radius, Spacing } from "@/constants/Theme";
import { Typography } from "@/constants/Typography";

// Nested routes that take over the whole screen, so the floating bar hides.
const FULLSCREEN_ROUTES = ["create", "edit", "create-spot", "label", "[spotid]"];

type TabSlot = {
  // Route base segment, e.g. "cities" — also matches "cities/index".
  base: string;
  label: string;
  icon: LucideIcon;
};

// Left-of-plus slots, rendered in order. The center "+" and Profile are fixed.
const LEADING_SLOTS: TabSlot[] = [
  { base: "cities", label: "Explore", icon: Compass },
  { base: "map", label: "Map", icon: MapPin },
];

const PROFILE_SLOT: TabSlot = { base: "profile", label: "Profile", icon: User };

type NestedRoute = {
  name?: string;
  params?: Record<string, unknown>;
  state?: { routes: NestedRoute[]; index: number };
};

function getDeepestFocusedRoute(route: NestedRoute): NestedRoute {
  let current: NestedRoute = route;
  while (current.state?.routes && current.state.index != null) {
    const next = current.state.routes[current.state.index];
    if (!next) break;
    current = next;
  }
  return current;
}

function getDeepestFocusedRouteName(route: NestedRoute): string {
  const deepest = getDeepestFocusedRoute(route);
  return getFocusedRouteNameFromRoute(deepest) ?? deepest.name ?? "index";
}

// Walks the tab -> stack tree looking for a route whose params carry a `cityid`
// (i.e. any screen nested under /cities/[cityid]/...). Returns undefined if the
// user isn't currently viewing a city.
function findFocusedCity(
  route: NestedRoute,
): { cityId: string; cityName?: string } | undefined {
  let current: NestedRoute | undefined = route;
  while (current) {
    const cityid = current.params?.cityid;
    if (typeof cityid === "string" && cityid.length > 0) {
      const cityName = current.params?.cityName;
      return {
        cityId: cityid,
        cityName: typeof cityName === "string" ? cityName : undefined,
      };
    }
    if (current.state?.routes && current.state.index != null) {
      current = current.state.routes[current.state.index];
    } else {
      current = undefined;
    }
  }
  return undefined;
}

export const FloatingTabBar = (props: BottomTabBarProps) => {
  const { state, navigation } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  // Report our measured height so screens can offset content for the overlay.
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const onLayout = (e: LayoutChangeEvent) => {
    reportHeight?.(e.nativeEvent.layout.height);
  };

  const focusedDeepName = getDeepestFocusedRouteName(state.routes[state.index]);
  if (FULLSCREEN_ROUTES.includes(focusedDeepName)) {
    return null;
  }

  const activeRouteName = state.routes[state.index]?.name;

  // Folders without a `_layout` register as e.g. "map/index", so match by base.
  const routeForBase = (base: string) =>
    state.routes.find(
      (r) =>
        r.name === base ||
        r.name === `${base}/index` ||
        r.name.startsWith(`${base}/`),
    );

  const navigateTo = (base: string) => {
    const target = routeForBase(base);
    if (!target) return;
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const event = navigation.emit({
      type: "tabPress",
      target: target.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented && target.name !== activeRouteName) {
      navigation.navigate(target.name);
    }
  };

  const handleAddSpot = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // If the user is currently browsing a city (or one of its spots), soft-
    // preselect that city in the create form. The tab bar is a contextual
    // shortcut, so the field stays editable (no `lockCity`).
    const focusedCity = findFocusedCity(state.routes[state.index]);
    if (focusedCity) {
      router.push({
        pathname: "/cities/create-spot",
        params: {
          cityId: focusedCity.cityId,
          ...(focusedCity.cityName ? { cityName: focusedCity.cityName } : {}),
        },
      });
      return;
    }
    router.push("/cities/create-spot");
  };

  const renderSlot = (slot: TabSlot) => {
    const active = routeForBase(slot.base)?.name === activeRouteName;
    const Icon = slot.icon;
    return (
      <Pressable
        key={slot.base}
        style={[
          styles.slot,
          active && [styles.slotActive, { backgroundColor: theme.accentSubtle }],
        ]}
        onPress={() => navigateTo(slot.base)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={slot.label}
      >
        <Icon
          size={22}
          color={active ? theme.text : theme.tabIconDefault}
          strokeWidth={2}
        />
        {active ? (
          <Text style={[styles.slotLabel, { color: theme.text }]}>
            {slot.label}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.outer,
        { paddingBottom: insets.bottom > 0 ? insets.bottom : Spacing.space4 },
      ]}
      onLayout={onLayout}
      pointerEvents="box-none"
    >
      <View
        style={[styles.bar, { backgroundColor: theme.glass }, Elevation.float]}
      >
        <BlurView
          tint={isDark ? "dark" : "light"}
          intensity={isDark ? 40 : 60}
          style={[styles.glass, { borderColor: theme.glassBorder }]}
          pointerEvents="none"
        />

        {LEADING_SLOTS.map(renderSlot)}

        <Pressable
          style={[styles.plus, { backgroundColor: theme.accent }, Elevation.float]}
          onPress={handleAddSpot}
          accessibilityRole="button"
          accessibilityLabel="Add a spot"
        >
          <Plus size={26} color={theme.onAccent} strokeWidth={2.5} />
        </Pressable>

        {renderSlot(PROFILE_SLOT)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.space4,
    paddingTop: Spacing.space2,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.space3,
    paddingVertical: Spacing.space2,
  },
  glass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    zIndex: -1,
  },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.space2,
    height: 44,
    paddingHorizontal: Spacing.space3,
    borderRadius: Radius.full,
  },
  slotActive: {
    paddingHorizontal: Spacing.space4,
  },
  slotLabel: {
    ...Typography.label,
  },
  plus: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
