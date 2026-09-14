//this is the Stack Layout for cities flow
import { Stack } from "expo-router";

export default function CitiesStackLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ headerShown: false, title: "Cities" }}
      />
      <Stack.Screen name="create" options={{ headerShown: false }} />
      <Stack.Screen name="edit" options={{ headerShown: false }} />
      <Stack.Screen name="create-spot" options={{ headerShown: false }} />
      <Stack.Screen
        name="label"
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen name="[cityid]" options={{ headerShown: false }} />
    </Stack>
  );
}
