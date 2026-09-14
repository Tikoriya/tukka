import citiesApi from "@/lib/supabase/citites";
import { City } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useCity(cityId: string) {
  const cityIdInt = parseInt(cityId);
  const queryClient = useQueryClient();

  const {data, error, isLoading, refetch} = useQuery<City | null, Error>({
    queryKey: ["city", cityId],
    queryFn: async () => { 
      const city = await citiesApi.getCity(cityIdInt);
      return city;
    },
    enabled: !!cityId,
   })

   const {mutateAsync: mutateDeleteCity, isPending: isPendingDeleteCity} = useMutation({
    mutationFn: async (deleteId: number) => {
      return await citiesApi.deleteCity(deleteId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cities"] });
    },
  });

  const { mutateAsync: mutateUpdateCity, isPending: isPendingUpdateCity } =
    useMutation({
      mutationFn: citiesApi.updateCity,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["cities"] });
        queryClient.invalidateQueries({ queryKey: ["city", cityId] });
      },
      onError: (updateError) => {
        console.error("Error updating city:", updateError);
      },
    });
    
    return {
        city: data,
        error,
        isLoading,
        refetchCity: refetch,
        deleteCity: mutateDeleteCity,
        isPendingDeleteCity,
        updateCity: mutateUpdateCity,
        isPendingUpdateCity,
    };
}