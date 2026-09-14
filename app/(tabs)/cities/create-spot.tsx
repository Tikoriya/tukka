import { PlacesAutocompleteField } from "@/components/GoogleAutoComplete";
import { ImportedPhotos } from "@/components/ImportedPhotos";
import { ImportLinkField } from "@/components/ImportLinkField";
import { ImportScreenshotButton } from "@/components/ImportScreenshotButton";
import { TagPicker } from "@/components/TagPicker";
import { CitySelectField } from "@/components/ui/CitySelectField";
import { Input } from "@/components/ui/Input";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { Radius, Spacing } from "@/constants/Theme";
import { FontFamily, Typography } from "@/constants/Typography";
import { useCities } from "@/hooks/useCities";
import { useCreateTag } from "@/hooks/useCreateTag";
import { useSpot } from "@/hooks/useSpot";
import { CreateSpotFormValues, createSpotSchema } from "@/lib/schemas/spot";
import { ImportedSpot } from "@/lib/services/import";
import {
  uploadPhotoFromUri,
  uploadPhotoFromUrl,
} from "@/lib/services/photoUpload";
import { useAuthStore } from "@/lib/store";
import { spotPhotosApi } from "@/lib/supabase/spot_photos";
import { tagsSpotsApi } from "@/lib/supabase/tags_spots";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Link2, RotateCcw } from "lucide-react-native";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CreateSpotRouteParams = {
  // Present when launched from inside a city; absent from the global + button.
  cityId?: string;
  cityName?: string;
  // "1" when the caller wants the city locked (e.g. explicit "+ Add spot" from
  // the city header). Absent for soft preselects (tab bar contextual guess),
  // where the user should still be able to switch cities.
  lockCity?: string;
};

type SpotTab = "manual" | "import";

const SPOT_TABS: { key: SpotTab; label: string }[] = [
  { key: "import", label: "Import" },
  { key: "manual", label: "Add Spot" },
];

