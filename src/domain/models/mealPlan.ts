import { z } from "zod";

export const WeekdaySchema = z.enum([
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]);
export const MealTypeSchema = z.enum(["lunch", "dinner"]);

export const MealIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().finite().positive(),
  unit: z.string().trim().min(1).max(40),
  foodItemId: z.string().uuid().optional(),
});

export const MealRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  ingredients: z.array(MealIngredientSchema).min(1).max(40),
});

export const ScheduleRequestSchema = z.object({ mealId: z.string().min(1).max(120) });

export type MealRequest = z.infer<typeof MealRequestSchema>;
export type MealIngredient = z.infer<typeof MealIngredientSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;
export type MealType = z.infer<typeof MealTypeSchema>;

export const DEFAULT_MEALS = [
  { id: "default-jollof-rice", name: "Jollof rice", description: "Nigerian party-style tomato rice", ingredients: [
    { name: "Rice", quantity: 2, unit: "cups" }, { name: "Tomato", quantity: 5, unit: "pieces" },
    { name: "Red bell pepper", quantity: 2, unit: "pieces" }, { name: "Onion", quantity: 2, unit: "pieces" },
    { name: "Cooking oil", quantity: 0.25, unit: "litres" },
  ]},
  { id: "default-egusi-soup", name: "Egusi soup", description: "Melon seed soup with leafy vegetables", ingredients: [
    { name: "Ground egusi", quantity: 2, unit: "cups" }, { name: "Spinach", quantity: 1, unit: "bunches" },
    { name: "Palm oil", quantity: 0.25, unit: "litres" }, { name: "Stockfish", quantity: 300, unit: "grams" },
  ]},
  { id: "default-beans-plantain", name: "Beans and plantain", description: "Stewed beans with ripe plantain", ingredients: [
    { name: "Beans", quantity: 2, unit: "cups" }, { name: "Plantain", quantity: 3, unit: "pieces" },
    { name: "Palm oil", quantity: 0.15, unit: "litres" }, { name: "Onion", quantity: 1, unit: "pieces" },
  ]},
  { id: "default-yam-egg-sauce", name: "Yam and egg sauce", description: "Boiled yam with tomato egg sauce", ingredients: [
    { name: "Yam", quantity: 1, unit: "tubers" }, { name: "Egg", quantity: 4, unit: "pieces" },
    { name: "Tomato", quantity: 3, unit: "pieces" }, { name: "Onion", quantity: 1, unit: "pieces" },
  ]},
  { id: "default-pounded-yam-efo-riro", name: "Pounded yam and efo riro", description: "Yam swallow with spinach stew", ingredients: [
    { name: "Yam flour", quantity: 3, unit: "cups" }, { name: "Spinach", quantity: 2, unit: "bunches" },
    { name: "Red bell pepper", quantity: 3, unit: "pieces" }, { name: "Palm oil", quantity: 0.25, unit: "litres" },
  ]},
  { id: "default-fried-rice-chicken", name: "Nigerian fried rice and chicken", description: "Seasoned rice, vegetables, and chicken", ingredients: [
    { name: "Rice", quantity: 2, unit: "cups" }, { name: "Mixed vegetables", quantity: 2, unit: "cups" },
    { name: "Chicken", quantity: 1, unit: "kilograms" }, { name: "Cooking oil", quantity: 0.2, unit: "litres" },
  ]},
  { id: "default-moi-moi", name: "Moi moi", description: "Steamed bean pudding", ingredients: [
    { name: "Beans", quantity: 2, unit: "cups" }, { name: "Red bell pepper", quantity: 2, unit: "pieces" },
    { name: "Onion", quantity: 1, unit: "pieces" }, { name: "Cooking oil", quantity: 0.15, unit: "litres" },
  ]},
] as const;
