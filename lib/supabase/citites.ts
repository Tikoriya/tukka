import { City, NewCity } from "@/types";
import { supabase } from "../../utils/supabase";

type CityWithSpots = City & { spots?: { id: number }[] };

const citiesApi = {
  fetchCities: async (): Promise<CityWithSpots[]> => {
    const { data, error } = await supabase
      .from("cities")
      .select("*, spots(id)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as CityWithSpots[]) || [];
  },

  createCity: async (city: NewCity): Promise<City> => {
    const { data, error } = await supabase
      .from("cities")
      .insert([city])
      .select()
      .single();

    if (error) {
      console.error("Error creating city:", error);
      throw error;
    }
    return data as City;
  },

  getCity: async (cityId: number): Promise<City | null> => {
    const { data, error } = await supabase
      .from("cities")
      .select("*")
      .eq("id", cityId)
      .single();
    if (error) return null;
    return data as City;
  },

  updateCity: async ({
    cityId,
    updates,
  }: {
    cityId: number;
    updates: Partial<Omit<City, "id" | "created_at">>;
  }): Promise<City> => {
    const { data, error } = await supabase
      .from("cities")
      .update(updates)
      .eq("id", cityId)
      .select()
      .single();
    if (error) throw error;
    return data as City;
  },

  deleteCity: async (cityId: number): Promise<City> => {
    const { data, error } = await supabase
      .from("cities")
      .delete()
      .eq("id", cityId)
      .select()
      .single();
    if (error) throw error;
    return data as City;
  },
};

export default citiesApi;
