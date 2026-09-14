import { z } from 'zod';

export const citySchema = z.object({
  country: z.string(),
});

export type CityFormValues = z.infer<typeof citySchema>;
