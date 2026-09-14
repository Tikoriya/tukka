import { EditablePhoto, SpotPhotoEditor } from "@/components/SpotPhotoEditor";
import { SpotPhotoGallery } from "@/components/SpotPhotoGallery";
import { TagPicker } from "@/components/TagPicker";
import { IconButton } from "@/components/ui/IconButton";
import { resolveTagIcon, TagGlyph } from "@/components/ui/IconLabel";
import { Input } from "@/components/ui/Input";
import { useBottomTabOverflow } from "@/components/ui/TabBarBackground";
import { Colors, Palette } from "@/constants/Colors";
import { Radius, Spacing } from "@/constants/Theme";
import { FontFamily, Typography } from "@/constants/Typography";
import { useCreateTag } from "@/hooks/useCreateTag";
import { useSpot } from "@/hooks/useSpot";
import { SpotFormValues, spotSchema } from "@/lib/schemas/spot";
import {
  deletePhotosFromStorage,
  uploadPhotoFromUri,
} from "@/lib/services/photoUpload";
import { spotPhotosApi } from "@/lib/supabase/spot_photos";
import { spotsApi } from "@/lib/supabase/spots";
import { tagsSpotsApi } from "@/lib/supabase/tags_spots";
import { Tag } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapPin, Navigation, Star } from "lucide-react-native";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const HERO_HEIGHT = Math.round(Dimensions.get("window").height * 0.48);
const SHEET_OVERLAP = 28;

type SpotRouteParams = {
  cityid: string;
  spotid: string;
};

