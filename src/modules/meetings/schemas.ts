import { z } from "zod";

export const meetingsInsertSchema = z.object({
    name: z.string().min(1, { message: "Name is required" }),
    agentId: z.string().min(1, { message: "meeting is required" }),
});

export const MeetingsUpdateSchema = meetingsInsertSchema.extend({
    id: z.string().min(1, { message: "ID is required" }),
});

