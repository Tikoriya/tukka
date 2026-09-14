import { deletePhotosFromStorage } from "@/lib/services/photoUpload";
import { spotPhotosApi } from "@/lib/supabase/spot_photos";
import { tagsSpotsApi } from "@/lib/supabase/tags_spots";
import { NewSpot, Spot, SpotWithTags } from "@/types";
import { supabase } from "@/utils/supabase";

const SPOT_WITH_TAGS_SELECT = "*, tags:tags(*), spot_photos(url, position)";

export const SPOTS_PAGE_SIZE = 20;

// Keyset cursor: the previous page's last row, used to walk strictly forward.
export type SpotsCursor = { createdAt: string; id: number };

export const spotsApi = {

    fetchSpots: async (cityId: number): Promise<SpotWithTags[]> => {
        const { data, error } = await supabase
        .from("spots")
        .select(SPOT_WITH_TAGS_SELECT)
        .eq("city_id", cityId)
        .order("created_at", { ascending: false });
    
        if (error) throw error;
        return data || [];
    },

    // Tag filtering runs in Postgres (filter_city_spots) so the client never
    // pulls every spot to filter in JS. The RPC returns base spot rows in order;
    // hydrateSpots then re-attaches each spot's full tag/photo set so cards still
    // show ALL of a spot's tags, not only the ones that were filtered on.
    filterCitySpots: async (
        cityId: number,
        tagIds: number[],
        matchAll = false,
        limit: number = SPOTS_PAGE_SIZE,
        cursor?: SpotsCursor,
    ): Promise<SpotWithTags[]> => {
        const { data, error } = await supabase.rpc("filter_city_spots", {
            p_city_id: cityId,
            p_tag_ids: tagIds,
            p_match_all: matchAll,
            p_limit: limit,
            p_cursor_created_at: cursor?.createdAt ?? null,
            p_cursor_id: cursor?.id ?? null,
        });
        if (error) throw error;
        const orderedIds: number[] = (data ?? []).map((spot: Spot) => spot.id);
        return spotsApi.hydrateSpots(orderedIds);
    },

    hydrateSpots: async (orderedIds: number[]): Promise<SpotWithTags[]> => {
        if (orderedIds.length === 0) return [];
        const { data, error } = await supabase
        .from("spots")
        .select(SPOT_WITH_TAGS_SELECT)
        .in("id", orderedIds);
        if (error) throw error;
        const byId = new Map<number, SpotWithTags>(
            (data ?? []).map((spot: SpotWithTags) => [spot.id, spot]),
        );
        return orderedIds
            .map((id) => byId.get(id))
            .filter((spot): spot is SpotWithTags => spot !== undefined);
    },

    getSpot: async (spotId: number): Promise<Spot | null> => {
        const { data, error } = await supabase
        .from("spots")
        .select("*, tags:tags(*)")
        .eq("id", spotId)
        .single();
        if (error) return null;
        return data as Spot;
    },

    createSpot: async (spot: NewSpot): Promise<Spot> => {
        const { data, error } = await supabase
        .from("spots")
        .insert([spot])
        .select()
        .single()

        if (error) throw error;
        return data || [];
    },

    addTagsToSpot: async (spotId: number, tagIds: number[]): Promise<void> => {
        const { error } = await supabase
        .from("spot_tags")
        .insert(
            tagIds.map((tagId) => ({
            spot_id: spotId,
            tag_id: tagId,
            }))
        );
        if (error) throw error;
    },
    updateSpot: async ({ spotId, updates }: { spotId: number; updates: Partial<Omit<Spot, 'id' | 'created_at'>> }): Promise<Spot> => {
        const { data, error } = await supabase
        .from("spots")
        .update(updates)
        .eq("id", spotId)
        .select()
        .single();

        if (error) throw error;
        return data;
    },

    deleteSpot: async (spotId: number): Promise<Spot> => {
        const photos = await spotPhotosApi.fetchForSpot(spotId);
        await tagsSpotsApi.deleteSpotTags(spotId);
        await spotPhotosApi.deleteForSpot(spotId);
        await deletePhotosFromStorage(photos.map((photo) => photo.url));

        const { data, error } = await supabase
        .from("spots")
        .delete()
        .eq("id", spotId)
        .select()
        .single()

        if (error) throw error;
        return data;
    }
  // ...other spot API methods
};