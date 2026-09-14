import { AlertCircle } from "lucide-react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { SafeAreaView } from "react-native-safe-area-context";

import { Input } from "@/components/ui/Input";
import { Colors, Palette } from "@/constants/Colors";
import { Radius, Spacing } from "@/constants/Theme";
import { FontFamily, Typography } from "@/constants/Typography";
import { useCity } from "@/hooks/useCity";
import { citySchema, CityFormValues } from "@/lib/schemas/city";
import { unsplashService } from "@/lib/services/unsplash";
import { zodResolver } from "@hookform/resolvers/zod";

const CITY_GRADIENTS: [string, string][] = [
  ["#2B3D34", "#3C4F44"],
  ["#3A4F44", "#6F8378"],
  ["#1C2A23", "#3A4F44"],
  ["#33453B", "#3C4F44"],
  ["#2B3D34", "#6F8378"],
  ["#14201A", "#2B3D34"],
];

function gradientForName(name: string): [string, string] {
  if (!name) return CITY_GRADIENTS[0];
  return CITY_GRADIENTS[name.charCodeAt(0) % CITY_GRADIENTS.length];
}

type EditCityRouteParams = {
  cityid: string;
  cityName?: string;
};

export default function EditCityScreen() {
  const { cityid, cityName } = useLocalSearchParams<EditCityRouteParams>();
  const router = useRouter();
  const { city, isLoading, error, updateCity } = useCity(cityid);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  const [suggestedPhotoUrl, setSuggestedPhotoUrl] = useState<string | null>(
    null,
  );
  const [photoPage, setPhotoPage] = useState(1);
  const [userPhotoUri, setUserPhotoUri] = useState<string | null>(null);
  const [isFetchingPhoto, setIsFetchingPhoto] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [initialPhotoUrl, setInitialPhotoUrl] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CityFormValues>({
    resolver: zodResolver(citySchema),
    defaultValues: {
      country: "",
    },
  });

  useEffect(() => {
    if (!city) return;
    reset({ country: city.country ?? "" });
    setSuggestedPhotoUrl(city.imageUrl);
    setInitialPhotoUrl(city.imageUrl);
    setUserPhotoUri(null);
    setPhotoPage(1);
    setPhotoError(null);
  }, [city, reset]);

  const activePhotoUrl = userPhotoUri ?? suggestedPhotoUrl;
  const displayName = city?.name ?? cityName ?? "City";
  const gradient = gradientForName(displayName);
  const showSpinner = isFetchingPhoto || isImageLoading;
  const photoChanged = activePhotoUrl !== initialPhotoUrl;
  const canSave = (isDirty || photoChanged) && !isSubmitting;

  const fetchPhoto = useCallback(async (query: string, page: number) => {
    setIsFetchingPhoto(true);
    setPhotoError(null);
    try {
      const photo = await unsplashService.searchCityPhoto(query, page);
      if (photo?.urls.regular) {
        setSuggestedPhotoUrl(photo.urls.regular);
        setUserPhotoUri(null);
      } else {
        setPhotoError("No photo found — the current image will be kept.");
      }
    } catch (fetchError) {
      setPhotoError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not load a photo. Please try again.",
      );
    } finally {
      setIsFetchingPhoto(false);
    }
  }, []);

  const handleTryAnother = () => {
    if (!displayName.trim() || isFetchingPhoto) return;
    const nextPage = photoPage + 1;
    setPhotoPage(nextPage);
    fetchPhoto(displayName.trim(), nextPage);
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Please allow photo library access in Settings to choose a cover photo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });

    if (!result.canceled) {
      setPhotoError(null);
      setUserPhotoUri(result.assets[0].uri);
    }
  };

  const onSave = async (values: CityFormValues) => {
    try {
      await updateCity({
        cityId: parseInt(cityid),
        updates: {
          country: values.country.trim() || null,
          imageUrl: activePhotoUrl ?? null,
        },
      });
      router.back();
    } catch {
      Alert.alert("Error", "Could not save city. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (error || !city) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={[Typography.body, { color: theme.textSecondary }]}>
          Could not load city.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={[Typography.secondary, { color: theme.accent }]}>
            Go back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.background }]}
      edges={["top", "bottom"]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[styles.headerActionText, { color: theme.textSecondary }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSubmit(onSave)}
          disabled={!canSave}
          activeOpacity={0.85}
          style={[
            styles.saveButton,
            {
              backgroundColor: canSave ? theme.accent : theme.surfaceElevated,
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
      </View>

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[Typography.title, { color: theme.text }]}>
            {displayName}
          </Text>

          <View style={styles.imageCard}>
            {activePhotoUrl ? (
              <Image
                source={{ uri: activePhotoUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={250}
                onLoadStart={() => setIsImageLoading(true)}
                onLoad={() => setIsImageLoading(false)}
                onError={() => {
                  setIsImageLoading(false);
                  setPhotoError("Could not load the photo. Please try again.");
                }}
              />
            ) : (
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}

            {showSpinner ? (
              <View style={styles.loaderOverlay} pointerEvents="none">
                <ActivityIndicator size="large" color={Palette.paper0} />
              </View>
            ) : null}
          </View>

          {photoError ? (
            <View style={styles.noticeRow}>
              <AlertCircle size={14} color={theme.error} />
              <Text style={[styles.noticeText, { color: theme.error }]}>
                {photoError}
              </Text>
            </View>
          ) : null}

          <View style={styles.tertiaryRow}>
            <TouchableOpacity
              onPress={handleTryAnother}
              disabled={isFetchingPhoto}
              activeOpacity={0.7}
            >
              <Text style={[styles.tertiary, { color: theme.accent }]}>
                Try another
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePickFromLibrary}
              activeOpacity={0.7}
            >
              <Text style={[styles.tertiary, { color: theme.accent }]}>
                {userPhotoUri ? "Change photo" : "Choose from library"}
              </Text>
            </TouchableOpacity>
          </View>

          <Controller
            control={control}
            name="country"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Country"
                placeholder="e.g. Japan, France, USA"
                error={errors.country?.message}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSave)}
              />
            )}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  fill: {
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
  body: {
    paddingHorizontal: Spacing.space4,
    paddingTop: Spacing.space6,
    paddingBottom: Spacing.space6,
    gap: Spacing.space4,
  },
  imageCard: {
    width: "100%",
    height: 220,
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: Palette.forest800,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(20,32,26,0.25)",
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.space2,
  },
  noticeText: {
    ...Typography.secondary,
    flexShrink: 1,
  },
  tertiaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.space6,
  },
  tertiary: {
    ...Typography.label,
  },
});