export default function CreateSpotScreen() {
  const router = useRouter();
  const { cityId: cityIdParam, lockCity: lockCityParam } =
    useLocalSearchParams<CreateSpotRouteParams>();
  const presetCityId = cityIdParam ? parseInt(cityIdParam) : undefined;
  const cityLocked = presetCityId !== undefined && lockCityParam === "1";

  const { cities } = useCities();
  const { user } = useAuthStore();
  const { mutateAsync: createTags } = useCreateTag();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<SpotTab>("import");
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [importedName, setImportedName] = useState<string | undefined>(
    undefined,
  );
  const [importedAddress, setImportedAddress] = useState<string | undefined>(
    undefined,
  );
  const [importedPhotos, setImportedPhotos] = useState<string[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [isImportComplete, setIsImportComplete] = useState(false);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const tabBarPadding = useBottomTabOverflow();

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateSpotFormValues>({
    resolver: zodResolver(createSpotSchema),
    defaultValues: {
      name: "",
      address: "",
      latitude: 0,
      longitude: 0,
      notes: "",
      cityId: presetCityId,
    },
  });

  const selectedCityId = watch("cityId");
  const name = watch("name");
  const address = watch("address");
  const { createSpot } = useSpot(selectedCityId ? String(selectedCityId) : "");

  const showNotesAndTags = activeTab === "manual" || isImportComplete;
  const canSave =
    activeTab === "manual"
      ? Boolean(name.trim() && address.trim())
      : isImportComplete;

  // Rendered inside each tab view; all instances share the same form field, so
  // a selected city persists when switching between Manual and Import.
  const renderCityField = () => (
    <View style={styles.field}>
      <Controller
        control={control}
        name="cityId"
        render={({ field: { onChange, value } }) => (
          <CitySelectField
            cities={cities ?? []}
            value={value ?? null}
            onChange={(id) => onChange(id)}
            error={errors.cityId?.message}
            locked={cityLocked}
          />
        )}
      />
    </View>
  );

  const applyImported = (spot: ImportedSpot, photos: string[]) => {
    setValue("name", spot.name, { shouldValidate: true });
    setValue("address", spot.address, { shouldValidate: true });
    setValue("latitude", spot.latitude);
    setValue("longitude", spot.longitude);
    setImportedName(spot.name);
    setImportedAddress(spot.address);
    setImportedPhotos(photos);
    setIsImportComplete(Boolean(spot.name) && photos.length > 0);

    // Google's formattedAddress usually contains the local city name (e.g.
    // "…, 1060 Wien, Austria"). If the user hasn't picked a city yet, try to
    // match it against one of their cities by case-insensitive substring.
    if (!selectedCityId && cities && spot.address) {
      const normalizedAddress = spot.address.toLowerCase();
      const match = cities.find((city) =>
        normalizedAddress.includes(city.name.toLowerCase()),
      );
      if (match) {
        setValue("cityId", match.id, { shouldValidate: true });
      }
    }
  };

  const handleResetImport = () => {
    setImportedName(undefined);
    setImportedAddress(undefined);
    setImportedPhotos([]);
    setIsImportComplete(false);
    setValue("name", "", { shouldValidate: false });
    setValue("address", "", { shouldValidate: false });
    setValue("latitude", 0);
    setValue("longitude", 0);
  };

  const onSubmit = async (values: CreateSpotFormValues) => {
    try {
      const createdSpot = await createSpot({
        name: values.name,
        notes: values.notes ?? null,
        address: values.address,
        latitude: values.latitude,
        longitude: values.longitude,
        city_id: values.cityId,
      });

      if (tagLabels.length > 0) {
        const createdTags = await createTags(
          tagLabels.map((label) => ({ label, user_id: user?.id })),
        );
        await tagsSpotsApi.createTagsSpots(
          createdTags.map((tag) => ({
            spot_id: createdSpot.id,
            tag_id: tag.id,
          })),
        );
      }

      if (importedPhotos.length > 0) {
        const results = await Promise.allSettled(
          importedPhotos.map((url, i) =>
            // A screenshot fallback is a local file:// / ph:// / content:// URI;
            // Places photos are remote https URLs. Each needs a different uploader.
            /^https?:/.test(url)
              ? uploadPhotoFromUrl(createdSpot.id, url, i)
              : uploadPhotoFromUri(createdSpot.id, url, i),
          ),
        );
        const stored = results
          .map((r, i) =>
            r.status === "fulfilled"
              ? { spot_id: createdSpot.id, url: r.value, position: i }
              : null,
          )
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (stored.length > 0) {
          await spotPhotosApi.insertPhotos(stored);
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["spots", String(values.cityId)],
      });
      router.back();
    } catch {
      Alert.alert("Error", "Could not save spot. Please try again.");
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Add Spot
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.headerButton,
              {
                backgroundColor: canSave
                  ? theme.accent
                  : theme.surfaceElevated,
              },
            ]}
            onPress={handleSubmit(onSubmit)}
            disabled={!canSave || isSubmitting}
            activeOpacity={0.8}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save spot"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={theme.onAccent} />
            ) : (
              <Check
                size={20}
                color={canSave ? theme.onAccent : theme.textMuted}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + tabBarPadding },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {/* Tab switcher */}
          <SegmentedTabs
            tabs={SPOT_TABS}
            value={activeTab}
            onChange={setActiveTab}
          />

          {/* Manual entry */}
          {activeTab === "manual" ? (
            <>
              {/* City — locked when opened from a city, a dropdown otherwise */}
              {renderCityField()}

              {/* Name */}
              <View style={styles.field}>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Name"
                      error={errors.name?.message}
                      placeholder="e.g. Café Central, Neni am Naschmarkt"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  )}
                />
              </View>

              {/* Location — Google Places autocomplete */}
              <View style={styles.field}>
                <Controller
                  control={control}
                  name="address"
                  render={() => (
                    <PlacesAutocompleteField
                      error={errors.address?.message}
                      prefillValue={importedAddress}
                      onPlaceSelected={(place) => {
                        setValue("address", place.address, {
                          shouldValidate: true,
                        });
                        setValue("latitude", place.latitude);
                        setValue("longitude", place.longitude);
                        if (!control._formValues.name) {
                          setValue("name", place.name);
                        }
                      }}
                    />
                  )}
                />
              </View>
            </>
          ) : (
            /* Import — paste a link or pick a screenshot */
            <>
              {renderCityField()}

              <View style={styles.field}>
                {importedName ? (
                  <View
                    style={[
                      styles.importedCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.importedHeader}>
                      <Text
                        style={[styles.importedName, { color: theme.text }]}
                        numberOfLines={2}
                      >
                        {importedName}
                      </Text>
                      <TouchableOpacity
                        onPress={handleResetImport}
                        activeOpacity={0.7}
                        hitSlop={8}
                        style={styles.importedReset}
                      >
                        <RotateCcw size={18} color={theme.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {importedAddress ? (
                      <Text
                        style={[
                          styles.importedAddress,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {importedAddress}
                      </Text>
                    ) : null}
                    <ImportedPhotos
                      photos={importedPhotos}
                      onRemove={(url) =>
                        setImportedPhotos((prev) =>
                          prev.filter((p) => p !== url),
                        )
                      }
                    />
                  </View>
                ) : (
                  <View style={styles.importMethods}>
                    <View style={styles.importMethodsRow}>
                      <ImportScreenshotButton
                        compact
                        onPress={() => setShowLinkInput(false)}
                        onImported={(spot, sourceUri) =>
                          applyImported(
                            spot,
                            spot.photos?.length ? spot.photos : [sourceUri],
                          )
                        }
                      />

                      <TouchableOpacity
                        style={[
                          styles.linkToggleButton,
                          {
                            borderColor: theme.border,
                            backgroundColor: showLinkInput
                              ? theme.accentSubtle
                              : theme.surface,
                          },
                        ]}
                        onPress={() => setShowLinkInput((prev) => !prev)}
                        activeOpacity={0.85}
                      >
                        <Link2 size={26} color={theme.text} strokeWidth={1} />
                        <Text
                          style={[
                            styles.linkToggleLabel,
                            { color: theme.text },
                          ]}
                          numberOfLines={1}
                        >
                          Import from link
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showLinkInput ? (
                      <ImportLinkField
                        label=""
                        onImported={(spot) =>
                          applyImported(spot, spot.photos ?? [])
                        }
                      />
                    ) : null}
                    <Text style={[styles.hint, { color: theme.textMuted }]}>
                      Screenshot an Instagram post, reel, or profile —
                      we&apos;ll read the place from it. Or simply paste a link
                      from Google Maps.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          {showNotesAndTags ? (
            <>
              <View style={styles.field}>
                <Controller
                  control={control}
                  name="notes"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <Input
                      label="Notes"
                      placeholder="What made this place special?"
                      value={value ?? ""}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      multiline
                      numberOfLines={3}
                      returnKeyType="done"
                    />
                  )}
                />
              </View>

              <View style={styles.field}>
                <TagPicker
                  value={tagLabels}
                  onChange={setTagLabels}
                  theme={theme}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontFamily: FontFamily.regular,
    fontSize: 16,
    width: 64,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: 16,
    textAlign: "center",
  },
  headerRight: {
    width: 64,
    alignItems: "flex-end",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  importMethods: {
    gap: Spacing.space4,
  },
  importMethodsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.space2,
  },
  hint: {
    ...Typography.secondary,
  },
  linkToggleButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.space2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.space4,
    paddingHorizontal: Spacing.space2,
  },
  linkToggleLabel: {
    ...Typography.button,
  },
  importedCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.space4,
    gap: Spacing.space2,
  },
  importedHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.space2,
  },
  importedName: {
    ...Typography.placeName,
    flex: 1,
  },
  importedReset: {
    marginTop: 2,
  },
  importedAddress: {
    ...Typography.secondary,
  },
});