export default function SpotDetailScreen() {
  const { spotid, cityid } = useLocalSearchParams<SpotRouteParams>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const tabBarPadding = useBottomTabOverflow();

  const [isEditing, setIsEditing] = useState(false);
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [editPhotos, setEditPhotos] = useState<EditablePhoto[]>([]);
  const [removedPhotos, setRemovedPhotos] = useState<
    { id: number; url: string }[]
  >([]);
  const [initialTagLabels, setInitialTagLabels] = useState<string[]>([]);
  const [initialPhotos, setInitialPhotos] = useState<EditablePhoto[]>([]);

  const { updateSpot, deleteSpot, isPendingDeleteSpot } = useSpot(cityid);
  const { mutateAsync: createTags } = useCreateTag();

  const { data: spot, isLoading } = useQuery({
    queryKey: ["spot", spotid],
    queryFn: () => spotsApi.getSpot(parseInt(spotid)),
    enabled: !!spotid,
  });

  const { data: spotPhotos = [] } = useQuery({
    queryKey: ["spot_photos", spotid],
    queryFn: () => spotPhotosApi.fetchForSpot(parseInt(spotid)),
    enabled: !!spotid,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SpotFormValues>({
    resolver: zodResolver(spotSchema),
    defaultValues: {
      name: "",
      address: "",
      latitude: 0,
      longitude: 0,
      notes: "",
    },
  });

  const enterEditMode = () => {
    if (!spot) return;
    reset({
      name: spot.name,
      address: spot.address ?? "",
      latitude: spot.latitude ?? 0,
      longitude: spot.longitude ?? 0,
      notes: spot.notes ?? "",
    });
    const existingTags = ((spot as any).tags as Tag[] | undefined) ?? [];
    const existingLabels = existingTags.map((t) => t.label);
    const existingPhotos = spotPhotos.map((p) => ({ id: p.id, uri: p.url }));
    setTagLabels(existingLabels);
    setInitialTagLabels(existingLabels);
    setEditPhotos(existingPhotos);
    setInitialPhotos(existingPhotos);
    setRemovedPhotos([]);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleDeleteSpot = () => {
    if (!spot) return;
    Alert.alert("Delete spot", `Remove "${spot.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSpot(parseInt(spotid));
            router.back();
          } catch {
            Alert.alert("Error", "Could not delete spot. Please try again.");
          }
        },
      },
    ]);
  };

  const handleRemovePhoto = (photo: EditablePhoto) => {
    setEditPhotos((prev) => prev.filter((p) => p.uri !== photo.uri));
    if (photo.id != null) {
      setRemovedPhotos((prev) => [...prev, { id: photo.id!, url: photo.uri }]);
    }
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow photo library access in Settings to add a photo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.85,
    });

    if (!result.canceled) {
      setEditPhotos((prev) => [...prev, { uri: result.assets[0].uri }]);
    }
  };

  const onSave = async (values: SpotFormValues) => {
    try {
      await updateSpot({
        spotId: parseInt(spotid),
        updates: {
          name: values.name,
          address: values.address,
          latitude: values.latitude,
          longitude: values.longitude,
          notes: values.notes ?? null,
        },
      });

      await tagsSpotsApi.deleteSpotTags(parseInt(spotid));
      if (tagLabels.length > 0) {
        const createdTags = await createTags(
          tagLabels.map((label) => ({ label })),
        );
        await tagsSpotsApi.createTagsSpots(
          createdTags.map((tag) => ({
            spot_id: parseInt(spotid),
            tag_id: tag.id,
          })),
        );
      }

      if (removedPhotos.length > 0) {
        await spotPhotosApi.deletePhotos(removedPhotos.map((p) => p.id));
        await deletePhotosFromStorage(removedPhotos.map((p) => p.url));
      }

      // editPhotos order is the source of truth (index 0 = cover): each photo's
      // index becomes its stored position. Existing photos are repositioned in
      // place; new photos are uploaded and inserted at their index.
      const positionUpdates: { id: number; position: number }[] = [];
      const newInserts: { spot_id: number; url: string; position: number }[] =
        [];

      for (let index = 0; index < editPhotos.length; index++) {
        const photo = editPhotos[index];
        if (photo.id != null) {
          positionUpdates.push({ id: photo.id, position: index });
        } else {
          try {
            const url = await uploadPhotoFromUri(
              parseInt(spotid),
              photo.uri,
              index,
            );
            newInserts.push({
              spot_id: parseInt(spotid),
              url,
              position: index,
            });
          } catch {
            // skip photos that fail to upload
          }
        }
      }

      if (positionUpdates.length > 0) {
        await spotPhotosApi.updatePositions(positionUpdates);
      }
      if (newInserts.length > 0) {
        await spotPhotosApi.insertPhotos(newInserts);
      }

      await queryClient.invalidateQueries({ queryKey: ["spot", spotid] });
      await queryClient.invalidateQueries({
        queryKey: ["spot_photos", spotid],
      });
      await queryClient.invalidateQueries({ queryKey: ["spots", cityid] });
      setIsEditing(false);
    } catch {
      Alert.alert("Error", "Could not save changes. Please try again.");
    }
  };

  const handleToggleFavorite = async () => {
    if (!spot) return;
    try {
      await updateSpot({
        spotId: parseInt(spotid),
        updates: { is_favorite: !spot.is_favorite },
      });
      await queryClient.invalidateQueries({ queryKey: ["spot", spotid] });
    } catch {
      Alert.alert("Error", "Could not update favorite. Please try again.");
    }
  };

  const handleOpenInMaps = () => {
    if (!spot?.latitude || !spot?.longitude) return;
    const { latitude, longitude, name } = spot;
    const label = encodeURIComponent(name);
    const url =
      Platform.OS === "ios"
        ? `maps://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`;

    Linking.canOpenURL(url).then((supported) => {
      Linking.openURL(
        supported ? url : `https://maps.google.com/?q=${latitude},${longitude}`,
      );
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!spot) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[Typography.body, { color: theme.textSecondary }]}>
          Spot not found.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={[Typography.secondary, { color: theme.accent }]}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tags = ((spot as any).tags as Tag[] | undefined) ?? [];

  const tagsChanged =
    tagLabels.length !== initialTagLabels.length ||
    !tagLabels.every((label) => initialTagLabels.includes(label));
  const photosChanged =
    removedPhotos.length > 0 ||
    editPhotos.length !== initialPhotos.length ||
    editPhotos.some((photo, index) => {
      const original = initialPhotos[index];
      return (
        !original || original.id !== photo.id || original.uri !== photo.uri
      );
    });
  const hasChanges = isDirty || tagsChanged || photosChanged;
  const canSave = hasChanges && !isSubmitting;

  if (isEditing) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: theme.background }]}
        edges={["top", "bottom"]}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={cancelEdit} activeOpacity={0.7}>
            <Text
              style={[styles.headerActionText, { color: theme.textSecondary }]}
            >
              Cancel
            </Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleSubmit(onSave)}
              disabled={!canSave}
              activeOpacity={0.85}
              style={[
                styles.saveButton,
                {
                  backgroundColor: canSave
                    ? theme.accent
                    : theme.surfaceElevated,
                },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={theme.onAccent} />
              ) : (
                <Text
                  style={[
                    styles.saveButtonText,
                    { color: canSave ? theme.onAccent : theme.textMuted },
                  ]}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
            <IconButton
              icon="delete"
              onPress={handleDeleteSpot}
              accessibilityLabel="Delete spot"
              color={theme.error}
              disabled={isPendingDeleteSpot || isSubmitting}
            />
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.editContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            alwaysBounceVertical={false}
          >
            {/* Name — rendered as the screen title */}
            <View style={styles.field}>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    variant="title"
                    placeholder="Name"
                    error={errors.name?.message}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                )}
              />
            </View>

            {/* Location */}
            <View style={styles.field}>
              <Controller
                control={control}
                name="address"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Location"
                    error={errors.address?.message}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                  />
                )}
              />
            </View>

            {/* Photos */}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Photos
              </Text>
              <SpotPhotoEditor
                photos={editPhotos}
                onReorder={setEditPhotos}
                onRemove={handleRemovePhoto}
                onAdd={handleAddPhoto}
                theme={theme}
              />
            </View>

            {/* Notes */}
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
                  />
                )}
              />
            </View>

            {/* Tags */}
            <View style={styles.field}>
              <TagPicker
                value={tagLabels}
                onChange={setTagLabels}
                theme={theme}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const coverPhoto = spotPhotos[0]?.url;
  const galleryPhotos = spotPhotos.slice(1).map((p) => p.url);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.heroScrollContent,
          { paddingBottom: 24 + tabBarPadding },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Cover image hero */}
        <View style={styles.hero}>
          {coverPhoto ? (
            <Image
              source={{ uri: coverPhoto }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.heroImage,
                { backgroundColor: theme.surfaceElevated },
              ]}
            />
          )}
        </View>

        {/* Overlapping content sheet */}
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.titleRow}>
            <Text
              style={[
                Typography.heading1,
                styles.titleText,
                { color: theme.text },
              ]}
            >
              {spot.name}
            </Text>
            <TouchableOpacity
              onPress={handleToggleFavorite}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                spot.is_favorite ? "Remove from favorites" : "Add to favorites"
              }
            >
              <Star
                size={26}
                color={theme.ochre}
                fill={spot.is_favorite ? theme.ochre : "transparent"}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>

          {spot.address ? (
            <View style={styles.addressRow}>
              <MapPin
                size={15}
                color={theme.textSecondary}
                strokeWidth={2}
                style={styles.addressIcon}
              />
              <Text
                style={[
                  Typography.secondary,
                  styles.addressText,
                  { color: theme.textSecondary },
                ]}
              >
                {spot.address}
              </Text>
            </View>
          ) : null}

          {galleryPhotos.length > 0 ? (
            <View style={styles.galleryWrap}>
              <SpotPhotoGallery photos={galleryPhotos} />
            </View>
          ) : null}

          {spot.notes ? (
            <Text
              style={[Typography.body, styles.notes, { color: theme.text }]}
            >
              {spot.notes}
            </Text>
          ) : null}

          {tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {tags.map((tag) => (
                <View
                  key={tag.id}
                  style={[
                    styles.tagPill,
                    { backgroundColor: theme.ochreSubtle },
                  ]}
                >
                  <TagGlyph
                    resolved={resolveTagIcon(tag)}
                    size={14}
                    color={theme.ochre}
                    strokeWidth={2}
                  />
                  <Text style={[styles.tagPillText, { color: theme.ochre }]}>
                    {tag.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {spot.latitude && spot.longitude ? (
            <TouchableOpacity
              style={[styles.mapsButton, { backgroundColor: theme.accent }]}
              onPress={handleOpenInMaps}
              activeOpacity={0.85}
            >
              <Navigation size={17} color={Palette.paper100} strokeWidth={2} />
              <Text style={[Typography.button, styles.mapsButtonText]}>
                Open in Maps
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* Floating header controls */}
      <View style={[styles.floatingHeader, { top: insets.top + 8 }]}>
        <IconButton
          icon="back"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          style={styles.floatingButton}
          color={Palette.paper0}
          iconSize={22}
          strokeWidth={2.2}
          activeOpacity={0.8}
        />

        <IconButton
          icon="edit"
          onPress={enterEditMode}
          accessibilityLabel="Edit spot"
          style={styles.floatingButton}
          color={Palette.paper0}
          strokeWidth={2.2}
          activeOpacity={0.8}
        />
      </View>
    </View>
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
    gap: 12,
  },
  backLink: {
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActionText: {
    fontFamily: FontFamily.medium,
    fontSize: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.space2,
  },
  saveButton: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.space4,
    paddingVertical: Spacing.space2,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  saveButtonText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 15,
  },
  editContent: {
    paddingHorizontal: Spacing.space4,
    paddingTop: Spacing.space6,
    paddingBottom: 24,
    gap: Spacing.space6,
  },
  heroScrollContent: {
    paddingBottom: 24,
  },
  hero: {
    width: "100%",
    height: HERO_HEIGHT,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  sheet: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.space6,
    paddingTop: Spacing.space6,
    gap: Spacing.space4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.space3,
  },
  titleText: {
    flex: 1,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.space2,
    marginTop: -Spacing.space2,
  },
  addressIcon: {
    marginTop: 3,
  },
  addressText: {
    flex: 1,
  },
  galleryWrap: {
    marginHorizontal: -Spacing.space6,
    paddingHorizontal: Spacing.space6,
  },
  notes: {
    marginTop: -Spacing.space1,
  },
  floatingHeader: {
    position: "absolute",
    left: Spacing.space4,
    right: Spacing.space4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  floatingButton: {
    backgroundColor: "rgba(20, 32, 26, 0.45)",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  tagPillText: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
  mapsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.space2,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: Spacing.space2,
  },
  mapsButtonText: {
    color: Palette.paper100,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: 13,
  },
});
