import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { agentsInsertSchema } from "../schemas";
import { z } from "zod";
import { and, count, desc, eq, getTableColumns, ilike, sql } from "drizzle-orm";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants";

export const agentsRouter = createTRPCRouter({
    getOne: protectedProcedure.input(z.object({id: z.string()})).query(async ({ input }) => {
        const [existingAgent] = await db
            .select({
                meetingsCount: sql<number>`5`, // Placeholder for meetings count
                ...getTableColumns(agents),
            })
            .from(agents)
            .where(eq(agents.id, input.id));

        return existingAgent;
    }),

    getMany: protectedProcedure
        .input(
            z.object({
                page: z.number().min(1).default(DEFAULT_PAGE),
                pageSize: z
                    .number()
                    .min(MIN_PAGE_SIZE)
                    .max(MAX_PAGE_SIZE)
                    .default(DEFAULT_PAGE_SIZE),
                search: z.string().nullish(),
            })
        )
        .query(async ({ ctx, input = {} }) => {
            const { search, page, pageSize } = input;
            const data = await db
                .select({
                    meetingsCount: sql<number>`1`, // Placeholder for meetings count
                    ...getTableColumns(agents),
                })
                .from(agents)
                .where(
                    and(
                        eq(agents.userId, ctx.auth.user.id),
                        search ? ilike(agents.name, `%${search}%`) : undefined,
                    )
                )
                .orderBy(desc(agents.createdAt), desc(agents.id))
                .limit(pageSize ?? DEFAULT_PAGE_SIZE)
                .offset(((page ?? DEFAULT_PAGE) - 1) * (pageSize ?? DEFAULT_PAGE_SIZE));

            const [total] = await db
                .select({count: count()})
                .from(agents)
                .where(
                    and(
                        eq(agents.userId, ctx.auth.user.id),
                        search ? ilike(agents.name, `%${search}%`) : undefined,
                    )
                );

            const totalPages = Math.ceil(total.count / (pageSize ?? DEFAULT_PAGE_SIZE));
            return{
                items: data,
                total: total.count,
                totalPages,
            }
        }),

    create: protectedProcedure
        .input(agentsInsertSchema)
        .mutation(async ({ input, ctx }) => {
            const [createdAgent] = await db
                .insert(agents)
                .values({
                    ...input,
                    userId: ctx.auth.user.id,
                })
                .returning();
        }),

});